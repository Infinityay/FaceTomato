"""JD extraction service using LangChain."""

from __future__ import annotations

import time
from typing import List, Optional, Union

from langchain.chat_models import init_chat_model
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.rate_limiters import InMemoryRateLimiter
from langchain_core.runnables import RunnableLambda, RunnableParallel

from app.core.config import get_settings
from app.services.runtime_config import ResolvedRuntimeConfig
from app.prompts.jd_prompts import (
    JD_BASIC_INFO_PROMPT,
    JD_REQUIREMENTS_PROMPT,
    JD_SYSTEM_PROMPT,
    JD_VALIDITY_PROMPT,
)
from app.schemas.jd import (
    JDBasicInfo,
    JDBasicInfoResponse,
    JDData,
    JDRequirements,
    JDRequirementsResponse,
    JDValidityResponse,
)
from app.utils.structured_output import invoke_with_fallback


class InvalidJDContentError(RuntimeError):
    """Raised when uploaded content is not a valid JD."""


class JDExtractor:
    """LangChain-based JD extractor with parallel extraction."""

    @classmethod
    def from_runtime_config(cls, runtime_config: ResolvedRuntimeConfig) -> "JDExtractor":
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

        active_config = settings.get_active_config()
        model_provider = model_provider or active_config["model_provider"]
        api_key = api_key or active_config["api_key"]
        base_url = base_url or active_config["base_url"]
        model = model or active_config["model"]

        print(f"   🔍 JD Extractor - Model Provider: {model_provider}")
        print(f"   📦 Model: {model}")

        if rate_limiter is None:
            rate_limiter = InMemoryRateLimiter(
                requests_per_second=settings.rate_limit_requests_per_second,
                check_every_n_seconds=settings.rate_limit_check_every_n_seconds,
                max_bucket_size=settings.rate_limit_max_bucket_size,
            )

        chat_model = self._create_chat_model(
            model_provider=model_provider,
            model=model,
            api_key=api_key,
            base_url=base_url,
            rate_limiter=rate_limiter,
        )

        self.validity_llm = chat_model.with_structured_output(JDValidityResponse)
        self.basic_info_llm = chat_model.with_structured_output(JDBasicInfoResponse)
        self.requirements_llm = chat_model.with_structured_output(JDRequirementsResponse)

        self.parallel = RunnableParallel(
            basic_info=self._timed_chain(
                JD_BASIC_INFO_PROMPT, self.basic_info_llm, JDBasicInfoResponse
            ),
            requirements=self._timed_chain(
                JD_REQUIREMENTS_PROMPT, self.requirements_llm, JDRequirementsResponse
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
        """Create chat model based on provider."""
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
            SystemMessage(content=JD_SYSTEM_PROMPT),
            HumanMessage(content=user_content),
        ]

    def _timed_chain(self, prompt: str, llm, response_cls):
        """Build a runnable: concat prompt -> call model -> return (parsed_result, duration)."""

        def build_messages(jd_text: str):
            return self._messages(f"{prompt}\n\nJD 内容：\n{jd_text}")

        def run_with_time(messages):
            start = time.perf_counter()
            raw = invoke_with_fallback(llm, messages, response_cls)

            if isinstance(raw, JDBasicInfoResponse):
                parsed = raw.jobBasicInfo
            elif isinstance(raw, JDRequirementsResponse):
                parsed = raw.requirements
            else:
                parsed = raw

            return parsed, time.perf_counter() - start

        return RunnableLambda(build_messages) | RunnableLambda(run_with_time)

    def _is_normal_jd(self, jd_text: str) -> bool:
        """Classify whether input text is a normal JD."""
        messages = self._messages(f"{JD_VALIDITY_PROMPT}\n\n待判断内容：\n{jd_text}")
        result = invoke_with_fallback(
            self.validity_llm,
            messages,
            JDValidityResponse,
        )
        return result.isJD == "Yes"

    def extract_all(self, jd_text: str) -> tuple[JDData, float]:
        """Extract all JD information in parallel."""
        if not self._is_normal_jd(jd_text):
            raise InvalidJDContentError("上传内容不是一份正常的岗位 JD，请粘贴职位描述后重试。")

        start_all = time.perf_counter()
        parallel_result = self.parallel.invoke(jd_text)
        total = time.perf_counter() - start_all

        basic_info, t_basic = parallel_result["basic_info"]
        requirements, t_req = parallel_result["requirements"]

        print(
            f"   ⏱️ JD basic_info: {t_basic:.2f}s | "
            f"requirements: {t_req:.2f}s | total (wall): {total:.2f}s"
        )

        jd_data = JDData(
            basicInfo=basic_info,
            requirements=requirements,
        )

        return jd_data, round(total, 2)

    def extract_to_dict(self, jd_text: str) -> tuple[dict, float]:
        """Extract JD and return as dictionary."""
        jd_data, elapsed = self.extract_all(jd_text)
        return jd_data.model_dump(), elapsed


_jd_extractor: JDExtractor = None


def get_jd_extractor() -> JDExtractor:
    """Get or create the JD extractor singleton."""
    global _jd_extractor
    if _jd_extractor is None:
        _jd_extractor = JDExtractor()
    return _jd_extractor


async def extract_jd(jd_text: str) -> tuple[dict, float]:
    """Extract structured JD data from text."""
    extractor = get_jd_extractor()
    return extractor.extract_to_dict(jd_text)
