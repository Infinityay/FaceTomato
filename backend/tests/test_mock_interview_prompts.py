"""Tests for mock interview prompts."""

from app.prompts.mock_interview_prompts import (
    INTERVIEW_PLAN_PROMPT,
    INTERVIEWER_PROMPT,
    REFLECTION_PROMPT,
    get_mock_interview_prompts,
)


def test_get_mock_interview_prompts_returns_active_three_prompts():
    prompts = get_mock_interview_prompts()
    assert set(prompts.keys()) == {"plan", "interviewer", "reflection"}
    assert "leetcode_problem" in prompts["plan"]
    assert "suggested_follow_up" in prompts["interviewer"]
    assert "should_continue" in prompts["reflection"]


def test_interview_plan_prompt_contains_required_placeholders_and_rules():
    for placeholder in ("{domain}", "{jd_info}", "{resume_info}", "{retrieved_interviews}"):
        assert placeholder in INTERVIEW_PLAN_PROMPT

    for keyword in (
        "第 1 轮",
        "第 2 轮",
        "最后一轮",
        "leetcode_problem",
        "round",
        "topic",
        "通常 8-12 轮",
        "`total_rounds` 必须与 `plan` 数组长度一致",
        "项目拷打",
        "八股穿插",
        "AI 能力考查",
        "压力测试",
        "七个支持领域",
        "约 30% 面经",
        "八股考察占比要明显",
        "小问题由面试官根据当前 topic 和上下文动态生成",
        "topic 必须是大问题方向",
        "为什么不选其他方案",
    ):
        assert keyword in INTERVIEW_PLAN_PROMPT


def test_interviewer_prompt_contains_round_context_and_leetcode_problem():
    for placeholder in (
        "{current_round}",
        "{total_rounds}",
        "{current_topic}",
        "{current_description}",
        "{interview_plan}",
        "{conversation_history}",
        "{suggested_follow_up}",
        "{leetcode_problem}",
        "{resume_info}",
        "{retrieved_interviews}",
        "{domain}",
    ):
        assert placeholder in INTERVIEWER_PROMPT

    for keyword in ("input_json", "questionsPerRound", "isCodingRound", "A/B 选择"):
        assert keyword in INTERVIEWER_PROMPT

    for keyword in (
        "每个 topic 最多只能提 5 个问题",
        "第 1 轮只是热身开场",
        "自然过渡到下一轮",
        "项目拷打",
        "八股穿插",
        "AI/LLM 提效",
        "七个领域",
        "约 30% 内容都会显著考察基础知识",
        "持续穿插基础原理",
        "有限自由度的提问方式",
        "不要提前问到后续轮次的内容",
        "这些小问题都必须服务于当前 topic",
        "为什么这么做",
        "有哪些替代方案及为什么不选",
        "思考路径与替代方案比较",
    ):
        assert keyword in INTERVIEWER_PROMPT

    assert "CLOSE_INTERVIEW" in INTERVIEWER_PROMPT


def test_reflection_prompt_contains_required_placeholders_and_decision_rules():
    for placeholder in (
        "{current_round}",
        "{total_rounds}",
        "{round_topic}",
        "{current_description}",
        "{candidate_last_answer}",
        "{current_round_history}",
        "{current_round_question_count}",
    ):
        assert placeholder in REFLECTION_PROMPT

    for keyword in (
        "depth_score",
        "authenticity_score",
        "completeness_score",
        "logic_score",
        "should_continue",
        "suggested_follow_up",
        "3 个及以上维度得分 ≤ 3 分",
        "3 个及以上维度得分 ≥ 4 分",
        "本轮已追问 5 次以上",
        "第 1 轮只是热身开场",
        "只表示继续当前 topic",
        "不能提前跳到下一轮考点",
        "没有说明为什么这么做",
        "替代方案比较或核心权衡",
    ):
        assert keyword in REFLECTION_PROMPT
