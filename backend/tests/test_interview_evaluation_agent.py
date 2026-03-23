from __future__ import annotations

from app.schemas.interview_evaluation import (
    EvaluationTopicAssessment,
    InterviewEvaluationAgentInput,
    InterviewEvaluationSummary,
)
from app.services.interview_evaluation_agent import InterviewEvaluationAgent


class FailingLLM:
    def invoke(self, _messages):
        raise RuntimeError("upstream llm failure")


class SequenceLLM:
    def __init__(self, responses):
        self.responses = responses
        self.calls = 0

    def invoke(self, _messages):
        response = self.responses[self.calls]
        self.calls += 1
        return response


def build_payload() -> InterviewEvaluationAgentInput:
    return InterviewEvaluationAgentInput.model_validate(
        {
            "sessionId": "session-1",
            "jdText": "负责大模型算法研究",
            "jdData": {
                "basicInfo": {
                    "jobTitle": "算法实习生",
                    "jobType": "实习",
                    "location": "上海",
                    "company": "某公司",
                    "department": "算法",
                    "updateTime": "",
                },
                "requirements": {
                    "degree": "",
                    "experience": "",
                    "techStack": ["PyTorch"],
                    "mustHave": ["机器学习基础"],
                    "niceToHave": [],
                    "jobDuties": ["参与模型训练"],
                },
            },
            "resumeSnapshot": {
                "basicInfo": {
                    "name": "测试用户",
                    "personalEmail": "test@example.com",
                    "phoneNumber": "13800138000",
                    "age": "",
                    "born": "",
                    "gender": "",
                    "desiredPosition": "算法实习生",
                    "desiredLocation": [],
                    "currentLocation": "",
                    "placeOfOrigin": "",
                    "rewards": [],
                },
                "workExperience": [],
                "education": [],
                "projects": [],
                "academicAchievements": [],
            },
            "interviewPlan": {
                "plan": [
                    {"round": 1, "topic": "开场介绍", "description": "自我介绍"},
                    {"round": 2, "topic": "项目经历", "description": "介绍项目"},
                    {"round": 3, "topic": "LeetCode 编码", "description": "编码题"},
                ],
                "total_rounds": 3,
                "estimated_duration": "30 分钟",
                "leetcode_problem": "两数之和",
            },
            "interviewState": {
                "currentRound": 3,
                "questionsPerRound": {"1": 1, "2": 1, "3": 1},
                "assistantQuestionCount": 3,
                "turnCount": 3,
                "reflectionHistory": [],
                "closed": True,
            },
            "messages": [
                {"id": "assistant-1", "role": "assistant", "content": "请先自我介绍"},
                {"id": "user-1", "role": "user", "content": "我做过大模型训练项目"},
                {"id": "assistant-2", "role": "assistant", "content": "介绍一个项目"},
                {"id": "user-2", "role": "user", "content": "我负责模型训练和评估"},
                {"id": "assistant-3", "role": "assistant", "content": "请写一道算法题"},
                {"id": "user-3", "role": "user", "content": "我会先分析复杂度再编码"},
            ],
        }
    )


def test_evaluate_falls_back_when_llm_invocation_fails():
    payload = build_payload()
    agent = InterviewEvaluationAgent.__new__(InterviewEvaluationAgent)
    agent.topic_evaluation_llm = FailingLLM()
    agent.summary_evaluation_llm = FailingLLM()
    agent._build_topic_messages = lambda _payload: []
    agent._build_summary_messages = lambda _payload: []

    report = InterviewEvaluationAgent.evaluate(agent, payload)

    assert report.overallScore > 0
    assert len(report.topicAssessments) == 3
    assert "基础评价框架" in report.summary


def test_evaluate_uses_topic_then_summary_calls():
    payload = build_payload()
    agent = InterviewEvaluationAgent.__new__(InterviewEvaluationAgent)
    agent.topic_evaluation_llm = SequenceLLM(
        [
            EvaluationTopicAssessment.model_validate(
                {
                    "topic": "开场介绍",
                    "question": "请先自我介绍",
                    "assessmentFocus": ["考察候选人是否能清晰介绍自身背景"],
                    "answerHighlights": ["我做过大模型训练项目"],
                    "strengths": ["结构清楚"],
                    "weaknesses": ["量化不足"],
                    "followUps": ["补充结果"],
                    "suggestedAnswer": "先讲背景再讲结果",
                    "rubricScores": [{"name": "structured_thinking", "score": 80, "reason": "结构清楚"}],
                    "overallScore": 80,
                }
            ),
            EvaluationTopicAssessment.model_validate(
                {
                    "topic": "项目经历",
                    "question": "介绍一个项目",
                    "assessmentFocus": ["考察候选人是否能说明项目结果和关键取舍"],
                    "answerHighlights": ["我负责模型训练和评估"],
                    "strengths": ["主线清楚"],
                    "weaknesses": ["细节不足"],
                    "followUps": ["补充指标"],
                    "suggestedAnswer": "补充量化指标",
                    "rubricScores": [{"name": "communication", "score": 78, "reason": "表达完整"}],
                    "overallScore": 78,
                }
            ),
            EvaluationTopicAssessment.model_validate(
                {
                    "topic": "LeetCode 编码",
                    "question": "请写一道算法题",
                    "assessmentFocus": ["考察候选人是否有结构化拆解算法问题的能力"],
                    "answerHighlights": ["我会先分析复杂度再编码"],
                    "strengths": ["有框架"],
                    "weaknesses": ["实现细节不足"],
                    "followUps": ["补充边界处理"],
                    "suggestedAnswer": "先讲复杂度再写代码",
                    "rubricScores": [{"name": "domain_judgment", "score": 76, "reason": "先分析复杂度"}],
                    "overallScore": 76,
                }
            ),
        ]
    )
    agent.summary_evaluation_llm = SequenceLLM(
        [
            InterviewEvaluationSummary.model_validate(
                {
                    "summary": "整体表现稳定。",
                    "overallScore": 78,
                    "recommendation": "优先补量化结果。",
                    "strengths": ["结构较清楚"],
                    "risks": ["量化不足"],
                    "priorityActions": ["补结果指标"],
                }
            )
        ]
    )
    agent._build_topic_messages = lambda _payload: []
    agent._build_summary_messages = lambda _payload: []

    report = InterviewEvaluationAgent.evaluate(agent, payload)

    assert len(report.topicAssessments) == 3
    assert report.summary == "整体表现稳定。"
    assert agent.topic_evaluation_llm.calls == 3
    assert agent.summary_evaluation_llm.calls == 1
