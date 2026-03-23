from __future__ import annotations

import time
from datetime import datetime, timezone

import pytest
from fastapi import HTTPException

from app.core.config import Settings
from app.schemas.interview import Category, InterviewData, InterviewResult, InterviewType
from app.schemas.jd import JDData, JDBasicInfo, JDRequirements
from app.schemas.mock_interview import (
    MockInterviewAnswerAnalysisStartedEvent,
    MockInterviewMessage,
    MockInterviewPlan,
    MockInterviewRetrievalFilters,
    MockInterviewRetrievalItem,
    MockInterviewRetrievalResult,
    MockInterviewRound,
    MockInterviewSessionCreateRequest,
    MockInterviewSessionLimits,
    MockInterviewState,
    MockInterviewStreamRequest,
    ReflectionResult,
)
from app.schemas.resume import ResumeData
from app.services.mock_interview_service import MockInterviewService, RetrievalQueryContext


class FakeChunk:
    def __init__(self, content: str):
        self.content = content


class FakeChatModel:
    def __init__(self, chunks: list[str]):
        self.chunks = chunks
        self.calls: list[list] = []

    def with_structured_output(self, _schema):
        return object()

    async def astream(self, messages):
        self.calls.append(messages)
        for chunk in self.chunks:
            yield FakeChunk(chunk)


class FakeRagService:
    def __init__(self, result: MockInterviewRetrievalResult):
        self.result = result
        self.calls: list[RetrievalQueryContext] = []

    def retrieve_for_plan(self, context: RetrievalQueryContext) -> MockInterviewRetrievalResult:
        self.calls.append(context)
        return self.result


class FakeDataService:
    def __init__(self, tiers: dict[tuple[str | None, str | None], list[InterviewData]]):
        self.tiers = tiers
        self.calls: list[dict] = []

    def filter_interviews(
        self,
        categories: list[Category] | None = None,
        results: list[str] | None = None,
        interview_types: list[str] | None = None,
        include_unknown_interview_type: bool = False,
        company: str | None = None,
        search: str | None = None,
        sort_order: str = "desc",
        page: int | None = None,
        page_size: int | None = None,
    ):
        del results, include_unknown_interview_type, search
        key = (
            interview_types[0] if interview_types else None,
            company,
        )
        source = list(self.tiers.get(key, []))
        if page == 1 and page_size is not None:
            source = source[:page_size]
        self.calls.append(
            {
                "categories": categories,
                "interview_types": interview_types,
                "company": company,
                "sort_order": sort_order,
                "page": page,
                "page_size": page_size,
            }
        )
        return source, len(source)


@pytest.fixture
def sample_resume() -> ResumeData:
    return ResumeData()


@pytest.fixture
def sample_jd_data() -> JDData:
    return JDData(
        basicInfo=JDBasicInfo(company="阿里巴巴", jobTitle="前端开发工程师"),
        requirements=JDRequirements(
            techStack=["React", "TypeScript"],
            mustHave=["熟悉前端工程化"],
            jobDuties=["负责前端业务开发"],
        ),
    )


@pytest.fixture
def sample_retrieval_result() -> MockInterviewRetrievalResult:
    return MockInterviewRetrievalResult(
        queryText="前端开发\n校招\nReact\nTypeScript",
        appliedFilters=MockInterviewRetrievalFilters(
            category=Category.FRONTEND,
            interviewType=InterviewType.CAMPUS,
            company="阿里",
        ),
        items=[
            MockInterviewRetrievalItem(
                interviewId=7,
                title="阿里前端一面",
                company="阿里巴巴",
                category=Category.FRONTEND,
                interviewType=InterviewType.CAMPUS,
                stage="一面",
                publishTime="2024-10-01 10:00:00",
                snippet="React 性能优化与工程化",
                score=1.23,
                reason="公司：阿里巴巴；类型：校招",
            )
        ],
    )


@pytest.fixture
def sample_plan() -> MockInterviewPlan:
    return MockInterviewPlan(
        plan=[
            MockInterviewRound(round=1, topic="开场介绍", description="自我介绍与岗位动机。"),
            MockInterviewRound(round=2, topic="项目概述", description="整体介绍最相关项目。"),
            MockInterviewRound(round=3, topic="技术深挖", description="围绕关键技术决策和难点持续深挖。"),
            MockInterviewRound(round=4, topic="LeetCode 编码", description="围绕指定代码题考察算法与实现能力。"),
        ],
        total_rounds=4,
        estimated_duration="45-60分钟",
        leetcode_problem="实现一个 LRU Cache",
    )


