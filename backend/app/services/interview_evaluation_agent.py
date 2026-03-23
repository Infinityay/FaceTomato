"""LLM-backed framework for structured mock interview evaluation."""

from __future__ import annotations

import json
import logging
from functools import lru_cache

from langchain.chat_models import init_chat_model
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.rate_limiters import InMemoryRateLimiter

from app.core.config import get_settings
from app.prompts.interview_review_prompts import get_interview_review_prompts
from app.schemas.interview_evaluation import (
    EvaluationFocusJudgment,
    EvaluationRubricScore,
    EvaluationTopicAssessment,
    InterviewEvaluationAgentInput,
    InterviewEvaluationReport,
    InterviewEvaluationSummary,
    InterviewSummaryEvaluationInput,
    InterviewTopicEvaluationInput,
)
from app.services.runtime_config import ResolvedRuntimeConfig
from app.utils.structured_output import invoke_with_fallback


logger = logging.getLogger(__name__)


class InterviewEvaluationAgent:
    """Generate a structured evaluation report from a mock interview snapshot."""

    @classmethod
    def from_runtime_config(
        cls, runtime_config: ResolvedRuntimeConfig
    ) -> "InterviewEvaluationAgent":
        return cls(
            model_provider=runtime_config.model_provider,
            api_key=runtime_config.api_key,
            base_url=runtime_config.base_url,
            model=runtime_config.model,
        )

    def __init__(
        self,
        model_provider: str | None = None,
        api_key: str | None = None,
        base_url: str | None = None,
        model: str | None = None,
        rate_limiter: InMemoryRateLimiter | None = None,
    ) -> None:
        settings = get_settings()
        active_config = settings.get_active_config()
        model_provider = model_provider or active_config["model_provider"]
        api_key = api_key or active_config["api_key"]
        base_url = base_url or active_config["base_url"]
        model = model or active_config["model"]

        if rate_limiter is None:
            rate_limiter = InMemoryRateLimiter(
                requests_per_second=settings.rate_limit_requests_per_second,
                check_every_n_seconds=settings.rate_limit_check_every_n_seconds,
                max_bucket_size=settings.rate_limit_max_bucket_size,
            )

        self.chat_model = self._create_chat_model(
            model_provider=model_provider,
            model=model,
            api_key=api_key,
            base_url=base_url,
            rate_limiter=rate_limiter,
        )
        self.topic_evaluation_llm = self.chat_model.with_structured_output(
            EvaluationTopicAssessment
        )
        self.summary_evaluation_llm = self.chat_model.with_structured_output(
            InterviewEvaluationSummary
        )
        self.prompts = get_interview_review_prompts()

    def _create_chat_model(
        self,
        model_provider: str,
        model: str,
        api_key: str | None,
        base_url: str | None,
        rate_limiter: InMemoryRateLimiter,
    ):
        if model_provider == "openai":
            kwargs = {
                "model": model,
                "model_provider": "openai",
                "api_key": api_key,
                "rate_limiter": rate_limiter,
            }
            if base_url:
                kwargs["base_url"] = base_url
            return init_chat_model(**kwargs)
        if model_provider == "google_genai":
            return init_chat_model(f"google_genai:{model}", rate_limiter=rate_limiter)
        if model_provider == "anthropic":
            return init_chat_model(
                model, model_provider="anthropic", rate_limiter=rate_limiter
            )
        raise ValueError(f"Unsupported model provider: {model_provider}")

    def _build_topic_messages(self, payload: InterviewTopicEvaluationInput):
        serialized = json.dumps(payload.model_dump(mode="json"), ensure_ascii=False, indent=2)
        return [
            SystemMessage(content=self.prompts["topic_evaluation"]),
            HumanMessage(content=f"topic_interview_slice:\n{serialized}"),
        ]

    def _build_summary_messages(self, payload: InterviewSummaryEvaluationInput):
        serialized = json.dumps(payload.model_dump(mode="json"), ensure_ascii=False, indent=2)
        return [
            SystemMessage(content=self.prompts["summary_evaluation"]),
            HumanMessage(content=f"topic_assessment_summary_input:\n{serialized}"),
        ]

    def evaluate(
        self, payload: InterviewEvaluationAgentInput
    ) -> InterviewEvaluationReport:
        try:
            topic_inputs = self._build_topic_inputs(payload)
            topic_assessments = [
                self._evaluate_topic(topic_input) for topic_input in topic_inputs
            ]
            summary_input = InterviewSummaryEvaluationInput(
                sessionId=payload.sessionId,
                jdText=payload.jdText,
                jdData=payload.jdData,
                resumeSnapshot=payload.resumeSnapshot,
                topicAssessments=topic_assessments,
            )
            summary = self._evaluate_summary(summary_input)
            return InterviewEvaluationReport(
                summary=summary.summary,
                overallScore=summary.overallScore,
                recommendation=summary.recommendation,
                strengths=summary.strengths,
                risks=summary.risks,
                priorityActions=summary.priorityActions,
                topicAssessments=topic_assessments,
            )
        except Exception:
            logger.exception(
                "Interview evaluation failed for session %s, using fallback report",
                payload.sessionId,
            )
            return self._build_fallback_report(payload)

    def _build_topic_inputs(
        self, payload: InterviewEvaluationAgentInput
    ) -> list[InterviewTopicEvaluationInput]:
        max_started_round = min(
            max(payload.interviewState.currentRound, 0),
            len(payload.interviewPlan.plan),
        )
        plan_items = payload.interviewPlan.plan[:max_started_round]
        transcript = list(payload.messages)
        current_index = 0
        topic_inputs: list[InterviewTopicEvaluationInput] = []

        for round_item in plan_items:
            topic_messages: list = []
            question = ""

            while current_index < len(transcript):
                message = transcript[current_index]
                current_index += 1
                if message.role == "assistant":
                    if not question:
                        question = message.content
                        topic_messages.append(message)
                    elif topic_messages:
                        current_index -= 1
                        break
                elif message.role == "user":
                    topic_messages.append(message)

            topic_inputs.append(
                InterviewTopicEvaluationInput(
                    sessionId=payload.sessionId,
                    jdText=payload.jdText,
                    jdData=payload.jdData,
                    resumeSnapshot=payload.resumeSnapshot,
                    roundNumber=round_item.round,
                    topic=round_item.topic,
                    topicDescription=round_item.description,
                    question=question or round_item.description,
                    transcript=topic_messages,
                )
            )

        return topic_inputs

    def _evaluate_topic(
        self, payload: InterviewTopicEvaluationInput
    ) -> EvaluationTopicAssessment:
        messages = self._build_topic_messages(payload)
        try:
            result = invoke_with_fallback(
                self.topic_evaluation_llm,
                messages,
                EvaluationTopicAssessment,
            )
            return result or self._build_fallback_topic_assessment(payload)
        except Exception:
            logger.exception(
                "Topic evaluation failed for session %s round %s, using fallback topic assessment",
                payload.sessionId,
                payload.roundNumber,
            )
            return self._build_fallback_topic_assessment(payload)

    def _evaluate_summary(
        self, payload: InterviewSummaryEvaluationInput
    ) -> InterviewEvaluationSummary:
        messages = self._build_summary_messages(payload)
        try:
            result = invoke_with_fallback(
                self.summary_evaluation_llm,
                messages,
                InterviewEvaluationSummary,
            )
            return result or self._build_fallback_summary(payload)
        except Exception:
            logger.exception(
                "Summary evaluation failed for session %s, using fallback summary",
                payload.sessionId,
            )
            return self._build_fallback_summary(payload)

    def _build_fallback_topic_assessment(
        self, payload: InterviewTopicEvaluationInput
    ) -> EvaluationTopicAssessment:
        answers = [message.content for message in payload.transcript if message.role == "user"]
        score = self._score_answers(answers)
        return EvaluationTopicAssessment(
            topic=payload.topic,
            question=payload.question or payload.topicDescription,
            assessmentFocus=[
                f"考察候选人是否能围绕 {payload.topic} 给出结构化回答",
                f"考察候选人是否能结合真实经历说明 {payload.topic} 的关键判断",
            ],
            answerHighlights=answers[:3],
            focusJudgments=[
                EvaluationFocusJudgment(
                    focus=f"考察候选人是否能围绕 {payload.topic} 给出结构化回答",
                    answerHighlightIndex=0 if len(answers) > 0 else None,
                    status="covered" if len(answers) > 0 else "missing",
                    reason="fallback 根据是否有对应回答生成",
                ),
                EvaluationFocusJudgment(
                    focus=f"考察候选人是否能结合真实经历说明 {payload.topic} 的关键判断",
                    answerHighlightIndex=1 if len(answers) > 1 else None,
                    status="covered" if len(answers) > 1 else "missing",
                    reason="fallback 根据是否有对应回答生成",
                ),
            ],
            strengths=self._build_strengths(payload.topic, answers),
            weaknesses=self._build_weaknesses(payload.topic, answers),
            followUps=[
                f"如果继续追问 {payload.topic}，需要补充哪些真实细节？",
                "是否能补上量化结果、验证方式和关键取舍？",
            ],
            suggestedAnswer=(
                f"回答 {payload.topic} 时，先讲背景和目标，再讲分析过程、关键动作和结果验证。"
            ),
            rubricScores=[
                EvaluationRubricScore(
                    name="structured_thinking",
                    score=score,
                    reason="fallback based on answer completeness",
                ),
                EvaluationRubricScore(
                    name="communication",
                    score=score,
                    reason="fallback based on answer completeness",
                ),
            ],
            overallScore=score,
        )

    def _build_fallback_summary(
        self, payload: InterviewSummaryEvaluationInput
    ) -> InterviewEvaluationSummary:
        overall_score = round(
            sum(item.overallScore for item in payload.topicAssessments)
            / max(len(payload.topicAssessments), 1)
        )
        weakest = min(
            payload.topicAssessments,
            key=lambda item: item.overallScore,
            default=None,
        )
        return InterviewEvaluationSummary(
            summary="基于当前面试记录生成了基础评价框架。当前 fallback 结果只依据回答长度和覆盖度，后续可替换为真实 LLM 评价。",
            overallScore=overall_score,
            recommendation="优先补足弱项 topic 的真实案例、量化结果和取舍表达。",
            strengths=[
                "已形成统一输入结构，可直接消费前端快照。",
                "已形成逐轮 topic 评价的标准输出。",
            ],
            risks=[
                "当前 fallback 只做启发式评分，不代表最终面试评价质量。",
                "尚未接入真实复盘生成链路和引用证据能力。",
            ],
            priorityActions=[
                "将前端快照映射到 InterviewEvaluationAgentInput。",
                f"优先增强 {weakest.topic if weakest else '弱项 topic'} 的案例与结果表达。",
                "在 generate_review 中接入真实 agent 调用。",
            ],
        )

    def _build_fallback_report(
        self, payload: InterviewEvaluationAgentInput
    ) -> InterviewEvaluationReport:
        topic_assessments = [
            self._build_fallback_topic_assessment(topic_input)
            for topic_input in self._build_topic_inputs(payload)
        ]
        summary = self._build_fallback_summary(
            InterviewSummaryEvaluationInput(
                sessionId=payload.sessionId,
                jdText=payload.jdText,
                jdData=payload.jdData,
                resumeSnapshot=payload.resumeSnapshot,
                topicAssessments=topic_assessments,
            )
        )
        return InterviewEvaluationReport(
            summary=summary.summary,
            overallScore=summary.overallScore,
            recommendation=summary.recommendation,
            strengths=summary.strengths,
            risks=summary.risks,
            priorityActions=summary.priorityActions,
            topicAssessments=topic_assessments,
        )

    @staticmethod
    def _score_answers(answers: list[str]) -> int:
        if not answers:
            return 55
        total_chars = sum(len(answer.strip()) for answer in answers)
        avg_chars = total_chars / max(len(answers), 1)
        score = 60 + min(16, int(avg_chars / 20)) + min(14, len(answers) * 4)
        return max(55, min(score, 88))

    @staticmethod
    def _build_strengths(topic: str, answers: list[str]) -> list[str]:
        if answers:
            return [
                f"{topic} 已有可分析的候选人回答。",
                "回答至少覆盖了问题的一部分主线。",
            ]
        return [f"{topic} 当前尚未沉淀足够回答内容。"]

    @staticmethod
    def _build_weaknesses(topic: str, answers: list[str]) -> list[str]:
        if len(answers) >= 2:
            return [
                f"{topic} 的回答仍缺少更明确的量化结果。",
                "案例细节、验证过程或取舍表达仍可继续补强。",
            ]
        return [
            f"{topic} 的回答样本不足，当前评价置信度有限。",
            "需要补充真实案例和完整表达链路。",
        ]


@lru_cache(maxsize=1)
def get_interview_evaluation_agent() -> InterviewEvaluationAgent:
    return InterviewEvaluationAgent()
