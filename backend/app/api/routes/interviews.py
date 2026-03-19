"""Interview question bank API routes."""

from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from app.schemas.interview import (
    Category,
    InterviewData,
    InterviewListResponse,
    InterviewResult,
    InterviewType,
    StatsResponse,
)
from app.services.interview_service import DataService, get_data_service

router = APIRouter(prefix="/interviews", tags=["interviews"])


@router.get("", response_model=InterviewListResponse)
async def list_interviews(
    categories: Optional[list[Category]] = Query(default=None),
    results: Optional[list[InterviewResult]] = Query(default=None),
    interview_types: Optional[list[InterviewType]] = Query(default=None),
    include_unknown_interview_type: bool = Query(default=False),
    company: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None),
    sort_order: Literal["asc", "desc"] = Query(default="desc"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    data_service: DataService = Depends(get_data_service),
) -> InterviewListResponse:
    """Get paginated list of interviews with optional filters."""
    filtered, total = data_service.filter_interviews(
        categories=categories,
        results=[r.value for r in results] if results else None,
        interview_types=[t.value for t in interview_types] if interview_types else None,
        include_unknown_interview_type=include_unknown_interview_type,
        company=company,
        search=search,
        sort_order=sort_order,
        page=page,
        page_size=page_size,
    )

    total_pages = (total + page_size - 1) // page_size

    return InterviewListResponse(
        items=filtered,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.get("/stats", response_model=StatsResponse)
async def get_stats(
    data_service: DataService = Depends(get_data_service),
) -> StatsResponse:
    """Get statistics about the interview data."""
    stats = data_service.get_stats()
    return StatsResponse(**stats)


@router.get("/companies", response_model=list[str])
async def get_companies(
    data_service: DataService = Depends(get_data_service),
) -> list[str]:
    """Get list of unique companies."""
    return data_service.get_companies()


@router.get("/categories", response_model=list[str])
async def get_categories() -> list[str]:
    """Get list of available categories."""
    return [c.value for c in Category]


@router.get("/{id}", response_model=InterviewData)
async def get_interview(
    id: int,
    data_service: DataService = Depends(get_data_service),
) -> InterviewData:
    """Get a specific interview by integer id."""
    interview = data_service.get_by_id(id)
    if not interview:
        raise HTTPException(status_code=404, detail="Interview not found")
    return interview


@router.get("/{id}/neighbors")
async def get_interview_neighbors(
    id: int,
    categories: Optional[list[Category]] = Query(default=None),
    results: Optional[list[InterviewResult]] = Query(default=None),
    interview_types: Optional[list[InterviewType]] = Query(default=None),
    include_unknown_interview_type: bool = Query(default=False),
    company: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None),
    data_service: DataService = Depends(get_data_service),
) -> dict:
    """Get previous and next interviews for navigation."""
    return data_service.get_neighbors(
        id=id,
        categories=categories,
        results=[r.value for r in results] if results else None,
        interview_types=[t.value for t in interview_types] if interview_types else None,
        include_unknown_interview_type=include_unknown_interview_type,
        company=company,
        search=search,
    )