@pytest.fixture
def service(
    sample_plan: MockInterviewPlan,
    sample_retrieval_result: MockInterviewRetrievalResult,
) -> MockInterviewService:
    service = MockInterviewService.__new__(MockInterviewService)
    service.prompts = {
        "plan": "plan prompt {domain} {jd_info} {resume_info} {retrieved_interviews}",
        "interviewer": (
            "interviewer prompt {current_round} {total_rounds} {current_topic} {current_description} "
            "{interview_plan} {jd_info} {resume_info} {retrieved_interviews} {conversation_history} "
            "{suggested_follow_up} {leetcode_problem}"
        ),
        "reflection": (
            "reflection prompt {current_round} {total_rounds} {round_topic} {current_description} "
            "{candidate_last_answer} {current_round_history} {current_round_question_count}"
        ),
    }
    service.plan_llm = object()
    service.reflection_llm = object()
    service.chat_model = FakeChatModel(["第一段", "第二段"])
    service._trim_jd = MockInterviewService._trim_jd.__get__(service, MockInterviewService)
    service._utcnow = lambda: datetime(2026, 3, 9, tzinfo=timezone.utc)
    service._extract_chunk_text = MockInterviewService._extract_chunk_text.__get__(service, MockInterviewService)
    service._ensure_stream_allowed = MockInterviewService._ensure_stream_allowed.__get__(service, MockInterviewService)
    service._retrieve_interview_evidence = MockInterviewService._retrieve_interview_evidence.__get__(service, MockInterviewService)
    service._normalize_plan_payload = MockInterviewService._normalize_plan_payload.__get__(service, MockInterviewService)
    service._validate_normalized_plan_payload = MockInterviewService._validate_normalized_plan_payload.__get__(service, MockInterviewService)
    service._generate_plan = MockInterviewService._generate_plan.__get__(service, MockInterviewService)
    service._build_plan_messages = MockInterviewService._build_plan_messages.__get__(service, MockInterviewService)
    service._build_retrieval_context = MockInterviewService._build_retrieval_context.__get__(service, MockInterviewService)
    service._run_retrieval = MockInterviewService._run_retrieval.__get__(service, MockInterviewService)
    service._run_plan_generation = MockInterviewService._run_plan_generation.__get__(service, MockInterviewService)
    service._build_session_create_response = MockInterviewService._build_session_create_response.__get__(service, MockInterviewService)
    service._build_initial_state = MockInterviewService._build_initial_state.__get__(service, MockInterviewService)
    service._build_ephemeral_session = MockInterviewService._build_ephemeral_session.__get__(service, MockInterviewService)
    service._get_current_round_key = MockInterviewService._get_current_round_key.__get__(service, MockInterviewService)
    service._ensure_current_round_bucket = MockInterviewService._ensure_current_round_bucket.__get__(service, MockInterviewService)
    service._get_current_round = MockInterviewService._get_current_round.__get__(service, MockInterviewService)
    service._is_last_round = MockInterviewService._is_last_round.__get__(service, MockInterviewService)
    service._is_coding_round = MockInterviewService._is_coding_round.__get__(service, MockInterviewService)
    service._get_current_round_question_count = MockInterviewService._get_current_round_question_count.__get__(service, MockInterviewService)
    service._get_round_question_limit = MockInterviewService._get_round_question_limit.__get__(service, MockInterviewService)
    service._normalize_reflection_for_round_limit = MockInterviewService._normalize_reflection_for_round_limit.__get__(service, MockInterviewService)
    service._advance_to_next_round = MockInterviewService._advance_to_next_round.__get__(service, MockInterviewService)
    service._append_reflection = MockInterviewService._append_reflection.__get__(service, MockInterviewService)
    service._record_assistant_question = MockInterviewService._record_assistant_question.__get__(service, MockInterviewService)
    service._get_current_round_messages = MockInterviewService._get_current_round_messages.__get__(service, MockInterviewService)
    service._build_reflection_messages = MockInterviewService._build_reflection_messages.__get__(service, MockInterviewService)
    service._fallback_reflection = MockInterviewService._fallback_reflection.__get__(service, MockInterviewService)
    service._call_reflection = MockInterviewService._call_reflection.__get__(service, MockInterviewService)
    service._recent_conversation = MockInterviewService._recent_conversation.__get__(service, MockInterviewService)
    service._build_interviewer_messages = MockInterviewService._build_interviewer_messages.__get__(service, MockInterviewService)
    service._touch_session = MockInterviewService._touch_session.__get__(service, MockInterviewService)
    service.create_session = MockInterviewService.create_session.__get__(service, MockInterviewService)
    service.stream_create_session = MockInterviewService.stream_create_session.__get__(service, MockInterviewService)
    service.stream_turn = MockInterviewService.stream_turn.__get__(service, MockInterviewService)
    service._rag_service = FakeRagService(sample_retrieval_result)
    service._session_ttl_minutes = 1440
    service._plan_generation_timeout_seconds = 30
    service._disable_rag = False
    service._limits = MockInterviewSessionLimits(sessionTtlMinutes=1440)
    service._build_resume_fingerprint = MockInterviewService._build_resume_fingerprint.__get__(service, MockInterviewService)
    service._new_expires_at = MockInterviewService._new_expires_at.__get__(service, MockInterviewService)
    service._serialize_json = MockInterviewService._serialize_json.__get__(service, MockInterviewService)

    import app.services.mock_interview_service as module

    def fake_invoke_with_fallback(_llm, messages, schema):
        if schema is MockInterviewPlan:
            service.last_plan_messages = messages
            return sample_plan
        if schema is ReflectionResult:
            raise AssertionError("reflection fallback should be stubbed per test")
        raise AssertionError("unexpected schema in default invoke_with_fallback stub")

    module.invoke_with_fallback = fake_invoke_with_fallback
    return service


def make_stream_request(
    create_response,
    sample_resume: ResumeData,
    sample_jd_data: JDData,
    *,
    mode: str,
    message: str | None = None,
    messages: list[MockInterviewMessage] | None = None,
    interview_state: MockInterviewState | None = None,
) -> MockInterviewStreamRequest:
    return MockInterviewStreamRequest(
        mode=mode,
        message=message,
        interviewType=create_response.interviewType,
        category=create_response.category,
        jdText="熟悉 React",
        jdData=sample_jd_data,
        resumeSnapshot=sample_resume,
        retrieval=create_response.retrieval,
        interviewPlan=create_response.interviewPlan,
        interviewState=interview_state or create_response.interviewState,
        messages=messages or [],
    )


@pytest.mark.anyio
async def test_create_session_returns_round_plan_and_initial_state(
    service: MockInterviewService,
    sample_resume: ResumeData,
    sample_jd_data: JDData,
):
    response = await service.create_session(
        MockInterviewSessionCreateRequest(
            interviewType=InterviewType.CAMPUS,
            category=Category.FRONTEND,
            jdText="熟悉 React",
            jdData=sample_jd_data,
            resumeData=sample_resume,
        )
    )

    assert response.sessionId
    assert response.interviewPlan.total_rounds == 4
    assert response.interviewPlan.plan[0].topic == "开场介绍"
    assert response.interviewPlan.leetcode_problem == "实现一个 LRU Cache"
    assert response.interviewState.currentRound == 1
    assert response.interviewState.questionsPerRound == {"1": 0}
    assert response.interviewState.assistantQuestionCount == 0
    assert response.interviewState.turnCount == 0
    assert response.interviewState.closed is False
    assert response.retrieval.items[0].interviewId == 7
    assert response.resumeFingerprint


