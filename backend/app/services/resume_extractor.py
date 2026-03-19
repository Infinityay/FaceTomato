"""Resume extraction service using LangChain."""

from __future__ import annotations

import time
from typing import List, Optional, Union

from langchain.chat_models import init_chat_model
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.rate_limiters import InMemoryRateLimiter
from langchain_core.runnables import RunnableLambda, RunnableParallel

from app.core.config import get_settings
from app.services.runtime_config import ResolvedRuntimeConfig
from app.prompts.resume_prompts import (
    ACADEMIC_ACHIEVEMENTS_PROMPT,
    BASIC_INFO_PROMPT,
    EDUCATION_PROMPT,
    PROJECT_PROMPT,
    RESUME_VALIDITY_PROMPT,
    SYSTEM_PROMPT,
    WORK_EXPERIENCE_PROMPT,
)
from app.schemas.resume import (
    AcademicAchievementItem,
    AcademicAchievementsResponse,
    BasicInfo,
    BasicInfoResponse,
    EducationItem,
    EducationResponse,
    ProjectItem,
    ProjectResponse,
    ResumeData,
    ResumeValidityResponse,
    WorkExperienceItem,
    WorkExperienceResponse,
)
from app.utils.structured_output import invoke_with_fallback


class InvalidResumeContentError(RuntimeError):
    """Raised when uploaded content is not a valid resume."""


