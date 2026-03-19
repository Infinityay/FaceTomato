"""Job Description data schemas using Pydantic."""

from typing import List, Literal

from pydantic import BaseModel, Field

from app.schemas.runtime_config import RuntimeConfig


# ==================== JD Basic Info ====================


class JDBasicInfo(BaseModel):
    """职位基本信息."""

    jobTitle: str = Field(default="", description="职位名称")
    jobType: str = Field(default="", description="工作类型：全职/兼职/实习")
    location: str = Field(default="", description="工作地点")
    company: str = Field(default="", description="公司名称")
    department: str = Field(default="", description="部门名称")
    updateTime: str = Field(default="", description="更新时间")


# ==================== JD Requirements ====================


class JDRequirements(BaseModel):
    """职位要求."""

    degree: str = Field(default="", description="学历要求")
    experience: str = Field(default="", description="经验要求")
    techStack: List[str] = Field(default_factory=list, description="技术栈")
    mustHave: List[str] = Field(default_factory=list, description="必备条件")
    niceToHave: List[str] = Field(default_factory=list, description="加分项")
    jobDuties: List[str] = Field(default_factory=list, description="岗位职责")


# ==================== Complete JD Data ====================


class JDData(BaseModel):
    """完整 JD 数据."""

    basicInfo: JDBasicInfo = Field(default_factory=JDBasicInfo)
    requirements: JDRequirements = Field(default_factory=JDRequirements)


# ==================== LLM Response Wrappers ====================


class JDBasicInfoResponse(BaseModel):
    """LLM response wrapper for JD basic info."""

    jobBasicInfo: JDBasicInfo


class JDRequirementsResponse(BaseModel):
    """LLM response wrapper for JD requirements."""

    requirements: JDRequirements


class JDValidityResponse(BaseModel):
    """LLM response wrapper for JD validity classification."""

    isJD: Literal["Yes", "No"] = Field(description="Whether the input is a normal JD")


# ==================== API Request/Response ====================


class JDExtractRequest(BaseModel):
    """JD extraction request."""

    text: str = Field(description="JD 原文文本")
    runtimeConfig: RuntimeConfig | None = Field(
        default=None, description="请求级模型配置覆盖"
    )


class JDExtractResponse(BaseModel):
    """JD extraction response."""

    data: JDData = Field(description="结构化 JD 数据")
    elapsed_seconds: float = Field(description="处理耗时")