def test_create_session_requires_non_empty_jd_text(sample_resume: ResumeData, sample_jd_data: JDData):
    with pytest.raises(ValueError, match="jdText is required"):
        MockInterviewSessionCreateRequest(
            interviewType=InterviewType.CAMPUS,
            category=Category.FRONTEND,
            jdText="   ",
            jdData=sample_jd_data,
            resumeData=sample_resume,
        )


def test_create_session_requires_jd_data(sample_resume: ResumeData):
    with pytest.raises(ValueError, match="jdData is required"):
        MockInterviewSessionCreateRequest(
            interviewType=InterviewType.CAMPUS,
            category=Category.FRONTEND,
            jdText="阿里巴巴前端开发，要求熟悉 React 和 TypeScript",
            jdData=None,
            resumeData=sample_resume,
        )


def test_normalize_plan_payload_repairs_round_numbers_and_total_rounds(service: MockInterviewService):
    normalized = service._normalize_plan_payload(
        {
            "plan": [
                {"round": 4, "topic": "开场介绍", "description": "自我介绍与岗位动机。"},
                {"round": 7, "topic": "项目概述", "description": "整体介绍最相关项目。"},
                {"round": 9, "topic": "LeetCode 编码", "description": "围绕指定代码题考察算法与实现能力。"},
            ],
            "total_rounds": 99,
            "estimated_duration": "45-60分钟",
            "leetcode_problem": "两数之和",
        }
    )

    assert normalized["total_rounds"] == 3
    assert [item["round"] for item in normalized["plan"]] == [1, 2, 3]


@pytest.mark.anyio
async def test_generate_plan_normalizes_mismatched_plan_payload_before_validation(
    service: MockInterviewService,
    sample_resume: ResumeData,
    sample_jd_data: JDData,
    sample_retrieval_result: MockInterviewRetrievalResult,
):
    request = MockInterviewSessionCreateRequest(
        interviewType=InterviewType.CAMPUS,
        category=Category.FRONTEND,
        jdText="熟悉 React",
        jdData=sample_jd_data,
        resumeData=sample_resume,
    )

    class BrokenPlanLLM:
        def invoke(self, _messages):
            broken_payload = (
                '{"plan": ['
                '{"round": 5, "topic": "开场介绍", "description": "自我介绍与岗位动机。"}, '
                '{"round": 7, "topic": "项目概述", "description": "整体介绍最相关项目。"}, '
                '{"round": 8, "topic": "LeetCode 编码", "description": "围绕指定代码题考察算法与实现能力。"}'
                '], "total_rounds": 4, "estimated_duration": "45-60分钟", "leetcode_problem": "两数之和"}'
            )
            raise ValueError(f"structured output failed with input_value='{broken_payload}'")

    service.plan_llm = BrokenPlanLLM()

    result = service._generate_plan(request, sample_jd_data, sample_retrieval_result)
    plan = result.value

    assert plan.total_rounds == 3
    assert [item.round for item in plan.plan] == [1, 2, 3]
    assert plan.plan[-1].topic == "LeetCode 编码"
    assert result.fallback_used is True


@pytest.mark.anyio
async def test_build_plan_messages_includes_retrieval_context(
    service: MockInterviewService,
    sample_resume: ResumeData,
    sample_jd_data: JDData,
    sample_retrieval_result: MockInterviewRetrievalResult,
):
    request = MockInterviewSessionCreateRequest(
        interviewType=InterviewType.CAMPUS,
        category=Category.FRONTEND,
        jdText="熟悉 React",
        jdData=sample_jd_data,
        resumeData=sample_resume,
    )

    messages = service._build_plan_messages(request, sample_jd_data, sample_retrieval_result)
    assert len(messages) == 1
    payload = messages[0].content
    assert "阿里前端一面" in payload
    assert "阿里巴巴" in payload
    assert "React" in payload


@pytest.mark.anyio
async def test_stream_create_session_emits_progress_and_session_created(
    service: MockInterviewService,
    sample_resume: ResumeData,
    sample_jd_data: JDData,
):
    events = [
        item
        async for item in service.stream_create_session(
            MockInterviewSessionCreateRequest(
                interviewType=InterviewType.CAMPUS,
                category=Category.FRONTEND,
                jdText="熟悉 React",
                jdData=sample_jd_data,
                resumeData=sample_resume,
            )
        )
    ]

    assert [item["event"] for item in events] == [
        "progress",
        "developer_trace",
        "progress",
        "developer_trace",
        "session_created",
        "done",
    ]
    assert events[1]["data"]["type"] == "retrieval"
    assert events[1]["data"]["payload"]["queryText"]
    assert events[3]["data"]["type"] == "plan_generation"
    assert events[4]["data"]["sessionId"]
    assert events[4]["data"]["interviewPlan"]["total_rounds"] == 4
    assert events[4]["data"]["interviewState"]["currentRound"] == 1
    assert events[4]["data"]["retrieval"]["items"][0]["interviewId"] == 7
    assert events[4]["data"]["developerContext"]["privacyMode"] == "frontend_local_export_only"
    assert events[5]["data"] == {"sessionId": events[4]["data"]["sessionId"], "status": "ready"}


