"""Interview review service backed by the interview evaluation agent."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from functools import lru_cache
import json
from uuid import uuid4

from langchain_core.messages import HumanMessage, SystemMessage

from app.prompts.interview_review_prompts import get_interview_review_prompts
from app.schemas.interview_evaluation import (
    InterviewEvaluationAgentInput,
    InterviewEvaluationReport,
)
from app.schemas.interview_review import (
    InterviewReviewSourceResponse,
    ReviewConversationMessage,
    ReviewExportReportResponse,
    ReviewGenerateReportResponse,
    ReviewMatchedAnswer,
    ReviewMessageCitation,
    ReviewMessageEvidence,
    ReviewMessageUsage,
    ReviewOptimizationRequest,
    ReviewOptimizationResponse,
    ReviewSessionDetail,
    ReviewSessionListItem,
    ReviewTopicOptimizationInput,
    ReviewTopicOptimizationResult,
    ReviewTopic,
    ReviewUploadSessionResponse,
)
from app.schemas.mock_interview import (
    MockInterviewDeveloperContext,
    MockInterviewSessionLimits,
    MockInterviewSessionSnapshot,
)
from app.services.interview_evaluation_agent import (
    InterviewEvaluationAgent,
    get_interview_evaluation_agent,
)
from app.services.mock_interview_service import MockInterviewService, get_mock_interview_service
from app.services.runtime_config import resolve_runtime_config
from app.utils.structured_output import invoke_with_fallback


def _format_datetime(value: datetime) -> str:
    return value.astimezone().strftime("%Y-%m-%d %H:%M")


def _normalize_whitespace(value: str) -> str:
    return " ".join(value.split()).strip()


def _shorten_text(value: str, limit: int) -> str:
    normalized = _normalize_whitespace(value)
    if len(normalized) <= limit:
        return normalized
    return f"{normalized[: max(limit - 1, 0)].rstrip()}…"


def _shorten_question(value: str) -> str:
    return _normalize_whitespace(value)


def _normalize_display_text(value: str) -> str:
    return _normalize_whitespace(value)


def _build_answer_highlights(item: object, focus_count: int) -> list[str]:
    raw_answers = [
        _normalize_display_text(answer)
        for answer in getattr(item, "answerHighlights", [])
        if isinstance(answer, str) and _normalize_whitespace(answer)
    ]
    if focus_count <= 0:
        return raw_answers[:3]

    answers = raw_answers[:focus_count]
    if len(answers) < focus_count:
        answers.extend(["未明确回答"] * (focus_count - len(answers)))
    return answers


def _build_matched_answers(
    assessment_focus: list[str],
    answer_highlights: list[str],
    focus_judgments: list[object] | None = None,
) -> list[ReviewMatchedAnswer]:
    focus_judgments = focus_judgments or []
    judgment_by_focus = {
        getattr(item, "focus", ""): item for item in focus_judgments if getattr(item, "focus", "")
    }
    matches: list[ReviewMatchedAnswer] = []
    for index, focus in enumerate(assessment_focus):
        answer = answer_highlights[index] if index < len(answer_highlights) else "未明确回答"
        judgment = judgment_by_focus.get(focus)
        answer_index = getattr(judgment, "answerHighlightIndex", None) if judgment else None
        status = getattr(judgment, "status", "") if judgment else ""
        reason = getattr(judgment, "reason", "") if judgment else ""
        if not status:
            status = "covered" if answer and answer != "未明确回答" else "missing"
        matches.append(
            ReviewMatchedAnswer(
                point=focus,
                answerHighlightIndex=(
                    answer_index
                    if answer_index is not None
                    else (index if answer and answer != "未明确回答" else None)
                ),
                status=status,
                reason=reason,
            )
        )
    return matches


def _rubric_name_to_label(name: str) -> str:
    mapping = {
        "structured_thinking": "结构化表达",
        "communication": "沟通表达",
        "domain_judgment": "领域判断",
        "evidence_and_metrics": "证据与量化",
        "authenticity": "真实性",
    }
    return mapping.get(name, name.replace("_", " ").strip() or "能力评估")


def _build_topic_evaluation(item: object) -> str:
    rubric_scores = getattr(item, "rubricScores", [])
    reasons = [score.reason.strip() for score in rubric_scores if getattr(score, "reason", "").strip()]
    if reasons:
        return reasons[0]

    strengths = getattr(item, "strengths", [])
    if strengths:
        return strengths[0]

    weaknesses = getattr(item, "weaknesses", [])
    if weaknesses:
        return f"当前短板：{weaknesses[0]}"

    question = getattr(item, "question", "").strip()
    topic = getattr(item, "topic", "当前主题")
    if question:
        return f"本题围绕“{question}”展开，建议继续补充更具体的案例、指标和取舍。"
    return f"{topic} 这一题已经生成结构化评估，建议继续补充案例细节和结果验证。"


def _build_optimized_answer(item: object) -> str:
    suggested_answer = getattr(item, "suggestedAnswer", "").strip()
    if suggested_answer:
        return suggested_answer

    topic = getattr(item, "topic", "当前主题")
    question = getattr(item, "question", "").strip()
    answers = getattr(item, "answerHighlights", [])
    answer_hint = answers[0].strip() if answers else ""

    if answer_hint:
        return (
            f"回答 {topic} 时，可以先用一句话交代背景和目标，再围绕你的真实做法展开。"
            f"基于你刚才提到的“{answer_hint}”，继续补充关键决策、取舍依据和最终结果。"
        )

    if question:
        return (
            f"回答 {topic} 时，先正面回应“{question}”，"
            "再按背景、行动、结果三个层次展开，补充量化指标和复盘结论。"
        )

    return f"回答 {topic} 时，先讲背景和目标，再讲关键动作、结果验证和复盘。"


@dataclass(slots=True)
class StoredReview:
    detail: ReviewSessionDetail
    conversations: dict[str, list[ReviewConversationMessage]] = field(default_factory=dict)


class InterviewReviewService:
    """Generate interview review reports from the canonical mock interview snapshot."""

    def __init__(
        self,
        mock_interview_service: MockInterviewService | None = None,
        evaluation_agent: InterviewEvaluationAgent | None = None,
    ) -> None:
        self._mock_interview_service = mock_interview_service or get_mock_interview_service()
        self._evaluation_agent = evaluation_agent or get_interview_evaluation_agent()
        self._generated_reviews: dict[str, StoredReview] = {}
        self._uploaded_snapshots: dict[str, MockInterviewSessionSnapshot] = {}
        self._review_prompts = get_interview_review_prompts()

    def list_reviews(self) -> list[ReviewSessionListItem]:
        items: list[ReviewSessionListItem] = []
        if hasattr(self._mock_interview_service, "list_review_sources"):
            for source in self._mock_interview_service.list_review_sources():
                generated = self._generated_reviews.get(source.sessionId)
                snapshot = self._build_snapshot_from_source(source)
                items.append(
                    ReviewSessionListItem(
                        id=source.sessionId,
                        title=self._derive_title(snapshot),
                        role=self._derive_role(snapshot),
                        round="模拟面试",
                        interviewAt=_format_datetime(snapshot.createdAt),
                        reportStatus="ready" if generated else "pending",
                        overallScore=generated.detail.overallScore if generated else None,
                        topicCount=len(generated.detail.topics) if generated else snapshot.interviewPlan.total_rounds,
                    )
                )
            existing_ids = {item.id for item in items}
            for session_id, snapshot in self._uploaded_snapshots.items():
                if session_id in existing_ids:
                    continue
                generated = self._generated_reviews.get(session_id)
                items.append(
                    ReviewSessionListItem(
                        id=session_id,
                        title=self._derive_title(snapshot),
                        role=self._derive_role(snapshot),
                        round="模拟面试",
                        interviewAt=_format_datetime(snapshot.createdAt),
                        reportStatus="ready" if generated else "pending",
                        overallScore=generated.detail.overallScore if generated else None,
                        topicCount=len(generated.detail.topics) if generated else snapshot.interviewPlan.total_rounds,
                    )
                )
            return items

        for session_id, stored in self._generated_reviews.items():
            items.append(
                ReviewSessionListItem(
                    id=session_id,
                    title=stored.detail.title,
                    role=stored.detail.role,
                    round=stored.detail.round,
                    interviewAt=stored.detail.interviewAt,
                    reportStatus=stored.detail.reportStatus,
                    overallScore=stored.detail.overallScore,
                    topicCount=len(stored.detail.topics),
                )
            )
        for session_id, snapshot in self._uploaded_snapshots.items():
            if session_id in self._generated_reviews:
                continue
            items.append(
                ReviewSessionListItem(
                    id=session_id,
                    title=self._derive_title(snapshot),
                    role=self._derive_role(snapshot),
                    round="模拟面试",
                    interviewAt=_format_datetime(snapshot.createdAt),
                    reportStatus="pending",
                    overallScore=None,
                    topicCount=snapshot.interviewPlan.total_rounds,
                )
            )
        return items

    def upload_snapshot(
        self,
        snapshot: MockInterviewSessionSnapshot,
    ) -> ReviewUploadSessionResponse:
        self._uploaded_snapshots[snapshot.sessionId] = snapshot
        generated = self._generated_reviews.get(snapshot.sessionId)
        return ReviewUploadSessionResponse(
            sessionId=snapshot.sessionId,
            title=self._derive_title(snapshot),
            role=self._derive_role(snapshot),
            round="模拟面试",
            interviewAt=_format_datetime(snapshot.createdAt),
            reportStatus="ready" if generated else "pending",
            topicCount=len(generated.detail.topics) if generated else snapshot.interviewPlan.total_rounds,
        )

    def get_review(self, session_id: str) -> ReviewSessionDetail | None:
        stored = self._generated_reviews.get(session_id)
        return stored.detail if stored else None

    def build_agent_input_from_snapshot(
        self, snapshot: MockInterviewSessionSnapshot
    ) -> InterviewEvaluationAgentInput:
        return InterviewEvaluationAgentInput(
            sessionId=snapshot.sessionId,
            jdText=snapshot.jdText,
            jdData=snapshot.jdData,
            resumeSnapshot=snapshot.resumeSnapshot,
            interviewPlan=snapshot.interviewPlan,
            interviewState=snapshot.interviewState,
            messages=snapshot.messages,
        )

    def generate_review(
        self,
        session_id: str,
        snapshot: MockInterviewSessionSnapshot | None = None,
    ) -> ReviewGenerateReportResponse | None:
        resolved_snapshot = snapshot or self._load_snapshot_for_session(session_id)
        if resolved_snapshot is None:
            return None

        agent_input = self.build_agent_input_from_snapshot(resolved_snapshot)
        runtime_config_request = resolved_snapshot.runtimeConfig
        evaluation_agent = (
            InterviewEvaluationAgent.from_runtime_config(resolve_runtime_config(runtime_config_request))
            if runtime_config_request
            else self._evaluation_agent
        )
        evaluation = evaluation_agent.evaluate(agent_input)
        detail = self._build_review_detail_from_evaluation(resolved_snapshot, evaluation)
        self._generated_reviews[session_id] = StoredReview(detail=detail)
        return ReviewGenerateReportResponse(sessionId=session_id, reportStatus="ready")

    def export_review(self, session_id: str) -> ReviewExportReportResponse | None:
        if session_id not in self._generated_reviews:
            generated = self.generate_review(session_id)
            if generated is None:
                return None
        return ReviewExportReportResponse(
            sessionId=session_id,
            exportStatus="ready",
            downloadUrl=f"/api/interview-reviews/{session_id}/export/download",
            fileName=f"interview-review-{session_id}.json",
        )

    def optimize_topic(self, request: ReviewOptimizationRequest) -> ReviewOptimizationResponse | None:
        stored = self._generated_reviews.get(request.sessionId)
        if stored is None:
            generated = self.generate_review(request.sessionId)
            if generated is None:
                return None
            stored = self._generated_reviews[request.sessionId]

        topic = next((item for item in stored.detail.topics if item.id == request.topicId), None)
        if topic is None:
            return None

        optimization = self._optimize_topic_with_llm(topic, request)

        existing_conversation = list(request.conversation)
        user_message = ReviewConversationMessage(
            messageId=f"user-{uuid4()}",
            sessionId=request.sessionId,
            topicId=request.topicId,
            role="user",
            content=request.message,
            createdAt=datetime.utcnow(),
        )
        assistant_message = ReviewConversationMessage(
            messageId=f"assistant-{uuid4()}",
            sessionId=request.sessionId,
            topicId=request.topicId,
            role="assistant",
            content=optimization.reply,
            createdAt=datetime.utcnow(),
            citations=[
                ReviewMessageCitation(
                    id=f"topic-{topic.id}",
                    label=f"{topic.name} 当前复盘",
                    snippet=topic.evaluation,
                ),
                ReviewMessageCitation(
                    id=f"question-{topic.id}",
                    label=f"{topic.name} 核心问题",
                    snippet=topic.coreQuestion,
                )
            ],
            evidence=[
                ReviewMessageEvidence(
                    id=f"evaluation-{topic.id}",
                    type="evaluation",
                    content=topic.evaluation,
                ),
                ReviewMessageEvidence(
                    id=f"optimized-answer-{topic.id}",
                    type="optimized_answer",
                    content=optimization.optimizedAnswer,
                )
            ],
            usage=ReviewMessageUsage(
                inputTokens=max(12, len(request.message) // 2),
                outputTokens=max(24, len(optimization.reply) // 2 if optimization.reply else 24),
                totalTokens=max(36, (len(request.message) + len(optimization.reply or "")) // 2),
            ),
            suggestions=optimization.suggestions,
        )

        conversation = [*existing_conversation, user_message, assistant_message]
        stored.conversations[request.topicId] = conversation
        return ReviewOptimizationResponse(
            topicId=request.topicId,
            reply=assistant_message.content,
            optimizedAnswer=optimization.optimizedAnswer,
            suggestions=optimization.suggestions,
            message=assistant_message,
            conversation=conversation,
        )

    def _build_topic_problem_summary(self, topic: ReviewTopic) -> list[str]:
        problem_lines = [
            item.reason.strip()
            for item in topic.matchedAnswers
            if item.status != "covered" and item.reason.strip()
        ]
        weakness_lines = [item.strip() for item in topic.weaknesses if item.strip()]
        merged = [*problem_lines, *weakness_lines]
        if merged:
            return list(dict.fromkeys(merged))
        return ["当前回答仍需补充更具体的细节、结构和结果表达。"]

    def _build_topic_optimization_input(
        self,
        topic: ReviewTopic,
        request: ReviewOptimizationRequest,
    ) -> ReviewTopicOptimizationInput:
        return ReviewTopicOptimizationInput(
            sessionId=request.sessionId,
            topicId=request.topicId,
            topicName=topic.name,
            coreQuestion=topic.coreQuestion,
            problems=self._build_topic_problem_summary(topic),
            answerHighlights=topic.answerHighlights,
            strengths=topic.strengths,
            weaknesses=topic.weaknesses,
            existingSuggestions=topic.suggestions,
            existingOptimizedAnswer=topic.optimizedAnswer,
            latestUserMessage=request.message,
            conversation=request.conversation,
        )

    def _build_topic_optimization_messages(
        self,
        payload: ReviewTopicOptimizationInput,
        prompts: dict[str, str],
    ):
        serialized = json.dumps(payload.model_dump(mode="json"), ensure_ascii=False, indent=2)
        return [
            SystemMessage(content=prompts["topic_optimization"]),
            HumanMessage(content=f"topic_optimization_input:\n{serialized}"),
        ]

    def _build_fallback_topic_optimization(
        self,
        topic: ReviewTopic,
        request: ReviewOptimizationRequest,
    ) -> ReviewTopicOptimizationResult:
        problems = self._build_topic_problem_summary(topic)
        return ReviewTopicOptimizationResult(
            reply=(
                f"你这题当前主要问题是：{problems[0]} "
                f"建议先正面回应“{topic.coreQuestion}”，再按背景、动作、结果顺序补齐关键缺口。"
            ),
            optimizedAnswer=topic.optimizedAnswer or _build_optimized_answer(topic),
            suggestions=(topic.suggestions[:3] if topic.suggestions else [
                "先正面回答核心问题，不要先铺背景。",
                "补齐缺失的关键动作、取舍依据或结果。",
                "用一句话收束结论，避免回答发散。",
            ]),
        )

    def _optimize_topic_with_llm(
        self,
        topic: ReviewTopic,
        request: ReviewOptimizationRequest,
    ) -> ReviewTopicOptimizationResult:
        payload = self._build_topic_optimization_input(topic, request)
        try:
            optimizer_agent = (
                InterviewEvaluationAgent.from_runtime_config(resolve_runtime_config(request.runtimeConfig))
                if request.runtimeConfig
                else self._evaluation_agent
            )
            optimization_llm = optimizer_agent.chat_model.with_structured_output(
                ReviewTopicOptimizationResult
            )
            prompts = optimizer_agent.prompts if hasattr(optimizer_agent, "prompts") else self._review_prompts
            messages = self._build_topic_optimization_messages(payload, prompts)
            result = invoke_with_fallback(
                optimization_llm,
                messages,
                ReviewTopicOptimizationResult,
            )
            return result or self._build_fallback_topic_optimization(topic, request)
        except Exception:
            return self._build_fallback_topic_optimization(topic, request)

    def _load_snapshot_for_session(
        self, session_id: str
    ) -> MockInterviewSessionSnapshot | None:
        uploaded = self._uploaded_snapshots.get(session_id)
        if uploaded is not None:
            return uploaded
        if not hasattr(self._mock_interview_service, "get_review_source"):
            return None
        source = self._mock_interview_service.get_review_source(session_id)
        if source is None:
            return None
        return self._build_snapshot_from_source(source)

    def _build_snapshot_from_source(
        self, source: InterviewReviewSourceResponse
    ) -> MockInterviewSessionSnapshot:
        return MockInterviewSessionSnapshot(
            sessionId=source.sessionId,
            interviewType=source.interviewMeta.interviewType,
            category=source.interviewMeta.category,
            status=source.status if source.status in {"ready", "streaming", "completed", "expired"} else "ready",
            limits=MockInterviewSessionLimits(),
            jdText=source.jd.text,
            jdData=source.jd.data,
            resumeSnapshot=source.resume.snapshot,
            retrieval=source.interview.retrieval,
            interviewPlan=source.interview.plan,
            interviewState=source.interview.state,
            messages=source.interview.messages,
            developerContext=MockInterviewDeveloperContext(),
            developerTrace=[],
            runtimeConfig=None,
            resumeFingerprint=source.resume.fingerprint,
            createdAt=source.createdAt,
            lastActiveAt=source.updatedAt,
            expiresAt=source.expiresAt,
        )

    def _build_review_detail_from_evaluation(
        self,
        snapshot: MockInterviewSessionSnapshot,
        evaluation: InterviewEvaluationReport,
    ) -> ReviewSessionDetail:
        topics: list[ReviewTopic] = []
        for index, item in enumerate(evaluation.topicAssessments, start=1):
            assessment_focus = [
                _normalize_display_text(focus)
                for focus in item.assessmentFocus
                if isinstance(focus, str) and _normalize_whitespace(focus)
            ]
            if not assessment_focus:
                topic_name = _normalize_whitespace(item.topic) or "当前题目"
                assessment_focus = [
                    _shorten_text(f"考察是否能围绕{topic_name}结构化作答", 32),
                    "考察是否能给出真实细节和结果",
                ]
            answer_highlights = _build_answer_highlights(item, len(assessment_focus))
            matched_answers = _build_matched_answers(
                assessment_focus,
                answer_highlights,
                getattr(item, "focusJudgments", []),
            )
            topics.append(
                ReviewTopic(
                    id=f"topic-{snapshot.sessionId}-{index}",
                    name=item.topic,
                    domain=_rubric_name_to_label(item.rubricScores[0].name) if item.rubricScores else "能力评估",
                    score=item.overallScore,
                    coreQuestion=_shorten_question(item.question),
                    assessmentFocus=assessment_focus,
                    answerHighlights=answer_highlights,
                    highlightedPoints=[score.name for score in item.rubricScores],
                    matchedAnswers=matched_answers,
                    evaluation=_build_topic_evaluation(item),
                    strengths=item.strengths,
                    weaknesses=item.weaknesses,
                    suggestions=item.followUps,
                    followUps=item.followUps,
                    optimizedAnswer=_build_optimized_answer(item),
                )
            )

        return ReviewSessionDetail(
            id=snapshot.sessionId,
            title=self._derive_title(snapshot),
            role=self._derive_role(snapshot),
            round="模拟面试",
            interviewAt=_format_datetime(snapshot.createdAt),
            reportStatus="ready",
            defaultSelectedTopicId=topics[0].id if topics else None,
            overallScore=evaluation.overallScore,
            summary=evaluation.summary,
            strengths=evaluation.strengths,
            risks=evaluation.risks,
            priority=evaluation.recommendation or (evaluation.priorityActions[0] if evaluation.priorityActions else ""),
            topics=topics,
        )

    @staticmethod
    def _derive_role(snapshot: MockInterviewSessionSnapshot) -> str:
        jd_title = (snapshot.jdData.basicInfo.jobTitle if snapshot.jdData else "") or ""
        desired_position = snapshot.resumeSnapshot.basicInfo.desiredPosition
        return jd_title or desired_position or snapshot.category.value

    def _derive_title(self, snapshot: MockInterviewSessionSnapshot) -> str:
        return f"{self._derive_role(snapshot)}模拟面试复盘"


_service: InterviewReviewService | None = None


@lru_cache(maxsize=1)
def get_interview_review_service() -> InterviewReviewService:
    global _service
    if _service is None:
        _service = InterviewReviewService()
    return _service
