"""Resume optimization schemas for Overview and Suggestions."""

from typing import List, Literal

from pydantic import BaseModel, Field, field_validator


# ==================== Type Aliases ====================


SectionName = Literal[
    "basicInfo", "workExperience", "education", "projects", "academicAchievements"
]

IssueType = Literal[
    "missing_info",
    "structure_issue",
    "wording_issue",
    "redundancy",
    "inconsistent_format",
    "timeline_issue",
    "low_signal_content",
    "privacy_risk",
    "cross_section_issue",
    "other",
]

# ==================== Overview Response ====================


class ResumeSummary(BaseModel):
    """Resume summary with headline, highlights, and risks."""

    headline: str = Field(default="", description="一句话总结（<=30字）")
    highlights: List[str] = Field(default_factory=list, description="亮点列表（最多3条）")
    risks: List[str] = Field(default_factory=list, description="风险/短板列表（最多2条）")


class RolePersona(BaseModel):
    """Role persona recommendation based on resume."""

    role: str = Field(default="", description="岗位画像名称")
    fit_reason: str = Field(default="", description="为什么适合（<=35字）")
    best_scene: str = Field(default="", description="最适合的场景/方向（<=25字）")
    gap_tip: str = Field(default="", description="需要补强的一点（<=25字）")


class ResumeOverviewResponse(BaseModel):
    """Response model for resume overview analysis."""

    resume_summary: ResumeSummary = Field(default_factory=ResumeSummary)
    role_personas: List[RolePersona] = Field(default_factory=list)


# ==================== Suggestions Response (Simplified) ====================


class SuggestionLocation(BaseModel):
    """建议定位信息，用于精确指向简历中的条目。"""

    section: SectionName = Field(default="basicInfo", description="所属模块")
    item_index: int | None = Field(
        default=None, ge=0, description="列表项索引，0-based；basicInfo为None"
    )


class SuggestionItem(BaseModel):
    """展示型建议项：问题 → 原文 → 建议。"""

    id: str = Field(default="", description="建议ID，格式: SUG-{SECTION}-{NUM}")
    priority: int = Field(default=1, ge=1, description="全局优先级，1最高")
    issue_type: IssueType = Field(default="other", description="问题类型")
    location: SuggestionLocation = Field(
        default_factory=SuggestionLocation, description="定位信息"
    )
    problem: str = Field(default="", description="问题描述（简洁一句话）")
    original: str = Field(default="", description="原文内容（从简历中复制）")
    suggestion: str = Field(default="", description="建议改写（供用户阅读参考）")

    @field_validator("issue_type", mode="before")
    @classmethod
    def normalize_issue_type(cls, value):
        """Map model-specific issue types to the canonical enum used by frontend/UI."""
        if not isinstance(value, str):
            return "other"
        normalized = value.strip().lower()
        mapping = {
            "jd_alignment": "cross_section_issue",
            "keyword_optimization": "wording_issue",
            "content_enhancement": "low_signal_content",
        }
        return mapping.get(normalized, normalized or "other")


class SectionSuggestions(BaseModel):
    """单个section的建议列表"""

    section: SectionName = Field(default="basicInfo", description="模块名称")
    suggestions: List[SuggestionItem] = Field(default_factory=list)


class ResumeSuggestionsResponse(BaseModel):
    """响应模型"""

    sections: List[SectionSuggestions] = Field(default_factory=list)