@pytest.mark.anyio
async def test_run_plan_generation_times_out_with_http_exception(
    service: MockInterviewService,
    sample_resume: ResumeData,
    sample_jd_data: JDData,
    sample_retrieval_result: MockInterviewRetrievalResult,
):
    request = MockInterviewSessionCreateRequest(
        interviewType=InterviewType.CAMPUS,
        category=Category.FRONTEND,
        jdText="熟悉 React",
        jdData=sample_jd_data,
        resumeData=sample_resume,
    )

    def slow_generate_plan(_request, _jd_data, _retrieval_result):
        time.sleep(0.05)
        raise AssertionError("timeout test should not reach plan completion")

    service._generate_plan = slow_generate_plan
    service._plan_generation_timeout_seconds = 0.01

    with pytest.raises(HTTPException, match="生成面试计划超时") as exc_info:
        await service._run_plan_generation(request, sample_retrieval_result)

    assert exc_info.value.status_code == 504


@pytest.mark.anyio
async def test_stream_start_asks_first_round_and_updates_questions_per_round(
    service: MockInterviewService,
    sample_resume: ResumeData,
    sample_jd_data: JDData,
):
    create_response = await service.create_session(
        MockInterviewSessionCreateRequest(
            interviewType=InterviewType.CAMPUS,
            category=Category.FRONTEND,
            jdText="熟悉 React",
            jdData=sample_jd_data,
            resumeData=sample_resume,
        )
    )

    request = make_stream_request(create_response, sample_resume, sample_jd_data, mode="start")
    events = [item async for item in service.stream_turn(create_response.sessionId, request)]

    names = [item["event"] for item in events]
    assert names == ["message_start", "message_delta", "message_delta", "message_end", "developer_trace", "done"]
    assert "answer_analysis_started" not in names
    assert events[-3]["data"]["content"] == "第一段第二段"
    assert events[-3]["data"]["interviewState"]["currentRound"] == 1
    assert events[-3]["data"]["interviewState"]["questionsPerRound"] == {"1": 1}
    assert events[-2]["data"]["type"] == "interviewer_generation"
    assert events[-1]["data"]["status"] == "ready"


@pytest.mark.anyio
async def test_stream_reply_continue_keeps_same_round_before_max_questions(
    service: MockInterviewService,
    sample_resume: ResumeData,
    sample_jd_data: JDData,
):
    create_response = await service.create_session(
        MockInterviewSessionCreateRequest(
            interviewType=InterviewType.CAMPUS,
            category=Category.FRONTEND,
            jdText="熟悉 React",
            jdData=sample_jd_data,
            resumeData=sample_resume,
        )
    )

    async def fake_reflection(_session, _answer):
        return ReflectionResult(
            depth_score=4,
            authenticity_score=4,
            completeness_score=4,
            logic_score=4,
            overall_assessment="回答不错，可以继续围绕当前主题深入追问。",
            should_continue=True,
            suggested_follow_up="请补充这个项目中的性能优化细节。",
            reason="当前主题还有明显可深挖空间。",
        )

    service._call_reflection = fake_reflection

    request = make_stream_request(
        create_response,
        sample_resume,
        sample_jd_data,
        mode="reply",
        message="这是我的回答",
        messages=[MockInterviewMessage(id="assistant-1", role="assistant", content="先做个自我介绍。")],
        interview_state=MockInterviewState(currentRound=2, questionsPerRound={"1": 1, "2": 4}, assistantQuestionCount=4),
    )
    events = [item async for item in service.stream_turn(create_response.sessionId, request)]

    names = [item["event"] for item in events]
    assert names[:4] == [
        "user_message",
        "answer_analysis_started",
        "reflection_result",
        "developer_trace",
    ]
    assert "round_transition" not in names
    answer_analysis_started = next(item for item in events if item["event"] == "answer_analysis_started")
    assert answer_analysis_started["data"] == MockInterviewAnswerAnalysisStartedEvent(
        stage="analyzing_answer",
        message="正在分析你的回答",
    ).model_dump(mode="json")
    reflection_trace = next(item for item in events if item["event"] == "developer_trace" and item["data"]["type"] == "reflection")
    assert reflection_trace["data"]["payload"]["candidateAnswer"] == "这是我的回答"
    interviewer_trace = next(item for item in events if item["event"] == "developer_trace" and item["data"]["type"] == "interviewer_generation")
    assert interviewer_trace["data"]["payload"]["finalMessage"] == "第一段第二段"
    message_end = next(item for item in events if item["event"] == "message_end")
    assert message_end["data"]["interviewState"]["currentRound"] == 2
    assert message_end["data"]["interviewState"]["questionsPerRound"]["2"] == 5


@pytest.mark.anyio
async def test_stream_reply_transition_moves_to_next_round_on_weak_answer_before_limit(
    service: MockInterviewService,
    sample_resume: ResumeData,
    sample_jd_data: JDData,
):
    create_response = await service.create_session(
        MockInterviewSessionCreateRequest(
            interviewType=InterviewType.CAMPUS,
            category=Category.FRONTEND,
            jdText="熟悉 React",
            jdData=sample_jd_data,
            resumeData=sample_resume,
        )
    )

    async def fake_reflection(_session, _answer):
        return ReflectionResult(
            depth_score=2,
            authenticity_score=2,
            completeness_score=2,
            logic_score=2,
            overall_assessment="当前主题信息已足够，建议切换到下一轮。",
            should_continue=False,
            suggested_follow_up="",
            reason="当前轮次已完成，可进入下一主题。",
        )

    service._call_reflection = fake_reflection

    request = make_stream_request(
        create_response,
        sample_resume,
        sample_jd_data,
        mode="reply",
        message="这是我的回答",
        messages=[MockInterviewMessage(id="assistant-1", role="assistant", content="请整体介绍一下你的项目。")],
        interview_state=MockInterviewState(currentRound=2, questionsPerRound={"1": 1, "2": 1}, assistantQuestionCount=1),
    )
    events = [item async for item in service.stream_turn(create_response.sessionId, request)]

    names = [item["event"] for item in events]
    assert names[:4] == [
        "user_message",
        "answer_analysis_started",
        "reflection_result",
        "developer_trace",
    ]
    assert "round_transition" in names
    transition = next(item for item in events if item["event"] == "round_transition")
    assert transition["data"]["from_round"] == 2
    assert transition["data"]["to_round"] == 3
    assert transition["data"]["topic"] == "技术深挖"
    message_end = next(item for item in events if item["event"] == "message_end")
    assert message_end["data"]["interviewState"]["currentRound"] == 3


