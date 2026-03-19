"""JD-based resume optimization API routes."""

import logging

from fastapi import APIRouter, HTTPException

from app.schemas.jd import JDData
from app.schemas.jd_match import JDMatchRequest, JDMatchResult, JDSuggestionsRequest
from app.schemas.resume_optimization import ResumeOverviewResponse, ResumeSuggestionsResponse
from app.services.jd_resume_matcher import JDResumeMatcher
from app.services.runtime_config import resolve_runtime_config

router = APIRouter(prefix="/resume/jd", tags=["jd-optimization"])

MAX_TEXT_LENGTH = 30000
logger = logging.getLogger(__name__)



def _make_error(code: str, message: str) -> dict:
    """Create standardized error response dict."""
    return {"error": {"code": code, "message": message}}



def _jd_data_to_text(jd_data: JDData) -> str:
    """Render structured JD data into plain text for LLM prompts."""
    parts: list[str] = []
    info = jd_data.basicInfo
    if info.jobTitle:
        parts.append(f"职位名称: {info.jobTitle}")
    if info.jobType:
        parts.append(f"工作类型: {info.jobType}")
    if info.location:
        parts.append(f"工作地点: {info.location}")
    if info.company:
        parts.append(f"公司: {info.company}")
    if info.department:
        parts.append(f"部门: {info.department}")

    req = jd_data.requirements
    if req.degree:
        parts.append(f"学历要求: {req.degree}")
    if req.experience:
        parts.append(f"经验要求: {req.experience}")
    if req.techStack:
        parts.append("技术栈:\n- " + "\n- ".join([i for i in req.techStack if i]))
    if req.mustHave:
        parts.append("必备条件:\n- " + "\n- ".join([i for i in req.mustHave if i]))
    if req.niceToHave:
        parts.append("加分项:\n- " + "\n- ".join([i for i in req.niceToHave if i]))
    if req.jobDuties:
        parts.append("岗位职责:\n- " + "\n- ".join([i for i in req.jobDuties if i]))

    return "\n".join(parts).strip()



def _normalize_jd_text(request: JDMatchRequest | JDSuggestionsRequest) -> str:
    jd_text = request.jdText
    if not jd_text and request.jdData:
        jd_text = _jd_data_to_text(request.jdData)
    return jd_text or ""



def _build_matcher(request: JDMatchRequest | JDSuggestionsRequest) -> JDResumeMatcher:
    runtime_config = resolve_runtime_config(request.runtimeConfig)
    return JDResumeMatcher.from_runtime_config(runtime_config)


@router.post("/match", response_model=JDMatchResult)
async def get_jd_match(request: JDMatchRequest):
    """Analyze resume-JD match."""
    if not request.jdText and not request.jdData:
        raise HTTPException(
            status_code=400,
            detail=_make_error("JD_REQUIRED", "Either jdText or jdData is required"),
        )

    jd_text = _normalize_jd_text(request)
    if not jd_text.strip():
        raise HTTPException(
            status_code=400,
            detail=_make_error("EMPTY_TEXT", "JD text content is required"),
        )

    if len(jd_text) > MAX_TEXT_LENGTH:
        raise HTTPException(
            status_code=413,
            detail=_make_error(
                "TEXT_TOO_LARGE",
                f"Text exceeds {MAX_TEXT_LENGTH} character limit",
            ),
        )

    try:
        matcher = _build_matcher(request)
        result, _ = await matcher.match(request.resumeData, jd_text, request.jdData)
        return result
    except Exception:
        logger.exception("JD match failed")
        raise HTTPException(
            status_code=502,
            detail=_make_error("JD_MATCH_FAILED", "Failed to analyze match"),
        )


@router.post("/overview", response_model=ResumeOverviewResponse)
async def get_jd_overview(request: JDMatchRequest):
    """Generate JD-targeted resume overview."""
    if not request.jdText and not request.jdData:
        raise HTTPException(
            status_code=400,
            detail=_make_error("JD_REQUIRED", "Either jdText or jdData is required"),
        )

    jd_text = _normalize_jd_text(request)
    if not jd_text.strip():
        raise HTTPException(
            status_code=400,
            detail=_make_error("EMPTY_TEXT", "JD text content is required"),
        )

    if len(jd_text) > MAX_TEXT_LENGTH:
        raise HTTPException(
            status_code=413,
            detail=_make_error(
                "TEXT_TOO_LARGE",
                f"Text exceeds {MAX_TEXT_LENGTH} character limit",
            ),
        )

    try:
        matcher = _build_matcher(request)
        result, _ = await matcher.get_jd_overview(request.resumeData, jd_text, request.jdData)
        return result
    except Exception:
        logger.exception("JD overview failed")
        raise HTTPException(
            status_code=502,
            detail=_make_error("JD_OVERVIEW_FAILED", "Failed to generate JD overview"),
        )


@router.post("/suggestions", response_model=ResumeSuggestionsResponse)
async def get_jd_suggestions(request: JDSuggestionsRequest):
    """Generate JD-based resume suggestions."""
    if not request.jdText and not request.jdData:
        raise HTTPException(
            status_code=400,
            detail=_make_error("JD_REQUIRED", "Either jdText or jdData is required"),
        )

    jd_text = _normalize_jd_text(request)
    if not jd_text.strip():
        raise HTTPException(
            status_code=400,
            detail=_make_error("EMPTY_TEXT", "JD text content is required"),
        )

    if len(jd_text) > MAX_TEXT_LENGTH:
        raise HTTPException(
            status_code=413,
            detail=_make_error(
                "TEXT_TOO_LARGE",
                f"Text exceeds {MAX_TEXT_LENGTH} character limit",
            ),
        )

    try:
        matcher = _build_matcher(request)
        result, _ = await matcher.get_jd_suggestions(request.resumeData, jd_text, request.jdData)
        return result
    except Exception:
        logger.exception("JD suggestions failed")
        raise HTTPException(
            status_code=502,
            detail=_make_error(
                "JD_SUGGESTIONS_FAILED", "Failed to generate suggestions"
            ),
        )