class ResumeExtractor:
    """LangChain-based resume extractor with multi-provider support."""

    @classmethod
    def from_runtime_config(cls, runtime_config: ResolvedRuntimeConfig) -> "ResumeExtractor":
        """Create a request-scoped extractor from resolved runtime config."""
        return cls(
            model_provider=runtime_config.model_provider,
            api_key=runtime_config.api_key,
            base_url=runtime_config.base_url,
            model=runtime_config.model,
        )

    def __init__(
        self,
        model_provider: str = None,
        api_key: str = None,
        base_url: str = None,
        model: str = None,
        rate_limiter: Optional[InMemoryRateLimiter] = None,
    ):
        settings = get_settings()

        # Get active model configuration
        active_config = settings.get_active_config()
        model_provider = model_provider or active_config["model_provider"]
        api_key = api_key or active_config["api_key"]
        base_url = base_url or active_config["base_url"]
        model = model or active_config["model"]

        print(f"   🤖 Model Provider: {model_provider}")
        print(f"   📦 Model: {model}")
        if base_url:
            print(f"   🔗 Base URL: {base_url}")

        # Create rate limiter from settings if not provided
        if rate_limiter is None:
            rate_limiter = InMemoryRateLimiter(
                requests_per_second=settings.rate_limit_requests_per_second,
                check_every_n_seconds=settings.rate_limit_check_every_n_seconds,
                max_bucket_size=settings.rate_limit_max_bucket_size,
            )
            print(
                f"   🚦 Rate limiter: "
                f"{settings.rate_limit_requests_per_second} req/s, "
                f"max_bucket={settings.rate_limit_max_bucket_size}"
            )

        # Initialize chat model based on provider
        chat_model = self._create_chat_model(
            model_provider=model_provider,
            model=model,
            api_key=api_key,
            base_url=base_url,
            rate_limiter=rate_limiter,
        )

        # Pre-bind structured output for direct Pydantic object retrieval
        self.validity_llm = chat_model.with_structured_output(ResumeValidityResponse)
        self.basic_info_llm = chat_model.with_structured_output(BasicInfoResponse)
        self.work_llm = chat_model.with_structured_output(WorkExperienceResponse)
        self.edu_llm = chat_model.with_structured_output(EducationResponse)
        self.project_llm = chat_model.with_structured_output(ProjectResponse)
        self.academic_llm = chat_model.with_structured_output(AcademicAchievementsResponse)

        # LangChain Runnable parallel pipeline
        self.parallel = RunnableParallel(
            basic_info=self._timed_chain(
                BASIC_INFO_PROMPT, self.basic_info_llm, BasicInfoResponse
            ),
            work_experience=self._timed_chain(
                WORK_EXPERIENCE_PROMPT, self.work_llm, WorkExperienceResponse
            ),
            education=self._timed_chain(
                EDUCATION_PROMPT, self.edu_llm, EducationResponse
            ),
            projects=self._timed_chain(
                PROJECT_PROMPT, self.project_llm, ProjectResponse
            ),
            academic_achievements=self._timed_chain(
                ACADEMIC_ACHIEVEMENTS_PROMPT,
                self.academic_llm,
                AcademicAchievementsResponse,
            ),
        )

    def _create_chat_model(
        self,
        model_provider: str,
        model: str,
        api_key: str,
        base_url: str,
        rate_limiter: InMemoryRateLimiter,
    ):
        """
        Create chat model based on provider.

        Supported providers:
        - openai: OpenAI or OpenAI-compatible API (with base_url)
        - google_genai: Google Gemini
        - anthropic: Anthropic Claude
        """
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

        elif model_provider == "google_genai":
            return init_chat_model(
                f"google_genai:{model}",
                rate_limiter=rate_limiter,
            )

        elif model_provider == "anthropic":
            return init_chat_model(
                model,
                model_provider="anthropic",
                rate_limiter=rate_limiter,
            )

        else:
            raise ValueError(f"Unsupported model provider: {model_provider}")

    @staticmethod
    def _messages(user_content: str) -> List[Union[SystemMessage, HumanMessage]]:
        return [
            SystemMessage(content=SYSTEM_PROMPT),
            HumanMessage(content=user_content),
        ]

    def _timed_chain(self, prompt: str, llm, response_cls):
        """Build a runnable: concat prompt -> call model -> return (parsed_result, duration)."""

        def build_messages(resume_text: str):
            return self._messages(f"{prompt}\n\n简历内容：\n{resume_text}")

        def run_with_time(messages):
            start = time.perf_counter()
            raw = invoke_with_fallback(llm, messages, response_cls)

            # Extract actual payload based on response type
            if isinstance(raw, BasicInfoResponse):
                parsed = raw.basicInfo
            elif isinstance(raw, WorkExperienceResponse):
                parsed = raw.workExperience
            elif isinstance(raw, EducationResponse):
                parsed = raw.education
            elif isinstance(raw, ProjectResponse):
                parsed = raw.projects
            elif isinstance(raw, AcademicAchievementsResponse):
                parsed = raw.academicAchievements
            else:
                parsed = raw

            return parsed, time.perf_counter() - start

        return RunnableLambda(build_messages) | RunnableLambda(run_with_time)

    def _is_normal_resume(self, resume_text: str) -> bool:
        """Classify whether input text is a normal resume."""
        messages = self._messages(f"{RESUME_VALIDITY_PROMPT}\n\n待判断内容：\n{resume_text}")
        result = invoke_with_fallback(
            self.validity_llm,
            messages,
            ResumeValidityResponse,
        )
        return result.isResume == "Yes"

    def validate_resume_text_or_raise(self, resume_text: str) -> None:
        """Validate resume text and raise a business error when invalid."""
        if not self._is_normal_resume(resume_text):
            raise InvalidResumeContentError("上传内容不是一份正常简历，请上传求职简历文件后重试。")

    def extract_all(self, resume_text: str) -> tuple[ResumeData, float]:
        """
        Extract all resume information in parallel.

        Returns:
            Tuple of (ResumeData, total elapsed time in seconds)
        """
        start_all = time.perf_counter()
        parallel_result = self.parallel.invoke(resume_text)
        total = time.perf_counter() - start_all

        basic_info, t_basic = parallel_result["basic_info"]
        work_experience, t_work = parallel_result["work_experience"]
        education, t_edu = parallel_result["education"]
        projects, t_proj = parallel_result["projects"]
        academic_achievements, t_academic = parallel_result["academic_achievements"]

        print(
            f"   ⏱️ basic_info: {t_basic:.2f}s | "
            f"work_experience: {t_work:.2f}s | "
            f"education: {t_edu:.2f}s | "
            f"projects: {t_proj:.2f}s | "
            f"academic: {t_academic:.2f}s | total (wall): {total:.2f}s"
        )

        resume_data = ResumeData(
            basicInfo=basic_info,
            workExperience=work_experience,
            education=education,
            projects=projects,
            academicAchievements=academic_achievements,
        )

        return resume_data, round(total, 2)

    def extract_to_dict(self, resume_text: str) -> tuple[dict, float]:
        """Extract resume and return as dictionary."""
        resume_data, elapsed = self.extract_all(resume_text)
        return resume_data.model_dump(), elapsed


# Singleton instance
_extractor: ResumeExtractor = None


def get_extractor() -> ResumeExtractor:
    """Get or create the resume extractor singleton."""
    global _extractor
    if _extractor is None:
        _extractor = ResumeExtractor()
    return _extractor


async def extract_resume(resume_text: str) -> tuple[dict, float]:
    """Extract structured resume data from text."""
    extractor = get_extractor()
    return extractor.extract_to_dict(resume_text)