@pytest.mark.anyio
async def test_stream_reply_last_round_closes_interview_when_reflection_ends_round(
    service: MockInterviewService,
    sample_resume: ResumeData,
    sample_jd_data: JDData,
):
    create_response = await service.create_session(
        MockInterviewSessionCreateRequest(
            interviewType=InterviewType.CAMPUS,
            category=Category.FRONTEND,
            jdText="熟悉 React",
            jdData=sample_jd_data,
            resumeData=sample_resume,
        )
    )

    async def fake_reflection(_session, _answer):
        return ReflectionResult(
            depth_score=2,
            authenticity_score=2,
            completeness_score=2,
            logic_score=2,
            overall_assessment="代码题轮次已结束，准备收尾。",
            should_continue=False,
            suggested_follow_up="",
            reason="最后一轮已完成，结束面试。",
        )

    service._call_reflection = fake_reflection

    request = make_stream_request(
        create_response,
        sample_resume,
        sample_jd_data,
        mode="reply",
        message="这是最后一轮回答",
        messages=[MockInterviewMessage(id="assistant-3", role="assistant", content="请实现一个 LRU Cache。")],
        interview_state=MockInterviewState(currentRound=4, questionsPerRound={"1": 1, "2": 1, "3": 1, "4": 1}, assistantQuestionCount=3),
    )
    events = [item async for item in service.stream_turn(create_response.sessionId, request)]

    message_end = next(item for item in events if item["event"] == "message_end")
    done = events[-1]
    assert message_end["data"]["interviewState"]["closed"] is True
    assert done["data"]["status"] == "completed"


@pytest.mark.anyio
async def test_stream_reply_forces_transition_when_current_topic_reaches_max_questions(
    service: MockInterviewService,
    sample_resume: ResumeData,
    sample_jd_data: JDData,
):
    create_response = await service.create_session(
        MockInterviewSessionCreateRequest(
            interviewType=InterviewType.CAMPUS,
            category=Category.FRONTEND,
            jdText="熟悉 React",
            jdData=sample_jd_data,
            resumeData=sample_resume,
        )
    )

    async def fake_reflection(_session, _answer):
        return ReflectionResult(
            depth_score=4,
            authenticity_score=4,
            completeness_score=4,
            logic_score=4,
            overall_assessment="虽然还能追问，但模型想继续当前轮。",
            should_continue=True,
            suggested_follow_up="继续追问更多实现细节。",
            reason="模型认为还有空间继续追问。",
        )

    service._call_reflection = fake_reflection

    request = make_stream_request(
        create_response,
        sample_resume,
        sample_jd_data,
        mode="reply",
        message="这是第 5 问后的回答",
        messages=[MockInterviewMessage(id="assistant-1", role="assistant", content="请整体介绍一下你的项目。")],
        interview_state=MockInterviewState(currentRound=2, questionsPerRound={"1": 1, "2": 5}, assistantQuestionCount=5),
    )
    events = [item async for item in service.stream_turn(create_response.sessionId, request)]

    reflection = next(item for item in events if item["event"] == "reflection_result")
    transition = next(item for item in events if item["event"] == "round_transition")
    message_end = next(item for item in events if item["event"] == "message_end")

    assert reflection["data"]["should_continue"] is False
    assert reflection["data"]["suggested_follow_up"] == ""
    assert "5 问上限" in reflection["data"]["reason"]
    assert transition["data"]["from_round"] == 2
    assert transition["data"]["to_round"] == 3
    assert message_end["data"]["interviewState"]["currentRound"] == 3
    assert message_end["data"]["interviewState"]["questionsPerRound"]["2"] == 5
    assert message_end["data"]["interviewState"]["questionsPerRound"]["3"] == 1


@pytest.mark.anyio
async def test_stream_reply_forces_close_when_last_round_reaches_max_questions(
    service: MockInterviewService,
    sample_resume: ResumeData,
    sample_jd_data: JDData,
):
    create_response = await service.create_session(
        MockInterviewSessionCreateRequest(
            interviewType=InterviewType.CAMPUS,
            category=Category.FRONTEND,
            jdText="熟悉 React",
            jdData=sample_jd_data,
            resumeData=sample_resume,
        )
    )

    async def fake_reflection(_session, _answer):
        return ReflectionResult(
            depth_score=4,
            authenticity_score=4,
            completeness_score=4,
            logic_score=4,
            overall_assessment="模型想在最后一轮继续追问。",
            should_continue=True,
            suggested_follow_up="继续补充复杂度和边界处理。",
            reason="模型认为代码题还可继续。",
        )

    service._call_reflection = fake_reflection

    request = make_stream_request(
        create_response,
        sample_resume,
        sample_jd_data,
        mode="reply",
        message="这是最后一轮第 5 问后的回答",
        messages=[MockInterviewMessage(id="assistant-4", role="assistant", content="请分析这段代码的复杂度。")],
        interview_state=MockInterviewState(currentRound=4, questionsPerRound={"1": 1, "2": 2, "3": 3, "4": 5}, assistantQuestionCount=11),
    )
    events = [item async for item in service.stream_turn(create_response.sessionId, request)]

    reflection = next(item for item in events if item["event"] == "reflection_result")
    message_end = next(item for item in events if item["event"] == "message_end")
    done = events[-1]

    assert reflection["data"]["should_continue"] is False
    assert reflection["data"]["suggested_follow_up"] == ""
    assert "5 问上限" in reflection["data"]["reason"]
    assert message_end["data"]["interviewState"]["closed"] is True
    assert message_end["data"]["interviewState"]["questionsPerRound"]["4"] == 5
    assert done["data"]["status"] == "completed"


