from __future__ import annotations

from app.prompts.interview_review_prompts import get_interview_review_prompts
from app.schemas.interview_evaluation import InterviewEvaluationReport
from app.schemas.interview_review import ReviewOptimizationRequest, ReviewTopicOptimizationResult
from app.schemas.mock_interview import MockInterviewSessionSnapshot
from app.services.interview_review_service import InterviewReviewService


class StubAgent:
    def __init__(self, report: InterviewEvaluationReport):
        self.report = report
        self.calls = 0

    def evaluate(self, _payload):
        self.calls += 1
        return self.report


class SequenceLLM:
    def __init__(self, result):
        self.result = result
        self.calls = 0

    def invoke(self, _messages):
        self.calls += 1
        return self.result


class FakeChatModel:
    def __init__(self, result):
        self.result = result
        self.structured_calls = 0

    def with_structured_output(self, _schema):
        self.structured_calls += 1
        return SequenceLLM(self.result)


class FakeOptimizerAgent:
    def __init__(self, result):
        self.chat_model = FakeChatModel(result)
        self.prompts = get_interview_review_prompts()


def build_snapshot() -> MockInterviewSessionSnapshot:
    return MockInterviewSessionSnapshot.model_validate(
        {
            "snapshotVersion": 3,
            "sessionId": "session-1",
            "interviewType": "实习",
            "category": "大模型算法",
            "status": "completed",
            "limits": {
                "durationMinutes": 60,
                "softInputChars": 1200,
                "maxInputChars": 1500,
                "contextWindowMessages": 8,
                "sessionTtlMinutes": 90,
            },
            "jdText": "负责大模型算法研究",
            "jdData": None,
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
            "retrieval": {
                "queryText": "",
                "appliedFilters": {
                    "category": "大模型算法",
                    "interviewType": "实习",
                    "company": None,
                },
                "items": [],
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
            ],
            "developerContext": None,
            "developerTrace": [],
            "runtimeConfig": {
                "apiKey": "runtime-key",
                "baseURL": "https://custom.example/v1",
                "model": "custom-model",
            },
            "resumeFingerprint": "fp-1",
            "createdAt": "2026-03-19T10:00:00Z",
            "lastActiveAt": "2026-03-19T10:10:00Z",
            "expiresAt": "2099-03-20T10:00:00Z",
        }
    )


def build_report() -> InterviewEvaluationReport:
    return InterviewEvaluationReport.model_validate(
        {
            "summary": "summary",
            "overallScore": 88,
            "recommendation": "recommendation",
            "strengths": ["strength"],
            "risks": ["risk"],
            "priorityActions": ["action"],
            "topicAssessments": [],
        }
    )


def test_generate_review_prefers_runtime_config(monkeypatch):
    snapshot = build_snapshot()
    default_agent = StubAgent(build_report())
    runtime_agent = StubAgent(build_report())
    captured: dict[str, object] = {}

    def fake_resolve_runtime_config(runtime_config=None):
        captured["runtime_config"] = runtime_config
        return runtime_config

    def fake_from_runtime_config(runtime_config):
        captured["resolved_runtime_config"] = runtime_config
        return runtime_agent

    monkeypatch.setattr(
        "app.services.interview_review_service.resolve_runtime_config",
        fake_resolve_runtime_config,
    )
    monkeypatch.setattr(
        "app.services.interview_review_service.InterviewEvaluationAgent.from_runtime_config",
        fake_from_runtime_config,
    )

    service = InterviewReviewService(mock_interview_service=object(), evaluation_agent=default_agent)
    result = service.generate_review("session-1", snapshot=snapshot)

    assert result is not None
    assert captured["runtime_config"] == snapshot.runtimeConfig
    assert captured["resolved_runtime_config"] == snapshot.runtimeConfig
    assert runtime_agent.calls == 1
    assert default_agent.calls == 0


def test_upload_snapshot_registers_pending_session_and_supports_followup_generation():
    snapshot = build_snapshot()
    report = build_report()
    service = InterviewReviewService(mock_interview_service=object(), evaluation_agent=StubAgent(report))

    upload_result = service.upload_snapshot(snapshot)
    listed = service.list_reviews()
    generate_result = service.generate_review(snapshot.sessionId)

    assert upload_result.sessionId == snapshot.sessionId
    assert upload_result.reportStatus == "pending"
    assert any(item.id == snapshot.sessionId and item.reportStatus == "pending" for item in listed)
    assert generate_result is not None
    assert generate_result.reportStatus == "ready"


