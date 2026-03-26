"""Prompt-only mock interview service with frontend-only persistence."""

from __future__ import annotations

import asyncio
import hashlib
import json
import re
import subprocess
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from typing import Any, AsyncIterator
from uuid import uuid4

from fastapi import HTTPException
from langchain.chat_models import init_chat_model
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.rate_limiters import InMemoryRateLimiter

from app.core.config import get_settings
from app.services.runtime_config import ResolvedRuntimeConfig
from app.prompts.mock_interview_prompts import get_mock_interview_prompts
from app.schemas.interview import Category, InterviewData, InterviewType
from app.schemas.jd import JDData
from app.schemas.mock_interview import (
    InterviewStyle,
    MockInterviewAnswerAnalysisStartedEvent,
    MockInterviewCreateProgressEvent,
    MockInterviewDeveloperContext,
    MockInterviewDeveloperTraceEvent,
    MockInterviewInterviewerTracePayload,
    MockInterviewMessage,
    MockInterviewPlan,
    MockInterviewPlanTracePayload,
    MockInterviewReflectionTracePayload,
    MockInterviewRetrievalFilters,
    MockInterviewRetrievalItem,
    MockInterviewRetrievalResult,
    MockInterviewRetrievalTracePayload,
    MockInterviewSessionCreateRequest,
    MockInterviewSessionCreateResponse,
    MockInterviewSessionLimits,
    MockInterviewState,
    MockInterviewStreamRequest,
    ReflectionResult,
)
from app.schemas.resume import ResumeData
from app.services.interview_service import get_data_service
from app.utils.structured_output import extract_structured_output_json, invoke_with_fallback


@lru_cache(maxsize=8)
def _mock_interview_rag_dependencies_available(settings_fingerprint: str = "default") -> bool:
    del settings_fingerprint
    if not _is_zvec_importable():
        return False

    try:
        from app.services.interview_embedding_service import ensure_rag_dependencies_available
    except Exception:
        return False

    try:
        ensure_rag_dependencies_available(get_settings())
    except Exception:
        return False
    return True

JD_CHAR_LIMIT = 5000
MAX_QUESTIONS_PER_TOPIC = 5
OPENING_ROUND_MAX_QUESTIONS = 1