@pytest.mark.anyio
async def test_reflection_failure_cannot_bypass_topic_question_limit(
    service: MockInterviewService,
    sample_resume: ResumeData,
    sample_jd_data: JDData,
):
    create_response = await service.create_session(
        MockInterviewSessionCreateRequest(
            interviewType=InterviewType.CAMPUS,
            category=Category.FRONTEND,
            jdText="熟悉 React",
            jdData=sample_jd_data,
            resumeData=sample_resume,
        )
    )

    import app.services.mock_interview_service as module

    def raising_invoke_with_fallback(_llm, _messages, _schema):
        raise RuntimeError("reflection boom")

    module.invoke_with_fallback = raising_invoke_with_fallback

    request = make_stream_request(
        create_response,
        sample_resume,
        sample_jd_data,
        mode="reply",
        message="这是第 5 问后的回答",
        messages=[MockInterviewMessage(id="assistant-1", role="assistant", content="请介绍一下你的项目。")],
        interview_state=MockInterviewState(currentRound=2, questionsPerRound={"1": 1, "2": 5}, assistantQuestionCount=5),
    )
    events = [item async for item in service.stream_turn(create_response.sessionId, request)]

    reflection = next(item for item in events if item["event"] == "reflection_result")
    transition = next(item for item in events if item["event"] == "round_transition")
    message_end = next(item for item in events if item["event"] == "message_end")

    assert reflection["data"]["should_continue"] is False
    assert reflection["data"]["suggested_follow_up"] == ""
    assert transition["data"]["to_round"] == 3
    assert message_end["data"]["interviewState"]["questionsPerRound"]["2"] == 5
    assert message_end["data"]["interviewState"]["questionsPerRound"]["3"] == 1


@pytest.mark.anyio
async def test_opening_round_transitions_after_one_question_even_if_reflection_wants_to_continue(
    service: MockInterviewService,
    sample_resume: ResumeData,
    sample_jd_data: JDData,
):
    create_response = await service.create_session(
        MockInterviewSessionCreateRequest(
            interviewType=InterviewType.CAMPUS,
            category=Category.FRONTEND,
            jdText="熟悉 React",
            jdData=sample_jd_data,
            resumeData=sample_resume,
        )
    )

    async def fake_reflection(_session, _answer):
        return ReflectionResult(
            depth_score=4,
            authenticity_score=4,
            completeness_score=4,
            logic_score=4,
            overall_assessment="模型希望继续追问开场内容。",
            should_continue=True,
            suggested_follow_up="继续追问求职动机和个人背景。",
            reason="模型认为开场还有可聊空间。",
        )

    service._call_reflection = fake_reflection

    request = make_stream_request(
        create_response,
        sample_resume,
        sample_jd_data,
        mode="reply",
        message="大家好，我叫小王，主要做前端开发。",
        messages=[MockInterviewMessage(id="assistant-1", role="assistant", content="你好，请先做自我介绍。")],
        interview_state=MockInterviewState(currentRound=1, questionsPerRound={"1": 1}, assistantQuestionCount=1),
    )
    events = [item async for item in service.stream_turn(create_response.sessionId, request)]

    reflection = next(item for item in events if item["event"] == "reflection_result")
    transition = next(item for item in events if item["event"] == "round_transition")
    message_end = next(item for item in events if item["event"] == "message_end")

    assert reflection["data"]["should_continue"] is False
    assert reflection["data"]["suggested_follow_up"] == ""
    assert "开场轮已完成自我介绍热身" in reflection["data"]["reason"]
    assert transition["data"]["from_round"] == 1
    assert transition["data"]["to_round"] == 2
    assert message_end["data"]["interviewState"]["currentRound"] == 2
    assert message_end["data"]["interviewState"]["questionsPerRound"]["1"] == 1
    assert message_end["data"]["interviewState"]["questionsPerRound"]["2"] == 1


@pytest.mark.anyio
async def test_build_interviewer_messages_includes_domain_placeholder(
    service: MockInterviewService,
    sample_resume: ResumeData,
    sample_jd_data: JDData,
):
    create_response = await service.create_session(
        MockInterviewSessionCreateRequest(
            interviewType=InterviewType.CAMPUS,
            category=Category.FRONTEND,
            jdText="熟悉 React",
            jdData=sample_jd_data,
            resumeData=sample_resume,
        )
    )

    session = service._build_ephemeral_session(
        create_response.sessionId,
        make_stream_request(create_response, sample_resume, sample_jd_data, mode="start"),
    )
    prompt_messages = service._build_interviewer_messages(session, close_interview=False)

    assert Category.FRONTEND.value in prompt_messages[0].content


@pytest.mark.anyio
async def test_coding_round_prompt_uses_leetcode_problem(
    service: MockInterviewService,
    sample_resume: ResumeData,
    sample_jd_data: JDData,
):
    create_response = await service.create_session(
        MockInterviewSessionCreateRequest(
            interviewType=InterviewType.CAMPUS,
            category=Category.FRONTEND,
            jdText="熟悉 React",
            jdData=sample_jd_data,
            resumeData=sample_resume,
        )
    )

    request = make_stream_request(
        create_response,
        sample_resume,
        sample_jd_data,
        mode="reply",
        message="这是代码题回答",
        messages=[MockInterviewMessage(id="assistant-4", role="assistant", content="请实现一个 LRU Cache。")],
        interview_state=MockInterviewState(currentRound=4, questionsPerRound={"1": 1, "2": 1, "3": 1, "4": 1}, assistantQuestionCount=4),
    )
    session = service._build_ephemeral_session(create_response.sessionId, request)
    prompt_messages = service._build_interviewer_messages(session, close_interview=False)

    assert create_response.interviewPlan.leetcode_problem in prompt_messages[0].content


