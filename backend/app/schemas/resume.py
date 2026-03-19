"""Resume data schemas using Pydantic."""

from typing import List, Literal

from pydantic import BaseModel, Field


# ==================== Basic Info ====================


class BasicInfo(BaseModel):
    """Basic personal information."""

    name: str = Field(default="", description="姓名")
    personalEmail: str = Field(default="", description="邮箱")
    phoneNumber: str = Field(default="", description="电话/手机")
    age: str = Field(default="", description="当前年龄")
    born: str = Field(default="", description="出生年月")
    gender: str = Field(default="", description="性别 男/女")
    desiredPosition: str = Field(default="", description="期望岗位/目标职位")
    desiredLocation: List[str] = Field(
        default_factory=list, description="期望工作地/城市列表"
    )
    currentLocation: str = Field(default="", description="现居地/当前城市")
    placeOfOrigin: str = Field(default="", description="籍贯")
    rewards: List[str] = Field(
        default_factory=list, description="奖项/荣誉列表：竞赛奖项、奖学金、荣誉称号等"
    )


# ==================== Work Experience ====================


class EmploymentPeriod(BaseModel):
    """Employment period."""

    startDate: str = Field(default="", description="入职时间/开始时间")
    endDate: str = Field(default="", description="离职时间/结束时间，若至今填写'至今'")


class WorkExperienceItem(BaseModel):
    """Single work experience item."""

    companyName: str = Field(default="", description="公司名称")
    employmentPeriod: EmploymentPeriod = Field(
        default_factory=EmploymentPeriod, description="工作时间段"
    )
    title: str = Field(default="", description="工作经历主题标题/项目式标题，如该段经历下的独立主题行")
    position: str = Field(default="", description="职位（保留现有职位字段，如岗位名称/职级）")
    internship: int = Field(default=0, description="是否实习 1=实习 0=非实习")
    jobDescription: str = Field(default="", description="工作描述/职责描述")


# ==================== Education ====================


class EducationPeriod(BaseModel):
    """Education period."""

    startDate: str = Field(default="", description="开始时间")
    endDate: str = Field(default="", description="结束时间，若至今填写'至今'")


class EducationItem(BaseModel):
    """Single education item."""

    degreeLevel: str = Field(
        default="", description="学位：本科/硕士/博士/专科/高中/初中"
    )
    period: EducationPeriod = Field(
        default_factory=EducationPeriod, description="教育时间段"
    )
    school: str = Field(default="", description="学校名称")
    department: str = Field(default="", description="系")
    major: str = Field(default="", description="专业")
    gpa: str = Field(default="", description="GPA/绩点，如 3.8/4.0 或 90/100")
    ranking: str = Field(default="", description="排名，如 前5% 或 3/120")
    educationDescription: str = Field(
        default="", description="教育描述：课程成绩、研究方向、荣誉奖项等"
    )


# ==================== Projects ====================


class ProjectPeriod(BaseModel):
    """Project period."""

    startDate: str = Field(default="", description="开始时间")
    endDate: str = Field(default="", description="结束时间，若至今填写'至今'")


class ProjectItem(BaseModel):
    """Single project item."""

    projectName: str = Field(default="", description="项目名称")
    projectPeriod: ProjectPeriod = Field(
        default_factory=ProjectPeriod, description="项目时间段"
    )
    role: str = Field(default="", description="项目角色/职责")
    companyOrOrganization: str = Field(default="", description="所属公司或组织")
    projectDescription: str = Field(
        default="",
        description="项目描述，包括项目背景、技术栈、个人职责、项目成果等完整信息",
    )


# ==================== Academic Achievements ====================


class AcademicAchievementItem(BaseModel):
    """Single academic achievement item."""

    type: str = Field(
        default="",
        description="类型：paper(论文)/patent(专利)/award(学术奖项)/thesis(毕业论文)/grant(科研基金)/research(科研项目)",
    )
    title: str = Field(default="", description="成果标题/论文名/专利名/项目名")
    date: str = Field(default="", description="日期 如 2023.06")
    venue: str = Field(
        default="", description="发表刊物/会议名称/颁奖机构/资助来源（可选）"
    )
    description: str = Field(
        default="", description="简要描述（如作者排名、影响因子、项目规模等）（可选）"
    )
    status: str = Field(
        default="",
        description="论文状态（可选）：under_review/major_revision/minor_revision/accepted/published",
    )


# ==================== LLM Response Wrappers ====================


class BasicInfoResponse(BaseModel):
    """LLM response wrapper for basic info."""

    basicInfo: BasicInfo


class WorkExperienceResponse(BaseModel):
    """LLM response wrapper for work experience."""

    workExperience: List[WorkExperienceItem]


class EducationResponse(BaseModel):
    """LLM response wrapper for education."""

    education: List[EducationItem]


class ProjectResponse(BaseModel):
    """LLM response wrapper for projects."""

    projects: List[ProjectItem]


class AcademicAchievementsResponse(BaseModel):
    """LLM response wrapper for academic achievements."""

    academicAchievements: List[AcademicAchievementItem]


class ResumeValidityResponse(BaseModel):
    """LLM response wrapper for resume validity classification."""

    isResume: Literal["Yes", "No"] = Field(description="Whether the input is a normal resume")


# ==================== Complete Resume ====================


class ResumeData(BaseModel):
    """Complete structured resume data."""

    basicInfo: BasicInfo = Field(default_factory=BasicInfo)
    workExperience: List[WorkExperienceItem] = Field(default_factory=list)
    education: List[EducationItem] = Field(default_factory=list)
    projects: List[ProjectItem] = Field(default_factory=list)
    academicAchievements: List[AcademicAchievementItem] = Field(default_factory=list)


# ==================== API Response ====================


class ElapsedTime(BaseModel):
    """Elapsed time for different processing stages."""

    ocr_seconds: float = Field(default=0.0, description="OCR processing time")
    llm_seconds: float = Field(default=0.0, description="LLM processing time")


class ParseMeta(BaseModel):
    """Metadata for parse response."""

    filename: str = Field(description="Original filename")
    extension: str = Field(description="File extension")
    elapsed: ElapsedTime = Field(default_factory=ElapsedTime)
    guidance: str = Field(default="", description="Guidance for fallback or failure handling")


class ResumeParseResponse(BaseModel):
    """API response for resume parsing."""

    data: ResumeData = Field(description="Parsed resume data")
    meta: ParseMeta = Field(description="Parsing metadata")


# ==================== Error Response ====================


class ErrorDetail(BaseModel):
    """Error detail information."""

    code: str = Field(description="Error code")
    message: str = Field(description="Error message")
    details: dict = Field(default_factory=dict, description="Additional error details")


class ErrorResponse(BaseModel):
    """Standard error response."""

    error: ErrorDetail = Field(description="Error information")
