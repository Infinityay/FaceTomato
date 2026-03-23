from __future__ import annotations

from app.schemas.interview_evaluation import (
    EvaluationTopicAssessment,
    InterviewEvaluationAgentInput,
    InterviewEvaluationSummary,
)
from app.services.interview_evaluation_agent import InterviewEvaluationAgent


class SequenceLLM:
    def __init__(self, responses):
        self.responses = responses
        self.calls = 0

    def invoke(self, _messages):
        response = self.responses[self.calls]
        self.calls += 1
        return response


def test_evaluate_limits_topics_to_current_round():
    payload = InterviewEvaluationAgentInput.model_validate(
        {
            "sessionId": "session-2",
            "jdText": "负责算法研究",
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
                    {"round": 3, "topic": "模型训练", "description": "训练细节"},
                    {"round": 4, "topic": "LeetCode 编码", "description": "编码题"},
                ],
                "total_rounds": 4,
                "estimated_duration": "45 分钟",
                "leetcode_problem": "两数之和",
            },
            "interviewState": {
                "currentRound": 2,
                "questionsPerRound": {"1": 1, "2": 0},
                "assistantQuestionCount": 1,
                "turnCount": 1,
                "reflectionHistory": [],
                "closed": True,
            },
            "messages": [
                {"id": "assistant-1", "role": "assistant", "content": "请先自我介绍"},
                {"id": "user-1", "role": "user", "content": "我做过模型训练项目"},
            ],
        }
    )
    agent = InterviewEvaluationAgent.__new__(InterviewEvaluationAgent)
    agent.topic_evaluation_llm = SequenceLLM(
        [
            EvaluationTopicAssessment.model_validate(
                {
                    "topic": "开场介绍",
                    "question": "请先自我介绍",
                    "assessmentFocus": ["考察候选人是否能清晰介绍背景"],
                    "answerHighlights": ["我做过模型训练项目"],
                    "strengths": ["结构清晰"],
                    "weaknesses": ["量化不足"],
                    "followUps": ["补充结果"],
                    "suggestedAnswer": "先讲背景再讲结果",
                    "rubricScores": [{"name": "structured_thinking", "score": 80, "reason": "结构清晰"}],
                    "overallScore": 80,
                }
            ),
            EvaluationTopicAssessment.model_validate(
                {
                    "topic": "项目经历",
                    "question": "介绍项目",
                    "assessmentFocus": ["考察候选人是否能说明项目动作"],
                    "answerHighlights": [],
                    "strengths": [],
                    "weaknesses": ["当前轮次尚未作答"],
                    "followUps": ["补充细节"],
                    "suggestedAnswer": "按背景、动作、结果展开",
                    "rubricScores": [{"name": "communication", "score": 60, "reason": "尚未充分展开"}],
                    "overallScore": 60,
                }
            ),
        ]
    )
    agent.summary_evaluation_llm = SequenceLLM(
        [
            InterviewEvaluationSummary.model_validate(
                {
                    "summary": "当前只评估已进行到的轮次。",
                    "overallScore": 70,
                    "recommendation": "优先补完第 2 轮回答。",
                    "strengths": ["已完成前两轮范围内的评估"],
                    "risks": ["后续轮次未纳入本次报告"],
                    "priorityActions": ["补充当前 Topic 回答"],
                }
            )
        ]
    )
    agent._build_topic_messages = lambda _payload: []
    agent._build_summary_messages = lambda _payload: []

    report = InterviewEvaluationAgent.evaluate(agent, payload)

    assert len(report.topicAssessments) == 2
    assert [item.topic for item in report.topicAssessments] == ["开场介绍", "项目经历"]
    assert agent.topic_evaluation_llm.calls == 2
    assert agent.summary_evaluation_llm.calls == 1