@pytest.mark.anyio
async def test_reflection_failure_uses_explicit_fallback_below_limit(
    service: MockInterviewService,
    sample_resume: ResumeData,
    sample_jd_data: JDData,
):
    create_response = await service.create_session(
        MockInterviewSessionCreateRequest(
            interviewType=InterviewType.CAMPUS,
            category=Category.FRONTEND,
            jdText="熟悉 React",
            jdData=sample_jd_data,
            resumeData=sample_resume,
        )
    )

    import app.services.mock_interview_service as module

    def raising_invoke_with_fallback(_llm, _messages, _schema):
        raise RuntimeError("reflection boom")

    module.invoke_with_fallback = raising_invoke_with_fallback

    request = make_stream_request(
        create_response,
        sample_resume,
        sample_jd_data,
        mode="reply",
        message="这是我的回答",
        messages=[MockInterviewMessage(id="assistant-1", role="assistant", content="请介绍一下你的项目。")],
        interview_state=MockInterviewState(currentRound=2, questionsPerRound={"1": 1, "2": 1}, assistantQuestionCount=1),
    )
    events = [item async for item in service.stream_turn(create_response.sessionId, request)]

    reflection = next(item for item in events if item["event"] == "reflection_result")
    assert reflection["data"]["should_continue"] is True
    assert reflection["data"]["suggested_follow_up"]


@pytest.mark.anyio
async def test_stream_reply_rejects_overlong_message(
    service: MockInterviewService,
    sample_resume: ResumeData,
    sample_jd_data: JDData,
):
    create_response = await service.create_session(
        MockInterviewSessionCreateRequest(
            interviewType=InterviewType.CAMPUS,
            category=Category.FRONTEND,
            jdText="熟悉 React",
            jdData=sample_jd_data,
            resumeData=sample_resume,
        )
    )

    request = make_stream_request(
        create_response,
        sample_resume,
        sample_jd_data,
        mode="reply",
        message="a" * 1501,
        messages=[MockInterviewMessage(id="assistant-1", role="assistant", content="你好，先做个自我介绍。")],
        interview_state=MockInterviewState(currentRound=1, questionsPerRound={"1": 1}, assistantQuestionCount=1),
    )
    with pytest.raises(HTTPException) as exc:
        _ = [item async for item in service.stream_turn(create_response.sessionId, request)]

    assert exc.value.status_code == 400


def test_init_disables_rag_when_flag_is_false(monkeypatch):
    import app.services.mock_interview_service as module

    monkeypatch.setattr(module, "get_settings", lambda: Settings(mock_interview_rag=False))
    monkeypatch.setattr(module, "_is_zvec_importable", lambda: True)
    monkeypatch.setattr(MockInterviewService, "_create_chat_model", lambda self, **kwargs: FakeChatModel([]))

    service = MockInterviewService()

    assert service._disable_rag is True


def test_init_enables_rag_when_flag_is_true_and_zvec_available(monkeypatch):
    import app.services.mock_interview_service as module

    monkeypatch.setattr(module, "get_settings", lambda: Settings(mock_interview_rag=True))
    monkeypatch.setattr(module, "_is_zvec_importable", lambda: True)
    monkeypatch.setattr(
        module,
        "_mock_interview_rag_dependencies_available",
        lambda settings_fingerprint="default": True,
        raising=False,
    )
    monkeypatch.setattr(MockInterviewService, "_create_chat_model", lambda self, **kwargs: FakeChatModel([]))

    service = MockInterviewService()

    assert service._disable_rag is False


def test_init_disables_rag_when_required_dependency_check_fails(monkeypatch):
    import app.services.mock_interview_service as module

    fallback_item = InterviewData(
        id=11,
        title="前端通用题",
        content="浏览器渲染与网络",
        publish_time="2025-01-01 10:00:00",
        category=Category.FRONTEND,
        source="mock",
        source_id="fallback-1",
        company="美团",
        stage="一面",
        result=InterviewResult.NULL,
        interview_type=InterviewType.CAMPUS,
    )
    fake_data_service = FakeDataService({(InterviewType.CAMPUS.value, None): [fallback_item]})
    fake_rag_service = FakeRagService(
        MockInterviewRetrievalResult(
            queryText="rag query",
            appliedFilters=MockInterviewRetrievalFilters(category=Category.FRONTEND),
            items=[],
        )
    )

    monkeypatch.setattr(module, "get_settings", lambda: Settings(mock_interview_rag=True))
    monkeypatch.setattr(module, "_is_zvec_importable", lambda: True)
    monkeypatch.setattr(
        module,
        "_mock_interview_rag_dependencies_available",
        lambda settings_fingerprint="default": False,
        raising=False,
    )
    monkeypatch.setattr(module, "get_data_service", lambda: fake_data_service)
    monkeypatch.setattr(MockInterviewService, "_create_chat_model", lambda self, **kwargs: FakeChatModel([]))

    service = MockInterviewService(rag_service=fake_rag_service)
    context = RetrievalQueryContext(
        category=Category.FRONTEND,
        interview_type=InterviewType.CAMPUS,
        resume_data=ResumeData(),
        jd_text="熟悉 React",
        jd_data=JDData(
            basicInfo=JDBasicInfo(company="字节跳动", jobTitle="前端开发工程师"),
            requirements=JDRequirements(),
        ),
    )

    result = service._retrieve_interview_evidence(context)

    assert service._disable_rag is True
    assert service._build_developer_context().ragEnabled is False
    assert fake_rag_service.calls == []
    assert [item.interviewId for item in result.items] == [11]


