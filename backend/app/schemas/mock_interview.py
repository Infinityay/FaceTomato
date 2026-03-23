"""Schemas for mock interview session and streaming APIs."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field, model_validator

from app.schemas.interview import Category, InterviewType
from app.schemas.jd import JDData
from app.schemas.resume import ResumeData
from app.schemas.runtime_config import RuntimeConfig

StreamMode = Literal["start", "reply"]
MessageRole = Literal["assistant", "user"]
MockInterviewCreateStage = Literal["retrieving_evidence", "generating_plan", "session_created"]


OPENING_ROUND_KEYWORDS = ("开场", "自我介绍", "背景", "介绍", "opening", "warm")
PROJECT_ROUND_KEYWORDS = ("项目", "项目概述", "经历", "经验", "overview", "experience")
CODING_ROUND_KEYWORDS = ("代码", "编码", "算法", "编程", "leetcode", "coding")


def _contains_keyword(text: str, keywords: tuple[str, ...]) -> bool:
    normalized = text.lower()
    return any(keyword.lower() in normalized for keyword in keywords)


class MockInterviewRound(BaseModel):
    """A single interview round with topic and description."""

    round: int = Field(ge=1, description="轮次编号")
    topic: str = Field(min_length=1, max_length=100, description="轮次主题")
    description: str = Field(min_length=1, max_length=300, description="轮次描述")


class MockInterviewPlan(BaseModel):
    """Canonical round/topic-driven interview plan."""

    plan: list[MockInterviewRound] = Field(min_length=3, max_length=12)
    total_rounds: int = Field(ge=3, le=12, description="总轮次数")
    estimated_duration: str = Field(min_length=1, max_length=40, description="预计时长")
    leetcode_problem: str = Field(min_length=1, max_length=200, description="代码题题目")

    @model_validator(mode="after")
    def validate_plan(self) -> "MockInterviewPlan":
        if len(self.plan) != self.total_rounds:
            raise ValueError("plan length must match total_rounds")

        expected_rounds = list(range(1, self.total_rounds + 1))
        actual_rounds = [item.round for item in self.plan]
        if actual_rounds != expected_rounds:
            raise ValueError("round numbers must be continuous from 1 to total_rounds")

        first_round_text = f"{self.plan[0].topic} {self.plan[0].description}"
        second_round_text = f"{self.plan[1].topic} {self.plan[1].description}"
        last_round_text = f"{self.plan[-1].topic} {self.plan[-1].description}"

        if not _contains_keyword(first_round_text, OPENING_ROUND_KEYWORDS):
            raise ValueError("first round must be an opening round")
        if not _contains_keyword(second_round_text, PROJECT_ROUND_KEYWORDS):
            raise ValueError("second round must be a project overview round")
        if not _contains_keyword(last_round_text, CODING_ROUND_KEYWORDS):
            raise ValueError("last round must be a coding round")

        return self


class MockInterviewRetrievalFilters(BaseModel):
    """Metadata filters applied to interview retrieval."""

    category: Category | None = None
    interviewType: InterviewType | None = None
    company: str | None = None


class MockInterviewRetrievalItem(BaseModel):
    """A single interview document used as planning evidence."""

    interviewId: int
    source: str = ""
    sourceId: str = ""
    title: str
    company: str | None = None
    category: Category
    interviewType: InterviewType | None = None
    stage: str | None = None
    publishTime: str = ""
    snippet: str = ""
    score: float = 0.0
    reason: str = ""


class MockInterviewRetrievalResult(BaseModel):
    """Interview evidence used during plan generation."""

    queryText: str = ""
    appliedFilters: MockInterviewRetrievalFilters = Field(default_factory=MockInterviewRetrievalFilters)
    items: list[MockInterviewRetrievalItem] = Field(default_factory=list)


class MockInterviewDeveloperContext(BaseModel):
    """Shared developer-facing context for local trace export."""

    sessionMode: Literal["frontend_local_only"] = "frontend_local_only"
    privacyMode: Literal["frontend_local_export_only"] = "frontend_local_export_only"
    ragEnabled: bool = True
    transcriptPersistence: Literal["frontend_local_only"] = "frontend_local_only"
    tracePersistence: Literal["frontend_local_only"] = "frontend_local_only"


class MockInterviewRetrievalTracePayload(BaseModel):
    """Developer trace payload for retrieval stage."""

    queryText: str = ""
    filterChain: list[MockInterviewRetrievalFilters] = Field(default_factory=list)
    appliedFilters: MockInterviewRetrievalFilters = Field(default_factory=MockInterviewRetrievalFilters)
    candidateTopk: int | None = None
    topk: int | None = None
    denseWeight: float | None = None
    sparseWeight: float | None = None
    ragEnabled: bool
    resultItems: list[MockInterviewRetrievalItem] = Field(default_factory=list)
    elapsedMs: int = Field(ge=0)


class MockInterviewPlanTracePayload(BaseModel):
    """Developer trace payload for plan generation stage."""

    promptKey: Literal["plan"] = "plan"
    jdDataIncluded: bool = False
    resumeProjectCount: int = Field(ge=0)
    retrievalItemCount: int = Field(ge=0)
    retrievalQueryText: str = ""
    outputPlan: MockInterviewPlan
    fallbackUsed: bool = False
    elapsedMs: int = Field(ge=0)


class MockInterviewReflectionTracePayload(BaseModel):
    """Developer trace payload for reflection stage."""

    promptKey: Literal["reflection"] = "reflection"
    candidateAnswer: str = Field(min_length=1)
    currentRoundHistory: str = ""
    questionCount: int = Field(ge=0)
    output: ReflectionResult
    fallbackUsed: bool = False
    elapsedMs: int = Field(ge=0)


class MockInterviewInterviewerTracePayload(BaseModel):
    """Developer trace payload for interviewer generation stage."""

    promptKey: Literal["interviewer"] = "interviewer"
    round: int = Field(ge=1)
    topic: str = ""
    suggestedFollowUp: str = ""
    closeInterview: bool = False
    recentConversation: list[dict[str, Any]] = Field(default_factory=list)
    finalMessage: str = ""
    elapsedMs: int = Field(ge=0)


class MockInterviewDeveloperTraceEvent(BaseModel):
    """Structured developer trace event streamed to the frontend."""

    type: Literal["retrieval", "plan_generation", "reflection", "interviewer_generation"]
    createdAt: datetime = Field(default_factory=datetime.utcnow)
    payload: (
        MockInterviewRetrievalTracePayload
        | MockInterviewPlanTracePayload
        | MockInterviewReflectionTracePayload
        | MockInterviewInterviewerTracePayload
    )


class MockInterviewSessionLimits(BaseModel):
    """Runtime limits exposed to frontend."""

    durationMinutes: int = 60
    softInputChars: int = 1200
    maxInputChars: int = 1500
    contextWindowMessages: int = 8
    sessionTtlMinutes: int = 90


class MockInterviewMessage(BaseModel):
    """Stored transcript message."""

    id: str
    role: MessageRole
    content: str
    createdAt: datetime = Field(default_factory=datetime.utcnow)


class ReflectionResult(BaseModel):
    """Reflection evaluation result after each candidate answer."""

    depth_score: int = Field(ge=1, le=5, description="深度分数 (1-5)")
    authenticity_score: int = Field(ge=1, le=5, description="真实性分数 (1-5)")
    completeness_score: int = Field(ge=1, le=5, description="完整性分数 (1-5)")
    logic_score: int = Field(ge=1, le=5, description="逻辑性分数 (1-5)")
    overall_assessment: str = Field(min_length=10, max_length=300, description="整体评价")
    should_continue: bool = Field(description="是否继续当前轮次")
    suggested_follow_up: str = Field(default="", max_length=200, description="建议的追问方向")
    reason: str = Field(min_length=10, max_length=200, description="决策理由")

    @model_validator(mode="after")
    def validate_follow_up(self) -> "ReflectionResult":
        if self.should_continue and not self.suggested_follow_up.strip():
            raise ValueError("suggested_follow_up is required when should_continue is true")
        return self


class MockInterviewState(BaseModel):
    """Canonical runtime state for mock interview streaming."""

    currentRound: int = Field(default=1, ge=1)
    questionsPerRound: dict = Field(default_factory=dict)
    assistantQuestionCount: int = Field(default=0, ge=0)
    turnCount: int = Field(default=0, ge=0)
    reflectionHistory: list[ReflectionResult] = Field(default_factory=list)
    closed: bool = False

    @model_validator(mode="after")
    def normalize_questions_per_round(self) -> "MockInterviewState":
        normalized: dict[str, int] = {}
        for key, value in self.questionsPerRound.items():
            round_number = int(str(key))
            if round_number < 1:
                raise ValueError("questionsPerRound keys must be positive integers")
            if value < 0:
                raise ValueError("questionsPerRound values must be non-negative")
            normalized[str(round_number)] = value

        if str(self.currentRound) not in normalized:
            normalized[str(self.currentRound)] = 0

        self.questionsPerRound = normalized
        return self


class MockInterviewSessionCreateRequest(BaseModel):
    """Create a new mock interview session."""

    interviewType: InterviewType
    category: Category
    jdText: str = ""
    jdData: JDData | None = None
    resumeData: ResumeData
    runtimeConfig: RuntimeConfig | None = None

    @model_validator(mode="after")
    def validate_required_jd(self) -> "MockInterviewSessionCreateRequest":
        if not self.jdText.strip():
            raise ValueError("jdText is required for mock interview sessions")
        if self.jdData is None:
            raise ValueError("jdData is required for mock interview sessions")
        return self


class MockInterviewSessionCreateResponse(BaseModel):
    """Metadata returned after a session is created."""

    sessionId: str
    interviewType: InterviewType
    category: Category
    status: Literal["ready"] = "ready"
    limits: MockInterviewSessionLimits
    interviewPlan: MockInterviewPlan
    interviewState: MockInterviewState
    jdData: JDData | None = None
    retrieval: MockInterviewRetrievalResult = Field(default_factory=MockInterviewRetrievalResult)
    resumeFingerprint: str
    expiresAt: datetime
    developerContext: MockInterviewDeveloperContext | None = None


class MockInterviewCreateProgressEvent(BaseModel):
    """Progress payload for session creation stream."""

    stage: MockInterviewCreateStage
    message: str = Field(min_length=1, max_length=60)


class MockInterviewAnswerAnalysisStartedEvent(BaseModel):
    """Reply-phase status payload emitted before reflection begins."""

    stage: Literal["analyzing_answer"] = "analyzing_answer"
    message: str = Field(default="正在分析你的回答", min_length=1, max_length=60)


class MockInterviewStreamRequest(BaseModel):
    """Request body for streaming the next interviewer turn."""

    mode: StreamMode
    message: Optional[str] = None
    interviewType: InterviewType
    category: Category
    jdText: str = ""
    jdData: JDData | None = None
    resumeSnapshot: ResumeData
    runtimeConfig: RuntimeConfig | None = None
    retrieval: MockInterviewRetrievalResult = Field(default_factory=MockInterviewRetrievalResult)
    interviewPlan: MockInterviewPlan
    interviewState: MockInterviewState
    messages: list[MockInterviewMessage] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_request(self) -> "MockInterviewStreamRequest":
        if self.mode == "reply" and not (self.message or "").strip():
            raise ValueError("message is required when mode is 'reply'")
        if self.interviewState.currentRound > self.interviewPlan.total_rounds:
            raise ValueError("interviewState.currentRound cannot exceed interviewPlan.total_rounds")
        return self


class MockInterviewSessionSnapshot(BaseModel):
    """Frontend-local snapshot used as the single source for review generation."""

    snapshotVersion: int = Field(default=3, ge=1)
    sessionId: str
    interviewType: InterviewType
    category: Category
    status: Literal["ready", "streaming", "completed", "expired"]
    limits: MockInterviewSessionLimits
    jdText: str = ""
    jdData: JDData | None = None
    resumeSnapshot: ResumeData
    retrieval: MockInterviewRetrievalResult = Field(default_factory=MockInterviewRetrievalResult)
    interviewPlan: MockInterviewPlan
    interviewState: MockInterviewState
    messages: list[MockInterviewMessage] = Field(default_factory=list)
    developerContext: MockInterviewDeveloperContext | None = None
    developerTrace: list[MockInterviewDeveloperTraceEvent] = Field(default_factory=list)
    runtimeConfig: RuntimeConfig | None = None
    resumeFingerprint: str = ""
    createdAt: datetime
    lastActiveAt: datetime
    expiresAt: datetime