def test_build_review_detail_aligns_focus_and_answer_points_without_truncating_focus_or_answers():
    snapshot = build_snapshot()
    report = InterviewEvaluationReport.model_validate(
        {
            "summary": "summary",
            "overallScore": 88,
            "recommendation": "recommendation",
            "strengths": ["strength"],
            "risks": ["risk"],
            "priorityActions": ["action"],
            "topicAssessments": [
                {
                    "topic": "项目经历",
                    "question": "请详细介绍一个你主导推进、协调多人合作并最终带来明显业务结果的复杂项目，重点说明背景、挑战、动作、结果和复盘。",
                    "assessmentFocus": [
                        "考察候选人是否能结构化交代项目背景、目标和约束条件",
                        "考察候选人是否能说明关键动作、决策依据和推进方式",
                        "考察候选人是否能用量化结果证明业务价值",
                    ],
                    "answerHighlights": [
                        "这个项目是为了解决转化率下降的问题，我负责整体方案设计、指标拆解、跨团队推进和实验落地，周期持续了两个多月。",
                        "我先拆出流量、转化和留存三个环节，再和产品、研发一起对埋点和实验方案做了多轮校准，最后推动两版策略上线。",
                        "上线后注册转化率提升了12%，次日留存提升了4个百分点，同时把无效投放成本压降了18%。",
                        "补充的第四条不应该再被单独展示。",
                    ],
                    "focusJudgments": [
                        {
                            "focus": "考察候选人是否能结构化交代项目背景、目标和约束条件",
                            "answerHighlightIndex": 0,
                            "status": "covered",
                            "reason": "背景、目标和职责交代清楚",
                        },
                        {
                            "focus": "考察候选人是否能说明关键动作、决策依据和推进方式",
                            "answerHighlightIndex": 1,
                            "status": "incomplete",
                            "reason": "提到了推进动作，但决策依据和先后顺序没有答完整",
                        },
                        {
                            "focus": "考察候选人是否能用量化结果证明业务价值",
                            "answerHighlightIndex": 2,
                            "status": "knowledge_unclear",
                            "reason": "结果有数据，但指标口径和验证方式不够清楚",
                        },
                    ],
                    "strengths": ["主线完整"],
                    "weaknesses": ["还可以更短"],
                    "followUps": ["补充复盘"],
                    "suggestedAnswer": "先讲背景，再讲动作和结果。",
                    "rubricScores": [
                        {"name": "structured_thinking", "score": 90, "reason": "结构清楚"},
                        {"name": "communication", "score": 88, "reason": "表达完整"},
                        {"name": "evidence_and_metrics", "score": 91, "reason": "结果量化"},
                        {"name": "authenticity", "score": 86, "reason": "细节真实"},
                    ],
                    "overallScore": 89,
                }
            ],
        }
    )

    service = InterviewReviewService(mock_interview_service=object(), evaluation_agent=StubAgent(report))
    detail = service._build_review_detail_from_evaluation(snapshot, report)
    topic = detail.topics[0]

    assert len(topic.assessmentFocus) == 3
    assert len(topic.answerHighlights) == 3
    assert len(topic.matchedAnswers) == 3
    assert [item.point for item in topic.matchedAnswers] == topic.assessmentFocus
    assert [item.answerHighlightIndex for item in topic.matchedAnswers] == [0, 1, 2]
    assert [item.status for item in topic.matchedAnswers] == ["covered", "incomplete", "knowledge_unclear"]
    assert topic.matchedAnswers[1].reason
    assert all("…" not in item for item in topic.assessmentFocus)
    assert all("…" not in item for item in topic.answerHighlights)
    assert "…" not in topic.coreQuestion


def test_optimize_topic_uses_runtime_llm_result(monkeypatch):
    snapshot = build_snapshot()
    report = InterviewEvaluationReport.model_validate(
        {
            "summary": "summary",
            "overallScore": 80,
            "recommendation": "recommendation",
            "strengths": ["strength"],
            "risks": ["risk"],
            "priorityActions": ["action"],
            "topicAssessments": [
                {
                    "topic": "项目经历",
                    "question": "请介绍你的项目",
                    "assessmentFocus": ["考察是否能讲清项目目标和个人贡献"],
                    "answerHighlights": ["我负责方案设计和推进落地"],
                    "focusJudgments": [
                        {
                            "focus": "考察是否能讲清项目目标和个人贡献",
                            "answerHighlightIndex": 0,
                            "status": "incomplete",
                            "reason": "说到了职责，但项目目标和结果还不够完整。",
                        }
                    ],
                    "strengths": ["主线清楚"],
                    "weaknesses": ["结果描述不足"],
                    "followUps": ["补充项目目标和量化结果"],
                    "suggestedAnswer": "先讲目标，再讲职责、动作和结果。",
                    "rubricScores": [
                        {"name": "structured_thinking", "score": 80, "reason": "结构尚可"}
                    ],
                    "overallScore": 80,
                }
            ],
        }
    )
    service = InterviewReviewService(mock_interview_service=object(), evaluation_agent=StubAgent(report))
    service.generate_review("session-1", snapshot=snapshot)

    runtime_result = ReviewTopicOptimizationResult.model_validate(
        {
            "reply": "你这题要先讲项目目标，再补个人贡献和结果。",
            "optimizedAnswer": "这个项目的目标是提升转化率，我负责方案设计、推进落地，最终把转化率提升了12%。",
            "suggestions": ["先讲目标", "再讲职责", "最后讲结果"],
        }
    )
    fake_runtime_agent = FakeOptimizerAgent(runtime_result)

    def fake_from_runtime_config(_runtime_config):
        return fake_runtime_agent

    monkeypatch.setattr(
        "app.services.interview_review_service.InterviewEvaluationAgent.from_runtime_config",
        fake_from_runtime_config,
    )

    response = service.optimize_topic(
        ReviewOptimizationRequest.model_validate(
            {
                "sessionId": "session-1",
                "topicId": "topic-session-1-1",
                "message": "帮我改写成更像面试表达",
                "conversation": [],
                "runtimeConfig": {
                    "apiKey": "runtime-key",
                    "baseURL": "https://example.com/v1",
                    "model": "runtime-model",
                },
            }
        )
    )

    assert response is not None
    assert response.reply == runtime_result.reply
    assert response.optimizedAnswer == runtime_result.optimizedAnswer
    assert response.suggestions == runtime_result.suggestions
    assert response.message.suggestions == runtime_result.suggestions