def test_retrieve_interview_evidence_non_rag_tiers_and_applied_filters(monkeypatch, service: MockInterviewService):
    import app.services.mock_interview_service as module

    strict_1 = InterviewData(
        id=1,
        title="阿里前端校招一面",
        content="React hooks 与工程化实践",
        publish_time="2025-01-05 10:00:00",
        category=Category.FRONTEND,
        source="mock",
        source_id="s1",
        company="阿里巴巴",
        stage="一面",
        result=InterviewResult.NULL,
        interview_type=InterviewType.CAMPUS,
    )
    strict_2 = InterviewData(
        id=2,
        title="阿里前端校招二面",
        content="TypeScript 类型系统",
        publish_time="2025-01-04 10:00:00",
        category=Category.FRONTEND,
        source="mock",
        source_id="s2",
        company="阿里巴巴",
        stage="二面",
        result=InterviewResult.NULL,
        interview_type=InterviewType.CAMPUS,
    )
    tier2_1 = InterviewData(
        id=3,
        title="某厂前端校招",
        content="构建系统优化",
        publish_time="2025-01-03 10:00:00",
        category=Category.FRONTEND,
        source="mock",
        source_id="s3",
        company="字节",
        stage="一面",
        result=InterviewResult.NULL,
        interview_type=InterviewType.CAMPUS,
    )
    tier3_1 = InterviewData(
        id=4,
        title="前端社招深挖",
        content="前端性能与监控",
        publish_time="2025-01-02 10:00:00",
        category=Category.FRONTEND,
        source="mock",
        source_id="s4",
        company="腾讯",
        stage="三面",
        result=InterviewResult.NULL,
        interview_type=InterviewType.SOCIAL,
    )
    tier3_2 = InterviewData(
        id=5,
        title="前端通用题",
        content="浏览器渲染与网络",
        publish_time="2025-01-01 10:00:00",
        category=Category.FRONTEND,
        source="mock",
        source_id="s5",
        company="美团",
        stage="HR面",
        result=InterviewResult.NULL,
        interview_type=None,
    )

    fake_data_service = FakeDataService(
        {
            (InterviewType.CAMPUS.value, "阿里巴巴"): [strict_1, strict_2],
            (InterviewType.CAMPUS.value, None): [strict_2, tier2_1],
            (None, None): [tier3_1, tier3_2],
        }
    )
    monkeypatch.setattr(module, "get_data_service", lambda: fake_data_service)

    context = RetrievalQueryContext(
        category=Category.FRONTEND,
        interview_type=InterviewType.CAMPUS,
        resume_data=ResumeData(),
        jd_text="熟悉 React",
        jd_data=JDData(
            basicInfo=JDBasicInfo(company="阿里巴巴（中国）", jobTitle="前端开发工程师"),
            requirements=JDRequirements(),
        ),
    )

    result, filter_chain = service._retrieve_interview_evidence_non_rag(context)

    assert len(result.items) == 5
    assert [item.interviewId for item in result.items] == [1, 2, 3, 4, 5]
    assert result.appliedFilters.category == Category.FRONTEND
    assert result.appliedFilters.interviewType is None
    assert result.appliedFilters.company is None
    assert len(filter_chain) == 3
    assert filter_chain[0].interviewType == InterviewType.CAMPUS
    assert filter_chain[0].company == "阿里巴巴"
    assert filter_chain[1].interviewType == InterviewType.CAMPUS
    assert filter_chain[1].company is None
    assert filter_chain[2].interviewType is None
    assert filter_chain[2].company is None
    assert fake_data_service.calls[0]["sort_order"] == "desc"
    assert fake_data_service.calls[0]["page"] == 1
    assert fake_data_service.calls[0]["page_size"] == 5
    assert fake_data_service.calls[1]["page_size"] == 3
    assert fake_data_service.calls[2]["page_size"] == 2


def test_retrieve_interview_evidence_non_rag_applied_filters_stays_strict_when_full(monkeypatch, service: MockInterviewService):
    import app.services.mock_interview_service as module

    strict_items = [
        InterviewData(
            id=i,
            title=f"严格命中{i}",
            content="A" * 220,
            publish_time=f"2025-01-0{i} 10:00:00",
            category=Category.FRONTEND,
            source="mock",
            source_id=f"strict-{i}",
            company="阿里巴巴",
            stage="一面",
            result=InterviewResult.NULL,
            interview_type=InterviewType.CAMPUS,
        )
        for i in range(1, 6)
    ]

    fake_data_service = FakeDataService({(InterviewType.CAMPUS.value, "阿里巴巴"): strict_items})
    monkeypatch.setattr(module, "get_data_service", lambda: fake_data_service)

    context = RetrievalQueryContext(
        category=Category.FRONTEND,
        interview_type=InterviewType.CAMPUS,
        resume_data=ResumeData(),
        jd_text="",
        jd_data=JDData(
            basicInfo=JDBasicInfo(company="阿里巴巴 (中国)", jobTitle="前端开发工程师"),
            requirements=JDRequirements(),
        ),
    )

    result, filter_chain = service._retrieve_interview_evidence_non_rag(context)

    assert len(fake_data_service.calls) == 1
    assert len(result.items) == 5
    assert result.queryText == f"{Category.FRONTEND.value}\n{InterviewType.CAMPUS.value}"
    assert result.appliedFilters.category == Category.FRONTEND
    assert result.appliedFilters.interviewType == InterviewType.CAMPUS
    assert result.appliedFilters.company == "阿里巴巴"
    assert len(filter_chain) == 1
    assert filter_chain[0].company == "阿里巴巴"
    assert all(item.score == 0.0 for item in result.items)
    assert all(len(item.snippet) == 180 for item in result.items)
    assert all("公司：阿里巴巴" in item.reason for item in result.items)