@lru_cache(maxsize=1)
def _is_zvec_importable() -> bool:
    """Probe zvec import in a subprocess to avoid crashing current process on SIGILL."""
    result = subprocess.run(
        [sys.executable, "-c", "import zvec"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    )
    return result.returncode == 0


@dataclass(slots=True)
class RetrievalQueryContext:
    category: Category
    interview_type: InterviewType
    resume_data: ResumeData
    jd_text: str = ""
    jd_data: JDData | None = None


@dataclass(slots=True)
class MockInterviewSession:
    session_id: str
    created_at: datetime
    last_active_at: datetime
    expires_at: datetime
    resume_fingerprint: str
    interview_type: InterviewType
    category: Category
    interview_style: InterviewStyle
    jd_text: str
    jd_data: JDData | None
    resume_snapshot: ResumeData
    retrieval_result: MockInterviewRetrievalResult
    interview_plan: MockInterviewPlan
    interview_state: MockInterviewState
    messages: list[MockInterviewMessage]


@dataclass(slots=True)
class LlmCallResult:
    value: Any
    fallback_used: bool


class MockInterviewService:
    """Manage mock interview sessions and model streaming."""

    @classmethod
    def from_runtime_config(
        cls,
        runtime_config: ResolvedRuntimeConfig,
        rag_service=None,
    ) -> "MockInterviewService":
        """Create a request-scoped service from resolved runtime config."""
        return cls(
            model_provider=runtime_config.model_provider,
            api_key=runtime_config.api_key,
            base_url=runtime_config.base_url,
            model=runtime_config.model,
            rag_service=rag_service,
        )

    def __init__(
        self,
        model_provider: str | None = None,
        api_key: str | None = None,
        base_url: str | None = None,
        model: str | None = None,
        rate_limiter: InMemoryRateLimiter | None = None,
        rag_service=None,
    ):
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
        self.plan_llm = self.chat_model.with_structured_output(MockInterviewPlan)
        self.reflection_llm = self.chat_model.with_structured_output(ReflectionResult)
        self.prompts = get_mock_interview_prompts()
        self._rag_service = rag_service
        self._session_ttl_minutes = max(settings.mock_interview_session_ttl_minutes, 10)
        self._plan_generation_timeout_seconds = max(settings.mock_interview_plan_timeout_seconds, 5)
        rag_dependencies_available = _mock_interview_rag_dependencies_available(
            settings.model_dump_json(exclude_none=True)
        )
        self._disable_rag = (not settings.mock_interview_rag) or not rag_dependencies_available
        if settings.mock_interview_rag and not rag_dependencies_available:
            print("   ⚠️ RAG dependencies unavailable, fallback to mock interview mode without RAG")
        self._limits = MockInterviewSessionLimits(sessionTtlMinutes=self._session_ttl_minutes)

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
            return init_chat_model(model, model_provider="anthropic", rate_limiter=rate_limiter)
        raise ValueError(f"Unsupported model provider: {model_provider}")

    def _utcnow(self) -> datetime:
        return datetime.now(timezone.utc)

    def _trim_jd(self, jd_text: str) -> str:
        return jd_text.strip()[:JD_CHAR_LIMIT]

    def _build_resume_fingerprint(self, resume_data: ResumeData) -> str:
        serialized = json.dumps(resume_data.model_dump(mode="json"), ensure_ascii=False, sort_keys=True)
        return hashlib.sha256(serialized.encode("utf-8")).hexdigest()[:24]

    def _new_expires_at(self, now: datetime) -> datetime:
        return now + timedelta(minutes=self._session_ttl_minutes)

    def _get_rag_service(self):
        if self._rag_service is None:
            from app.services.interview_rag_service import get_interview_rag_service

            self._rag_service = get_interview_rag_service()
        return self._rag_service

    def _serialize_json(self, value: Any) -> str:
        return json.dumps(value, ensure_ascii=False, indent=2)

    def _build_developer_context(self) -> MockInterviewDeveloperContext:
        return MockInterviewDeveloperContext(ragEnabled=not self._disable_rag)

    def _build_trace_event(self, trace_type: str, payload: Any) -> dict[str, Any]:
        return {
            "event": "developer_trace",
            "data": MockInterviewDeveloperTraceEvent(type=trace_type, payload=payload).model_dump(mode="json"),
        }

    @staticmethod
    def _build_retrieval_query_text(context: RetrievalQueryContext) -> str:
        query_text = (context.jd_text or "").strip()[:400]
        if query_text:
            return query_text
        return f"{context.category.value}\n{context.interview_type.value}"

    @staticmethod
    def _normalize_company(company: str | None) -> str:
        if not company:
            return ""
        normalized = re.sub(r"[（(].*?[)）]", "", company)
        normalized = re.sub(r"\s+", "", normalized)
        return normalized.strip()

    @staticmethod
    def _build_snippet(content: str) -> str:
        compact = " ".join((content or "").split())
        return compact[:180]

    def _build_retrieval_reason(self, interview: InterviewData, snippet: str) -> str:
        reasons: list[str] = []
        if interview.company:
            reasons.append(f"公司：{interview.company}")
        if interview.interview_type:
            reasons.append(f"类型：{interview.interview_type.value}")
        if interview.stage:
            reasons.append(f"阶段：{interview.stage}")
        if snippet:
            reasons.append(f"片段：{snippet[:60]}")
        return "；".join(reasons)

    def _to_retrieval_item(self, interview: InterviewData) -> MockInterviewRetrievalItem:
        snippet = self._build_snippet(interview.content)
        return MockInterviewRetrievalItem(
            interviewId=interview.id,
            source=interview.source,
            sourceId=interview.source_id,
            title=interview.title,
            company=interview.company,
            category=interview.category,
            interviewType=interview.interview_type,
            stage=interview.stage,
            publishTime=interview.publish_time,
            snippet=snippet,
            score=0.0,
            reason=self._build_retrieval_reason(interview, snippet),
        )

    def _retrieve_interview_evidence_non_rag(
        self, context: RetrievalQueryContext
    ) -> tuple[MockInterviewRetrievalResult, list[MockInterviewRetrievalFilters]]:
        topk = 5
        remaining = topk
        seen_ids: set[int] = set()
        selected: list[InterviewData] = []

        company = self._normalize_company(context.jd_data.basicInfo.company if context.jd_data else "")
        filter_chain: list[MockInterviewRetrievalFilters] = []
        applied_filters: MockInterviewRetrievalFilters | None = None

        tiers = [
            {
                "category": context.category,
                "interview_type": context.interview_type,
                "company": company or None,
            },
            {
                "category": context.category,
                "interview_type": context.interview_type,
                "company": None,
            },
            {
                "category": context.category,
                "interview_type": None,
                "company": None,
            },
        ]

        data_service = get_data_service()
        for tier in tiers:
            if remaining <= 0:
                break
            interviews, _ = data_service.filter_interviews(
                categories=[tier["category"]],
                interview_types=[tier["interview_type"].value] if tier["interview_type"] else None,
                company=tier["company"],
                sort_order="desc",
                page=1,
                page_size=remaining,
            )
            added_count = 0
            for interview in interviews:
                if interview.id in seen_ids:
                    continue
                seen_ids.add(interview.id)
                selected.append(interview)
                added_count += 1
                remaining -= 1
                if remaining <= 0:
                    break

            tier_filter = MockInterviewRetrievalFilters(
                category=tier["category"],
                interviewType=tier["interview_type"],
                company=tier["company"],
            )
            filter_chain.append(tier_filter)
            if added_count > 0:
                applied_filters = tier_filter

        result = MockInterviewRetrievalResult(
            queryText=self._build_retrieval_query_text(context),
            appliedFilters=applied_filters
            or MockInterviewRetrievalFilters(
                category=context.category,
                interviewType=context.interview_type,
                company=company or None,
            ),
            items=[self._to_retrieval_item(interview) for interview in selected[:topk]],
        )
        return result, filter_chain

    def _retrieve_interview_evidence(self, context: RetrievalQueryContext) -> MockInterviewRetrievalResult:
        if self._disable_rag:
            result, _ = self._retrieve_interview_evidence_non_rag(context)
            return result
        return self._get_rag_service().retrieve_for_plan(context)

    def _build_plan_messages(
        self,
        request: MockInterviewSessionCreateRequest,
        jd_data: JDData | None,
        retrieval_result: MockInterviewRetrievalResult,
    ) -> list[SystemMessage]:
        prompt = self.prompts["plan"].format(
            domain=request.category.value,
            jd_info=self._serialize_json(jd_data.model_dump(mode="json") if jd_data else {}),
            resume_info=self._serialize_json(request.resumeData.model_dump(mode="json")),
            retrieved_interviews=self._serialize_json(retrieval_result.model_dump(mode="json")),
        )
        return [SystemMessage(content=prompt)]

    def _normalize_plan_payload(self, payload: Any) -> Any:
        if not isinstance(payload, dict):
            return payload

        plan_items = payload.get("plan")
        if not isinstance(plan_items, list) or not plan_items:
            return payload

        normalized_plan: list[Any] = []
        for index, item in enumerate(plan_items, start=1):
            if isinstance(item, dict):
                normalized_item = dict(item)
                normalized_item["round"] = index
                normalized_plan.append(normalized_item)
            else:
                normalized_plan.append(item)

        normalized_payload = dict(payload)
        normalized_payload["plan"] = normalized_plan
        normalized_payload["total_rounds"] = len(normalized_plan)
        return normalized_payload

    def _validate_normalized_plan_payload(self, payload: Any) -> MockInterviewPlan | None:
        normalized_payload = self._normalize_plan_payload(payload)
        try:
            return MockInterviewPlan.model_validate(normalized_payload)
        except Exception:
            return None

    def _generate_plan(
        self,
        request: MockInterviewSessionCreateRequest,
        jd_data: JDData | None,
        retrieval_result: MockInterviewRetrievalResult,
    ) -> LlmCallResult:
        messages = self._build_plan_messages(request, jd_data, retrieval_result)
        try:
            return LlmCallResult(value=self.plan_llm.invoke(messages), fallback_used=False)
        except Exception as exc:
            print(f"   ⚠️ Plan generation primary invoke failed: {exc.__class__.__name__}: {exc}")
            normalized = self._validate_normalized_plan_payload(extract_structured_output_json(exc))
            if normalized is not None:
                print("   ℹ️ Plan generation recovered from structured output payload")
                return LlmCallResult(value=normalized, fallback_used=True)
            print("   ℹ️ Plan generation entering fallback invoke")
            return LlmCallResult(
                value=invoke_with_fallback(self.plan_llm, messages, MockInterviewPlan),
                fallback_used=True,
            )

    def _build_retrieval_context(self, request: MockInterviewSessionCreateRequest) -> RetrievalQueryContext:
        return RetrievalQueryContext(
            category=request.category,
            interview_type=request.interviewType,
            resume_data=request.resumeData,
            jd_text=self._trim_jd(request.jdText),
            jd_data=request.jdData,
        )

    async def _run_retrieval(self, request: MockInterviewSessionCreateRequest) -> tuple[MockInterviewRetrievalResult, dict[str, Any]]:
        loop = asyncio.get_running_loop()
        context = self._build_retrieval_context(request)
        start = time.perf_counter()
        non_rag_filter_chain: list[MockInterviewRetrievalFilters] = []
        if self._disable_rag:
            result, non_rag_filter_chain = await loop.run_in_executor(
                None,
                lambda: self._retrieve_interview_evidence_non_rag(context),
            )
        else:
            result = await loop.run_in_executor(None, lambda: self._retrieve_interview_evidence(context))
        elapsed_ms = round((time.perf_counter() - start) * 1000)
        rag_debug = None
        if not self._disable_rag:
            rag_service = self._get_rag_service()
            if hasattr(rag_service, "get_last_debug"):
                rag_debug = rag_service.get_last_debug()
        trace_meta = {
            "queryText": rag_debug.query_text if rag_debug else result.queryText,
            "filterChain": [item.model_dump(mode="json") for item in (rag_debug.filter_chain if rag_debug else [])]
            if rag_debug
            else [item.model_dump(mode="json") for item in non_rag_filter_chain],
            "appliedFilters": (rag_debug.applied_filters if rag_debug else result.appliedFilters).model_dump(mode="json"),
            "candidateTopk": rag_debug.candidate_topk if rag_debug else None,
            "topk": rag_debug.topk if rag_debug else None,
            "denseWeight": rag_debug.dense_weight if rag_debug else None,
            "sparseWeight": rag_debug.sparse_weight if rag_debug else None,
            "resultItems": [item.model_dump(mode="json") for item in (rag_debug.selected_items if rag_debug else result.items)],
            "elapsedMs": elapsed_ms,
            "ragEnabled": not self._disable_rag,
        }
        return result, trace_meta

    async def _run_plan_generation(
        self,
        request: MockInterviewSessionCreateRequest,
        retrieval_result: MockInterviewRetrievalResult,
    ) -> tuple[MockInterviewPlan, dict[str, Any]]:
        loop = asyncio.get_running_loop()
        start = time.perf_counter()
        timeout_seconds = self._plan_generation_timeout_seconds
        print(
            "   ▶️ Entering mock interview plan generation "
            f"(timeout={timeout_seconds}s, category={request.category.value}, type={request.interviewType.value})"
        )
        try:
            result = await asyncio.wait_for(
                loop.run_in_executor(
                    None,
                    lambda: self._generate_plan(request, request.jdData, retrieval_result),
                ),
                timeout=timeout_seconds,
            )
        except asyncio.TimeoutError as exc:
            elapsed = time.perf_counter() - start
            message = (
                f"生成面试计划超时（{timeout_seconds}s），请检查模型服务状态、API 配置或稍后重试。"
            )
            print(f"   ❌ Mock interview plan generation timed out after {elapsed:.2f}s")
            raise HTTPException(status_code=504, detail=message) from exc
        except Exception as exc:
            elapsed = time.perf_counter() - start
            print(
                "   ❌ Mock interview plan generation failed "
                f"after {elapsed:.2f}s: {exc.__class__.__name__}: {exc}"
            )
            raise

        elapsed = time.perf_counter() - start
        print(f"   ✅ Mock interview plan generation completed in {elapsed:.2f}s")
        elapsed_ms = round(elapsed * 1000)
        trace_meta = {
            "jdDataIncluded": request.jdData is not None,
            "resumeProjectCount": len(request.resumeData.projects),
            "retrievalItemCount": len(retrieval_result.items),
            "retrievalQueryText": retrieval_result.queryText,
            "outputPlan": result.value.model_dump(mode="json"),
            "fallbackUsed": result.fallback_used,
            "elapsedMs": elapsed_ms,
        }
        return result.value, trace_meta

    def _build_initial_state(self) -> MockInterviewState:
        return MockInterviewState(
            currentRound=1,
            questionsPerRound={"1": 0},
            assistantQuestionCount=0,
            turnCount=0,
            reflectionHistory=[],
            closed=False,
        )

    def _build_session_create_response(
        self,
        *,
        session_id: str,
        interview_type: InterviewType,
        category: Category,
        jd_data: JDData | None,
        retrieval_result: MockInterviewRetrievalResult,
        plan: MockInterviewPlan,
        interview_state: MockInterviewState,
        resume_fingerprint: str,
        expires_at: datetime,
    ) -> MockInterviewSessionCreateResponse:
        return MockInterviewSessionCreateResponse(
            sessionId=session_id,
            interviewType=interview_type,
            category=category,
            limits=self._limits,
            interviewPlan=plan,
            interviewState=interview_state,
            jdData=jd_data,
            retrieval=retrieval_result,
            resumeFingerprint=resume_fingerprint,
            expiresAt=expires_at,
            developerContext=self._build_developer_context(),
        )

    async def create_session(self, request: MockInterviewSessionCreateRequest) -> MockInterviewSessionCreateResponse:
        start_all = time.perf_counter()
        retrieval_result, retrieval_trace = await self._run_retrieval(request)
        plan, plan_trace = await self._run_plan_generation(request, retrieval_result)
        total_elapsed = time.perf_counter() - start_all
        print(
            f"   ⏱️ Mock interview retrieval: {retrieval_trace['elapsedMs'] / 1000:.2f}s | "
            f"plan: {plan_trace['elapsedMs'] / 1000:.2f}s | total (wall): {total_elapsed:.2f}s"
        )
        now = self._utcnow()
        return self._build_session_create_response(
            session_id=str(uuid4()),
            interview_type=request.interviewType,
            category=request.category,
            jd_data=request.jdData,
            retrieval_result=retrieval_result,
            plan=plan,
            interview_state=self._build_initial_state(),
            resume_fingerprint=self._build_resume_fingerprint(request.resumeData),
            expires_at=self._new_expires_at(now),
        )

    async def stream_create_session(self, request: MockInterviewSessionCreateRequest) -> AsyncIterator[dict[str, Any]]:
        start_all = time.perf_counter()
        yield {
            "event": "progress",
            "data": MockInterviewCreateProgressEvent(
                stage="retrieving_evidence",
                message="正在检索相关面经",
            ).model_dump(mode="json"),
        }

        retrieval_result, retrieval_trace = await self._run_retrieval(request)
        yield self._build_trace_event(
            "retrieval",
            MockInterviewRetrievalTracePayload(**retrieval_trace),
        )

        yield {
            "event": "progress",
            "data": MockInterviewCreateProgressEvent(
                stage="generating_plan",
                message="正在生成面试计划",
            ).model_dump(mode="json"),
        }

        plan, plan_trace = await self._run_plan_generation(request, retrieval_result)
        yield self._build_trace_event(
            "plan_generation",
            MockInterviewPlanTracePayload(**plan_trace),
        )
        total_elapsed = time.perf_counter() - start_all
        print(
            f"   ⏱️ Mock interview retrieval: {retrieval_trace['elapsedMs'] / 1000:.2f}s | "
            f"plan: {plan_trace['elapsedMs'] / 1000:.2f}s | total (wall): {total_elapsed:.2f}s"
        )
        now = self._utcnow()
        session_id = str(uuid4())
        response = self._build_session_create_response(
            session_id=session_id,
            interview_type=request.interviewType,
            category=request.category,
            jd_data=request.jdData,
            retrieval_result=retrieval_result,
            plan=plan,
            interview_state=self._build_initial_state(),
            resume_fingerprint=self._build_resume_fingerprint(request.resumeData),
            expires_at=self._new_expires_at(now),
        )
        session_payload = response.model_dump(mode="json")
        session_payload["developerContext"] = self._build_developer_context().model_dump(mode="json")
        yield {"event": "session_created", "data": session_payload}
        yield {"event": "done", "data": {"sessionId": session_id, "status": "ready"}}

    def _ensure_stream_allowed(self, session: MockInterviewSession, request: MockInterviewStreamRequest) -> None:
        if session.interview_state.closed:
            raise HTTPException(status_code=409, detail="Mock interview session already completed")
        if request.mode == "start" and session.interview_state.assistantQuestionCount > 0:
            raise HTTPException(status_code=409, detail="Interview session already started")
        if request.mode == "reply" and session.interview_state.assistantQuestionCount == 0:
            raise HTTPException(status_code=409, detail="Interview session has not started yet")

    def _build_ephemeral_session(self, session_id: str, request: MockInterviewStreamRequest) -> MockInterviewSession:
        now = self._utcnow()
        return MockInterviewSession(
            session_id=session_id,
            created_at=now,
            last_active_at=now,
            expires_at=self._new_expires_at(now),
            resume_fingerprint="frontend-only",
            interview_type=request.interviewType,
            category=request.category,
            interview_style=request.interviewStyle,
            jd_text=self._trim_jd(request.jdText),
            jd_data=request.jdData,
            resume_snapshot=request.resumeSnapshot,
            retrieval_result=request.retrieval,
            interview_plan=request.interviewPlan,
            interview_state=request.interviewState.model_copy(deep=True),
            messages=list(request.messages),
        )

    def _get_current_round_key(self, session: MockInterviewSession) -> str:
        return str(session.interview_state.currentRound)

    def _ensure_current_round_bucket(self, session: MockInterviewSession) -> None:
        key = self._get_current_round_key(session)
        if key not in session.interview_state.questionsPerRound:
            session.interview_state.questionsPerRound[key] = 0

    def _get_current_round(self, session: MockInterviewSession):
        return session.interview_plan.plan[session.interview_state.currentRound - 1]

    def _is_last_round(self, session: MockInterviewSession) -> bool:
        return session.interview_state.currentRound >= session.interview_plan.total_rounds

    def _is_coding_round(self, session: MockInterviewSession) -> bool:
        return self._is_last_round(session)

    def _get_current_round_question_count(self, session: MockInterviewSession) -> int:
        return session.interview_state.questionsPerRound.get(self._get_current_round_key(session), 0)

    def _get_round_question_limit(self, session: MockInterviewSession) -> int:
        if session.interview_state.currentRound == 1:
            return OPENING_ROUND_MAX_QUESTIONS
        return MAX_QUESTIONS_PER_TOPIC

    def _normalize_reflection_for_round_limit(
        self,
        session: MockInterviewSession,
        reflection_result: ReflectionResult,
        current_round_question_count: int,
    ) -> ReflectionResult:
        question_limit = self._get_round_question_limit(session)
        if current_round_question_count < question_limit:
            return reflection_result

        if self._is_last_round(session):
            reason = f"当前 topic 已达到 {question_limit} 问上限，结束面试。"
        elif session.interview_state.currentRound == 1:
            reason = "开场轮已完成自我介绍热身，进入下一轮。"
        else:
            reason = f"当前 topic 已达到 {question_limit} 问上限，进入下一轮。"

        return reflection_result.model_copy(
            update={
                "should_continue": False,
                "suggested_follow_up": "",
                "reason": reason,
            }
        )

    def _advance_to_next_round(self, session: MockInterviewSession) -> tuple[int, int]:
        from_round = session.interview_state.currentRound
        session.interview_state.currentRound += 1
        self._ensure_current_round_bucket(session)
        return from_round, session.interview_state.currentRound

    def _append_reflection(self, session: MockInterviewSession, reflection: ReflectionResult) -> None:
        session.interview_state.reflectionHistory.append(reflection)

    def _record_assistant_question(self, session: MockInterviewSession) -> None:
        self._ensure_current_round_bucket(session)
        key = self._get_current_round_key(session)
        question_limit = self._get_round_question_limit(session)
        next_count = min(session.interview_state.questionsPerRound[key] + 1, question_limit)
        session.interview_state.questionsPerRound[key] = next_count
        session.interview_state.assistantQuestionCount += 1

    def _get_current_round_messages(self, session: MockInterviewSession) -> str:
        current_round_count = session.interview_state.questionsPerRound.get(self._get_current_round_key(session), 0)
        if current_round_count <= 0 or not session.messages:
            return ""

        assistant_seen = 0
        start_index = 0
        for index in range(len(session.messages) - 1, -1, -1):
            if session.messages[index].role == "assistant":
                assistant_seen += 1
                if assistant_seen == current_round_count:
                    start_index = index
                    break

        round_messages = session.messages[start_index:]
        formatted: list[str] = []
        for message in round_messages:
            role = "面试官" if message.role == "assistant" else "候选人"
            formatted.append(f"{role}: {message.content}")
        return "\n\n".join(formatted)

    def _build_reflection_messages(self, session: MockInterviewSession, candidate_answer: str) -> list[SystemMessage]:
        current_round = self._get_current_round(session)
        prompt = self.prompts["reflection"].format(
            current_round=session.interview_state.currentRound,
            total_rounds=session.interview_plan.total_rounds,
            round_topic=current_round.topic,
            current_description=current_round.description,
            candidate_last_answer=candidate_answer,
            current_round_history=self._get_current_round_messages(session),
            current_round_question_count=self._get_current_round_question_count(session),
        )
        return [SystemMessage(content=prompt)]

    def _fallback_reflection(self) -> ReflectionResult:
        return ReflectionResult(
            depth_score=3,
            authenticity_score=3,
            completeness_score=3,
            logic_score=3,
            overall_assessment="系统反思暂时不可用，建议再补充一个更具体的真实案例。",
            should_continue=True,
            suggested_follow_up="请结合一个具体项目案例继续展开，并补充关键技术细节。",
            reason="反思调用失败，默认继续当前轮次以避免中断流程。",
        )

    async def _call_reflection(self, session: MockInterviewSession, candidate_answer: str) -> tuple[ReflectionResult, bool, int, str]:
        loop = asyncio.get_running_loop()
        messages = self._build_reflection_messages(session, candidate_answer)
        history = self._get_current_round_messages(session)
        started_at = time.perf_counter()
        try:
            result = await loop.run_in_executor(
                None,
                lambda: invoke_with_fallback(self.reflection_llm, messages, ReflectionResult),
            )
            return result, False, round((time.perf_counter() - started_at) * 1000), history
        except Exception as exc:
            print(f"⚠️ Reflection failed: {exc}, using explicit fallback")
            return self._fallback_reflection(), True, round((time.perf_counter() - started_at) * 1000), history

    def _recent_conversation(self, session: MockInterviewSession) -> list[dict[str, Any]]:
        recent_messages = session.messages[-self._limits.contextWindowMessages :]
        return [message.model_dump(mode="json") for message in recent_messages]

    @staticmethod
    def _get_style_instruction(interview_style: InterviewStyle) -> str:
        if interview_style == "pressure_followup":
            return (
                "追问压力型：保持专业但更有压迫感，优先做真实性核验和连续追问；"
                "当回答模糊、空泛或自相矛盾时，直接指出并要求给出可验证细节（指标、边界、失败案例、取舍理由），"
                "在同一 topic 内可适度提高追问密度。"
            )
        return (
            "温和引导型：保持耐心、友好和建设性反馈，先用短问题帮助候选人把答案说完整，再逐步深入；"
            "在指出问题时语气克制，优先给一次补充表达机会。"
        )

    def _build_interviewer_messages(
        self,
        session: MockInterviewSession,
        close_interview: bool,
        reflection_result: ReflectionResult | None = None,
    ) -> list[SystemMessage | HumanMessage]:
        current_round = self._get_current_round(session)
        suggested_follow_up = reflection_result.suggested_follow_up if reflection_result else ""
        is_coding_round = self._is_coding_round(session)
        leetcode_problem = session.interview_plan.leetcode_problem if is_coding_round else ""
        prompt = self.prompts["interviewer"].format(
            domain=session.category.value,
            style_instruction=self._get_style_instruction(session.interview_style),
            current_round=session.interview_state.currentRound,
            total_rounds=session.interview_plan.total_rounds,
            current_topic=current_round.topic,
            current_description=current_round.description,
            interview_plan=self._serialize_json(session.interview_plan.model_dump(mode="json")),
            jd_info=self._serialize_json(session.jd_data.model_dump(mode="json") if session.jd_data else {}),
            resume_info=self._serialize_json(session.resume_snapshot.model_dump(mode="json")),
            retrieved_interviews=self._serialize_json(session.retrieval_result.model_dump(mode="json")),
            conversation_history=self._serialize_json(self._recent_conversation(session)),
            suggested_follow_up=suggested_follow_up,
            leetcode_problem=leetcode_problem,
        )
        if close_interview:
            prompt += "\n\nCLOSE_INTERVIEW"
        payload = {
            "mode": "closing" if close_interview else "question",
            "isCodingRound": is_coding_round,
        }
        return [
            SystemMessage(content=prompt),
            HumanMessage(content=f"input_json:\n{self._serialize_json(payload)}"),
        ]

    def _touch_session(self, session: MockInterviewSession) -> None:
        now = self._utcnow()
        session.last_active_at = now
        session.expires_at = self._new_expires_at(now)

    async def stream_turn(
        self,
        session_id: str,
        request: MockInterviewStreamRequest,
        recovery_token: str = "",
    ) -> AsyncIterator[dict[str, Any]]:
        del recovery_token
        session = self._build_ephemeral_session(session_id, request)
        self._ensure_stream_allowed(session, request)
        self._ensure_current_round_bucket(session)

        reflection_result: ReflectionResult | None = None
        close_interview = False

        if request.mode == "reply":
            message = (request.message or "").strip()
            if len(message) > self._limits.maxInputChars:
                raise HTTPException(status_code=400, detail="回答长度不能超过 1500 字")

            user_message = MockInterviewMessage(id=f"user-{uuid4()}", role="user", content=message)
            session.messages.append(user_message)
            session.interview_state.turnCount += 1
            self._touch_session(session)
            yield {"event": "user_message", "data": user_message.model_dump(mode="json")}
            yield {
                "event": "answer_analysis_started",
                "data": MockInterviewAnswerAnalysisStartedEvent().model_dump(mode="json"),
            }

            reflection_call_result = await self._call_reflection(session, message)
            if isinstance(reflection_call_result, tuple) and len(reflection_call_result) == 4:
                reflection_result, reflection_fallback_used, reflection_elapsed_ms, round_history = reflection_call_result
            else:
                reflection_result = reflection_call_result
                reflection_fallback_used = False
                reflection_elapsed_ms = 0
                round_history = self._get_current_round_messages(session)
            current_round_question_count = self._get_current_round_question_count(session)
            reflection_result = self._normalize_reflection_for_round_limit(
                session,
                reflection_result,
                current_round_question_count,
            )
            self._append_reflection(session, reflection_result)
            yield {"event": "reflection_result", "data": reflection_result.model_dump(mode="json")}
            yield self._build_trace_event(
                "reflection",
                MockInterviewReflectionTracePayload(
                    candidateAnswer=message,
                    currentRoundHistory=round_history,
                    questionCount=current_round_question_count,
                    output=reflection_result,
                    fallbackUsed=reflection_fallback_used,
                    elapsedMs=reflection_elapsed_ms,
                ),
            )

            if reflection_result.should_continue:
                close_interview = False
            elif self._is_last_round(session):
                session.interview_state.closed = True
                close_interview = True
            else:
                from_round, to_round = self._advance_to_next_round(session)
                yield {
                    "event": "round_transition",
                    "data": {
                        "from_round": from_round,
                        "to_round": to_round,
                        "topic": self._get_current_round(session).topic,
                    },
                }

        assistant_message_id = f"assistant-{uuid4()}"
        yield {"event": "message_start", "data": {"messageId": assistant_message_id, "role": "assistant"}}

        aggregated_text = ""
        started_at = time.perf_counter()
        messages = self._build_interviewer_messages(session, close_interview=close_interview, reflection_result=reflection_result)
        async for chunk in self.chat_model.astream(messages):
            text = self._extract_chunk_text(chunk)
            if not text:
                continue
            aggregated_text += text
            yield {"event": "message_delta", "data": {"messageId": assistant_message_id, "delta": text}}

        final_text = aggregated_text.strip()
        assistant_message = MockInterviewMessage(id=assistant_message_id, role="assistant", content=final_text)
        session.messages.append(assistant_message)
        self._touch_session(session)
        interviewer_elapsed_ms = round((time.perf_counter() - started_at) * 1000)

        if close_interview:
            session.interview_state.closed = True
        else:
            self._record_assistant_question(session)

        interview_state_payload = session.interview_state.model_dump(mode="json")
        yield {
            "event": "message_end",
            "data": {
                "messageId": assistant_message_id,
                "content": final_text,
                "interviewState": interview_state_payload,
                "elapsedMs": interviewer_elapsed_ms,
            },
        }
        yield self._build_trace_event(
            "interviewer_generation",
            MockInterviewInterviewerTracePayload(
                round=session.interview_state.currentRound,
                topic=self._get_current_round(session).topic,
                suggestedFollowUp=reflection_result.suggested_follow_up if reflection_result else "",
                closeInterview=close_interview,
                recentConversation=self._recent_conversation(session),
                finalMessage=final_text,
                elapsedMs=interviewer_elapsed_ms,
            ),
        )
        yield {
            "event": "done",
            "data": {
                "sessionId": session.session_id,
                "status": "completed" if session.interview_state.closed else "ready",
                "interviewState": interview_state_payload,
            },
        }

    def _extract_chunk_text(self, chunk: Any) -> str:
        content = getattr(chunk, "content", "")
        if isinstance(content, str):
            return content
        if isinstance(content, list):
            parts: list[str] = []
            for item in content:
                if isinstance(item, str):
                    parts.append(item)
                elif isinstance(item, dict) and isinstance(item.get("text"), str):
                    parts.append(item["text"])
                elif hasattr(item, "get") and isinstance(item.get("text"), str):
                    parts.append(item.get("text"))
                elif hasattr(item, "text") and isinstance(item.text, str):
                    parts.append(item.text)
            return "".join(parts)
        return ""


_service: MockInterviewService | None = None


def get_mock_interview_service() -> MockInterviewService:
    global _service
    if _service is None:
        _service = MockInterviewService()
    return _service
