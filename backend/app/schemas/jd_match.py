"""JD match schemas for resume-JD matching optimization."""

from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, Field, field_validator

from app.schemas.jd import JDData
from app.schemas.resume import ResumeData
from app.schemas.resume_optimization import SuggestionItem, SuggestionLocation
from app.schemas.runtime_config import RuntimeConfig


# ==================== JD Requirements ====================


class JDRequirement(BaseModel):
    """JD 单条要求."""

    id: str = Field(default="", description="要求ID，格式: {category}-{index}")
    category: Literal[
        "mustHave", "niceToHave", "degree", "experience", "techStack", "jobDuties"
    ] = Field(default="mustHave", description="要求类别")
    text: str = Field(default="", description="要求内容")


class CorrectionDetails(BaseModel):
    """修正详情，用于前端展示."""

    original_score: float = Field(description="原始分数")
    original_evidence: List[str] = Field(
        default_factory=list, description="原始证据"
    )
    reason: str = Field(description="修正原因")


class JDRequirementMatch(BaseModel):
    """JD 要求匹配结果."""

    requirementId: str = Field(default="", description="要求ID")
    requirementText: str = Field(default="", description="要求文本")
    category: str = Field(default="", description="要求类别")
    score: float = Field(
        default=0, ge=0, le=1, description="匹配得分：0=未提及，0.5=提到但不具体，1=有明确场景或量化结果"
    )
    evidence: List[str] = Field(
        default_factory=list, description="匹配证据，格式: section[index].field: snippet"
    )
    rationale: str = Field(default="", description="评分理由")
    correction: Optional[CorrectionDetails] = Field(
        default=None, description="修正详情（若经过二次校验修正）"
    )


# ==================== Match Summary ====================


class CategoryScores(BaseModel):
    """分类得分，固定字段以兼容 OpenAI Structured Output."""

    mustHave: float = Field(default=0, ge=0, le=1, description="必备条件得分比例")
    niceToHave: float = Field(default=0, ge=0, le=1, description="加分项得分比例")
    degree: float = Field(default=0, ge=0, le=1, description="学历要求得分比例")
    experience: float = Field(default=0, ge=0, le=1, description="经验要求得分比例")
    techStack: float = Field(default=0, ge=0, le=1, description="技术栈得分比例")
    jobDuties: float = Field(default=0, ge=0, le=1, description="岗位职责得分比例")


class JDMatchSummary(BaseModel):
    """匹配分数汇总."""

    totalScore: float = Field(default=0, description="总分")
    maxScore: float = Field(default=0, description="满分")
    percent: float = Field(default=0, ge=0, le=1, description="得分比例 0-1")
    byCategory: CategoryScores = Field(
        default_factory=CategoryScores, description="分类得分比例"
    )

    @field_validator("percent", mode="before")
    @classmethod
    def normalize_percent(cls, value):
        """
        Accept both 0-1 and 0-100 styles from LLM output and normalize to 0-1.
        Also supports string values like '77.5' or '77.5%'.
        """
        if isinstance(value, str):
            cleaned = value.strip().replace("%", "")
            try:
                value = float(cleaned)
            except ValueError:
                return 0.0
        if isinstance(value, (int, float)):
            number = float(value)
            if number > 1.0 and number <= 100.0:
                return number / 100.0
            return number
        return 0.0


class JDMatchResult(BaseModel):
    """JD 匹配结果."""

    summary: JDMatchSummary = Field(
        default_factory=JDMatchSummary, description="匹配汇总"
    )
    headline: str = Field(default="", description="一句话诊断（<=50字）")
    matches: List[JDRequirementMatch] = Field(
        default_factory=list, description="逐项匹配结果"
    )
    gaps: List[JDRequirement] = Field(
        default_factory=list, description="缺口要求（score<1的项）"
    )


# ==================== API Requests ====================


class JDMatchContext(BaseModel):
    """匹配分析的上下文信息（来自概览和建议）."""

    headline: str = Field(default="", description="概览诊断标题")
    highlights: List[str] = Field(default_factory=list, description="简历亮点（最多3条）")
    risks: List[str] = Field(default_factory=list, description="待改进项（最多2条）")
    suggestion_problems: List[str] = Field(
        default_factory=list, description="建议中指出的问题（最多5条）"
    )


class JDMatchRequest(BaseModel):
    """JD 匹配请求."""

    resumeData: ResumeData = Field(description="结构化简历数据")
    jdText: Optional[str] = Field(default=None, description="JD 原文文本（与jdData二选一）")
    jdData: Optional[JDData] = Field(
        default=None, description="结构化 JD 数据（与jdText二选一）"
    )
    context: Optional[JDMatchContext] = Field(
        default=None, description="上下文信息（来自概览和建议，可选）"
    )
    runtimeConfig: RuntimeConfig | None = Field(
        default=None, description="请求级模型配置覆盖"
    )


class JDSuggestionsRequest(BaseModel):
    """JD 建议生成请求."""

    resumeData: ResumeData = Field(description="结构化简历数据")
    jdText: Optional[str] = Field(default=None, description="JD 原文文本（与jdData二选一）")
    jdData: Optional[JDData] = Field(
        default=None, description="结构化 JD 数据（与jdText二选一）"
    )
    matchResult: Optional[JDMatchResult] = Field(
        default=None, description="匹配结果（可选，若已调用match接口）"
    )
    runtimeConfig: RuntimeConfig | None = Field(
        default=None, description="请求级模型配置覆盖"
    )


# ==================== Extended Suggestion ====================


class RelatedRequirement(BaseModel):
    """关联的JD要求."""

    id: str = Field(default="", description="要求ID")
    text: str = Field(default="", description="要求文本")


class JDSuggestionItem(SuggestionItem):
    """JD版建议项，扩展关联要求字段."""

    relatedRequirement: Optional[RelatedRequirement] = Field(
        default=None, description="关联的JD要求"
    )


# ==================== Regex Validation Schemas ====================


class JDRegexEvidence(BaseModel):
    """正则匹配证据."""

    source: Literal["resume", "jd"] = Field(description="来源：简历或JD")
    location: str = Field(description="位置，如 workExperience[0].jobDescription")
    snippet: str = Field(description="匹配到的文本片段")


class JDRegexFinding(BaseModel):
    """正则差异项."""

    requirementId: str = Field(description="关联的要求ID")
    category: str = Field(description="类别")
    keyword: str = Field(description="匹配的关键词")
    llmScore: float = Field(ge=0, le=1, description="LLM给出的分数")
    regexFound: bool = Field(description="正则是否在简历中找到")
    evidence: List[JDRegexEvidence] = Field(
        default_factory=list, description="正则匹配证据"
    )
    discrepancy: str = Field(description="差异描述")


class JDRegexDiff(BaseModel):
    """正则差异结果."""

    findings: List[JDRegexFinding] = Field(
        default_factory=list, description="差异项列表"
    )
    hasDiff: bool = Field(default=False, description="是否存在差异")


class JDMatchPatchItem(BaseModel):
    """二次校验补丁项."""

    requirementId: str = Field(description="要求ID")
    action: Literal["adjust_score", "keep"] = Field(description="操作类型")
    newScore: Optional[float] = Field(
        default=None, ge=0, le=1, description="修正后分数"
    )
    newEvidence: Optional[List[str]] = Field(
        default=None, description="修正后证据"
    )
    reason: str = Field(description="修正原因")


class JDMatchPatch(BaseModel):
    """二次校验补丁结果."""

    updates: List[JDMatchPatchItem] = Field(
        default_factory=list, description="补丁项列表"
    )
