"""Resume optimization service with unified LLM call."""

from __future__ import annotations

import asyncio
import json
import time
from typing import List, Optional, Union

from langchain.chat_models import init_chat_model
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.rate_limiters import InMemoryRateLimiter

from app.core.config import get_settings
from app.services.runtime_config import ResolvedRuntimeConfig
from app.prompts.resume_optimization_prompts import get_prompts
from app.schemas.resume import ResumeData
from app.schemas.resume_optimization import (
    ResumeOverviewResponse,
    ResumeSuggestionsResponse,
    SectionSuggestions,
)
from app.utils.structured_output import invoke_with_fallback


SECTION_PREFIX_MAP = {
    "basicInfo": "BASI",
    "workExperience": "WORK",
    "education": "EDUC",
    "projects": "PROJ",
    "academicAchievements": "ACAD",
}


class ResumeOptimizer:
    """Service for generating resume optimization suggestions."""

    @classmethod
    def from_runtime_config(cls, runtime_config: ResolvedRuntimeConfig) -> "ResumeOptimizer":
        """Create a request-scoped optimizer from resolved runtime config."""
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

        print(f"   🔧 ResumeOptimizer initialized")
        print(f"   🤖 Model Provider: {model_provider}")
        print(f"   📦 Model: {model}")

        if rate_limiter is None:
            rate_limiter = InMemoryRateLimiter(
                requests_per_second=settings.rate_limit_requests_per_second,
                check_every_n_seconds=settings.rate_limit_check_every_n_seconds,
                max_bucket_size=settings.rate_limit_max_bucket_size,
            )

        self.chat_model = self._create_chat_model(
            model_provider=model_provider,
            model=model,
            api_key=api_key,
            base_url=base_url,
            rate_limiter=rate_limiter,
        )

        self.overview_llm = self.chat_model.with_structured_output(
            ResumeOverviewResponse
        )
        self.suggestion_llm = self.chat_model.with_structured_output(
            ResumeSuggestionsResponse
        )

        self.prompts = get_prompts()

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

    def _create_messages(
        self, prompt: str, resume_json: str
    ) -> List[Union[SystemMessage, HumanMessage]]:
        """Create message list for LLM call."""
        return [
            SystemMessage(content="你是资深求职顾问与简历优化专家。"),
            HumanMessage(content=f"{prompt}\n\nresume_json:\n{resume_json}"),
        ]

    async def get_overview(
        self, resume_data: ResumeData
    ) -> tuple[ResumeOverviewResponse, float]:
        """Generate resume overview analysis."""
        start = time.perf_counter()

        payload = json.dumps(
            resume_data.model_dump(),
            ensure_ascii=False,
            sort_keys=True,
        )
        messages = self._create_messages(self.prompts["overview"], payload)

        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            lambda: invoke_with_fallback(
                self.overview_llm, messages, ResumeOverviewResponse
            ),
        )

        elapsed = time.perf_counter() - start
        print(f"   ⏱️ Overview generation: {elapsed:.2f}s")
        return result, elapsed

    async def get_suggestions(
        self, resume_data: ResumeData
    ) -> tuple[ResumeSuggestionsResponse, float]:
        """Generate suggestions with unified prompt."""
        start = time.perf_counter()

        resume_json = json.dumps(
            resume_data.model_dump(),
            ensure_ascii=False,
            sort_keys=True,
        )

        messages = self._create_messages(
            self.prompts["unifiedSuggestions"], resume_json
        )

        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            lambda: invoke_with_fallback(
                self.suggestion_llm, messages, ResumeSuggestionsResponse
            ),
        )

        duplicates = _deduplicate_suggestions(result.sections)
        if duplicates > 0:
            print(f"   ⚠️ Deduplicated {duplicates} duplicate suggestions")

        _normalize_suggestions(result.sections)

        elapsed = time.perf_counter() - start
        total_items = sum(len(section.suggestions) for section in result.sections)
        print(f"   ⏱️ Suggestions generation: {elapsed:.2f}s, {total_items} items")

        return result, elapsed


def _normalize_suggestions(sections: List[SectionSuggestions]) -> None:
    """Normalize suggestion IDs for stable UI mapping."""
    global_priority = 1
    for section in sections:
        prefix = SECTION_PREFIX_MAP.get(
            section.section, section.section[:4].upper()
        )
        for i, suggestion in enumerate(section.suggestions, 1):
            suggestion.id = f"SUG-{prefix}-{i:03d}"
            if suggestion.location.section != section.section:
                suggestion.location.section = section.section
            suggestion.priority = global_priority
            global_priority += 1


def _deduplicate_suggestions(sections: List[SectionSuggestions]) -> int:
    """Deduplicate fully identical display suggestions within each section."""
    duplicates_removed = 0

    for section in sections:
        seen_keys: set[tuple[str, int | None, str, str]] = set()
        unique_suggestions = []

        for suggestion in section.suggestions:
            dedupe_key = (
                suggestion.location.section,
                suggestion.location.item_index,
                suggestion.original,
                suggestion.suggestion,
            )
            if dedupe_key in seen_keys:
                duplicates_removed += 1
                continue
            seen_keys.add(dedupe_key)
            unique_suggestions.append(suggestion)

        section.suggestions = unique_suggestions

    return duplicates_removed


_optimizer: ResumeOptimizer = None


def get_resume_optimizer() -> ResumeOptimizer:
    """Get or create the resume optimizer singleton."""
    global _optimizer
    if _optimizer is None:
        _optimizer = ResumeOptimizer()
    return _optimizer
