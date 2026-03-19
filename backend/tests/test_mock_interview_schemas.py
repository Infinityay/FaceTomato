"""Tests for mock interview schemas."""

import pytest
from pydantic import ValidationError

from app.schemas.mock_interview import (
    MockInterviewDeveloperTraceEvent,
    MockInterviewPlan,
    MockInterviewPlanTracePayload,
    MockInterviewRound,
    MockInterviewState,
    ReflectionResult,
)


def make_valid_round_plan() -> MockInterviewPlan:
    return MockInterviewPlan(
        plan=[
            MockInterviewRound(round=1, topic="开场介绍", description="请候选人做自我介绍并说明求职动机。"),
            MockInterviewRound(round=2, topic="项目概述", description="请候选人先整体介绍最相关项目的背景、目标和职责。"),
            MockInterviewRound(round=3, topic="深挖 Redis 缓存设计", description="围绕缓存策略、异常场景与一致性进行追问。"),
            MockInterviewRound(round=4, topic="八股延展 - 浏览器渲染原理", description="从项目技术点延展到底层原理与性能权衡。"),
            MockInterviewRound(round=5, topic="AI 能力考查 - LLM 辅助开发实践", description="考察 AI 工具使用场景、效果评估与风险认知。"),
            MockInterviewRound(round=6, topic="LeetCode 编码", description="围绕指定代码题考察算法与实现能力。"),
        ],
        total_rounds=6,
        estimated_duration="45-60分钟",
        leetcode_problem="实现一个 LRU Cache",
    )


class TestReflectionResult:
    def test_accepts_flat_scores(self):
        result = ReflectionResult(
            depth_score=3,
            authenticity_score=4,
            completeness_score=3,
            logic_score=4,
            overall_assessment="回答较完整，但还可以补充更多技术细节。",
            should_continue=True,
            suggested_follow_up="请结合一个真实项目案例继续展开。",
            reason="当前回答还有明显可继续深挖的空间。",
        )
        assert result.depth_score == 3
        assert result.should_continue is True

    def test_rejects_score_out_of_range(self):
        with pytest.raises(ValidationError) as exc_info:
            ReflectionResult(
                depth_score=0,
                authenticity_score=4,
                completeness_score=3,
                logic_score=4,
                overall_assessment="回答较完整，但还可以补充更多技术细节。",
                should_continue=False,
                reason="当前轮次已讨论充分，可以切换主题。",
            )
        assert "depth_score" in str(exc_info.value)

    def test_requires_follow_up_when_continuing(self):
        with pytest.raises(ValidationError) as exc_info:
            ReflectionResult(
                depth_score=4,
                authenticity_score=4,
                completeness_score=4,
                logic_score=4,
                overall_assessment="回答质量不错，适合继续追问。",
                should_continue=True,
                suggested_follow_up="",
                reason="回答中还有值得继续追问的关键信息。",
            )
        assert "suggested_follow_up" in str(exc_info.value)


class TestMockInterviewPlan:
    def test_accepts_round_based_plan(self):
        plan = make_valid_round_plan()
        assert len(plan.plan) == plan.total_rounds
        assert plan.plan[0].round == 1
        assert plan.total_rounds == 6
        assert plan.leetcode_problem == "实现一个 LRU Cache"

    def test_rejects_non_continuous_round_numbers(self):
        with pytest.raises(ValidationError) as exc_info:
            MockInterviewPlan(
                plan=[
                    MockInterviewRound(round=1, topic="开场介绍", description="自我介绍与岗位动机。"),
                    MockInterviewRound(round=3, topic="项目概述", description="介绍最相关项目。"),
                    MockInterviewRound(round=4, topic="LeetCode 编码", description="围绕代码题提问。"),
                ],
                total_rounds=3,
                estimated_duration="45分钟",
                leetcode_problem="两数之和",
            )
        assert "continuous" in str(exc_info.value)

    def test_rejects_first_round_without_opening_topic(self):
        with pytest.raises(ValidationError) as exc_info:
            MockInterviewPlan(
                plan=[
                    MockInterviewRound(round=1, topic="技术深挖", description="直接进入技术细节盘问。"),
                    MockInterviewRound(round=2, topic="项目概述", description="介绍最相关项目。"),
                    MockInterviewRound(round=3, topic="代码题", description="围绕代码题提问。"),
                ],
                total_rounds=3,
                estimated_duration="45分钟",
                leetcode_problem="两数之和",
            )
        assert "opening round" in str(exc_info.value)

    def test_rejects_second_round_without_project_topic(self):
        with pytest.raises(ValidationError) as exc_info:
            MockInterviewPlan(
                plan=[
                    MockInterviewRound(round=1, topic="开场介绍", description="自我介绍与岗位动机。"),
                    MockInterviewRound(round=2, topic="技术深挖", description="直接进入性能优化细节。"),
                    MockInterviewRound(round=3, topic="代码题", description="围绕代码题提问。"),
                ],
                total_rounds=3,
                estimated_duration="45分钟",
                leetcode_problem="两数之和",
            )
        assert "project overview round" in str(exc_info.value)

    def test_rejects_last_round_without_coding_topic(self):
        with pytest.raises(ValidationError) as exc_info:
            MockInterviewPlan(
                plan=[
                    MockInterviewRound(round=1, topic="开场介绍", description="自我介绍与岗位动机。"),
                    MockInterviewRound(round=2, topic="项目概述", description="介绍最相关项目。"),
                    MockInterviewRound(round=3, topic="收尾反问", description="候选人反问与结束。"),
                ],
                total_rounds=3,
                estimated_duration="45分钟",
                leetcode_problem="两数之和",
            )
        assert "coding round" in str(exc_info.value)

    def test_requires_leetcode_problem(self):
        with pytest.raises(ValidationError) as exc_info:
            MockInterviewPlan(
                plan=make_valid_round_plan().plan,
                total_rounds=3,
                estimated_duration="45-60分钟",
                leetcode_problem="",
            )
        assert "leetcode_problem" in str(exc_info.value)


class TestDeveloperTraceSchemas:
    def test_accepts_plan_generation_trace_payload(self):
        event = MockInterviewDeveloperTraceEvent(
            type="plan_generation",
            payload=MockInterviewPlanTracePayload(
                jdDataIncluded=True,
                resumeProjectCount=2,
                retrievalItemCount=3,
                retrievalQueryText="前端开发\n校招\nReact",
                outputPlan=make_valid_round_plan(),
                fallbackUsed=False,
                elapsedMs=123,
            ),
        )
        assert event.type == "plan_generation"
        assert event.payload.outputPlan.total_rounds == 6


class TestMockInterviewState:
    def test_normalizes_round_keys_to_strings(self):
        state = MockInterviewState(currentRound=2, questionsPerRound={1: 1, 2: 0})
        assert state.questionsPerRound == {"1": 1, "2": 0}

    def test_injects_missing_current_round_key(self):
        state = MockInterviewState(currentRound=3, questionsPerRound={"1": 1, "2": 2})
        assert state.questionsPerRound["3"] == 0
