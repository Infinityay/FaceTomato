"""Pydantic models for interview question bank."""

from enum import Enum
from typing import Optional

from pydantic import BaseModel


class Category(str, Enum):
    """Interview category types."""

    LLM_APP = "大模型应用开发"
    LLM_ALGO = "大模型算法"
    BACKEND = "后端开发"
    FRONTEND = "前端开发"
    GAME = "游戏开发"
    SEARCH_REC = "搜广推算法"
    RISK = "风控算法"


class InterviewResult(str, Enum):
    """Interview result types."""

    OFFER = "offer"
    FAIL = "fail"
    NULL = "null"


class InterviewType(str, Enum):
    """Interview type."""

    CAMPUS = "校招"
    SOCIAL = "社招"
    INTERN = "实习"


class InterviewData(BaseModel):
    """Interview data model."""

    id: int
    title: str
    content: str
    publish_time: str
    category: Category
    source: str
    source_id: str
    company: Optional[str] = None
    department: Optional[str] = None
    stage: Optional[str] = None
    result: InterviewResult = InterviewResult.NULL
    interview_type: Optional[InterviewType] = None


class NeighborItem(BaseModel):
    """Lightweight neighbor item for navigation."""

    id: int
    title: str


class InterviewListResponse(BaseModel):
    """Response model for interview list."""

    items: list[InterviewData]
    total: int
    page: int
    page_size: int
    total_pages: int


class StatsResponse(BaseModel):
    """Statistics response model."""

    total: int
    offer_count: int
    companies_count: int
    categories: dict[str, int]
