"""Interview review APIs."""

from __future__ import annotations

from fastapi import APIRouter, Body, Depends, HTTPException

from app.schemas.interview_review import (
    ReviewExportReportResponse,
    ReviewGenerateReportResponse,
    ReviewOptimizationRequest,
    ReviewOptimizationResponse,
    ReviewSessionDetail,
    ReviewSessionListResponse,
    ReviewUploadSessionResponse,
)
from app.schemas.mock_interview import MockInterviewSessionSnapshot
from app.services.interview_review_service import (
    InterviewReviewNotEligibleError,
    InterviewReviewService,
    get_interview_review_service,
)

router = APIRouter(prefix="/interview-reviews", tags=["interview-reviews"])


@router.get("", response_model=ReviewSessionListResponse)
async def list_interview_reviews(
    service: InterviewReviewService = Depends(get_interview_review_service),
) -> ReviewSessionListResponse:
    return ReviewSessionListResponse(items=service.list_reviews())


@router.post("/upload", response_model=ReviewUploadSessionResponse)
async def upload_interview_review_snapshot(
    snapshot: MockInterviewSessionSnapshot,
    service: InterviewReviewService = Depends(get_interview_review_service),
) -> ReviewUploadSessionResponse:
    try:
        return service.upload_snapshot(snapshot)
    except InterviewReviewNotEligibleError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.get("/{session_id}", response_model=ReviewSessionDetail)
async def get_interview_review_detail(
    session_id: str,
    service: InterviewReviewService = Depends(get_interview_review_service),
) -> ReviewSessionDetail:
    detail = service.get_review(session_id)
    if detail is None:
        raise HTTPException(status_code=409, detail="Interview review report is not ready")
    return detail


@router.post("/{session_id}/generate", response_model=ReviewGenerateReportResponse)
async def generate_interview_review(
    session_id: str,
    snapshot: MockInterviewSessionSnapshot | None = Body(default=None),
    service: InterviewReviewService = Depends(get_interview_review_service),
) -> ReviewGenerateReportResponse:
    if snapshot is not None and snapshot.sessionId != session_id:
        raise HTTPException(status_code=400, detail="Session id mismatch")
    try:
        result = service.generate_review(session_id, snapshot=snapshot)
    except InterviewReviewNotEligibleError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    if result is None:
        raise HTTPException(status_code=404, detail="Mock interview session not found")
    return result


@router.post("/{session_id}/export", response_model=ReviewExportReportResponse)
async def export_interview_review(
    session_id: str,
    service: InterviewReviewService = Depends(get_interview_review_service),
) -> ReviewExportReportResponse:
    try:
        result = service.export_review(session_id)
    except InterviewReviewNotEligibleError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    if result is None:
        raise HTTPException(status_code=404, detail="Mock interview session not found")
    return result


@router.post("/{session_id}/topics/{topic_id}/optimize", response_model=ReviewOptimizationResponse)
async def optimize_interview_review_topic(
    session_id: str,
    topic_id: str,
    request: ReviewOptimizationRequest,
    service: InterviewReviewService = Depends(get_interview_review_service),
) -> ReviewOptimizationResponse:
    if request.sessionId != session_id or request.topicId != topic_id:
        raise HTTPException(status_code=400, detail="Session or topic id mismatch")
    try:
        result = service.optimize_topic(request)
    except InterviewReviewNotEligibleError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    if result is None:
        raise HTTPException(status_code=404, detail="Interview review session or topic not found")
    return result
