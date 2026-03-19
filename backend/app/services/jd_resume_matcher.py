"""JD-Resume matching service with LLM-based analysis."""

from __future__ import annotations

import asyncio
import json
import re
import time
from typing import Any, Dict, List, Optional, Union

from langchain.chat_models import init_chat_model
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.rate_limiters import InMemoryRateLimiter

from app.core.config import get_settings
from app.services.jd_extractor import JDExtractor
from app.services.runtime_config import ResolvedRuntimeConfig
from app.prompts.jd_optimization_prompts import get_jd_prompts
from app.schemas.jd_match import (
    CategoryScores,
    CorrectionDetails,
    JDMatchPatch,
    JDMatchResult,
    JDMatchSummary,
    JDRegexDiff,
    JDRegexEvidence,
    JDRegexFinding,
    JDRequirement,
    JDRequirementMatch,
)
from app.schemas.jd import JDData
from app.schemas.resume import ResumeData
from app.schemas.resume_optimization import (
    ResumeOverviewResponse,
    ResumeSuggestionsResponse,
)
from app.utils.structured_output import invoke_with_fallback
from app.services.resume_optimizer import _deduplicate_suggestions, _normalize_suggestions


# ==================== 权重配置 ====================
CATEGORY_WEIGHTS = {
    "mustHave": 0.5,      # 必备条件
    "degree": 0.5,        # 学历要求
    "experience": 0.5,    # 经验要求
    "niceToHave": 0.2,    # 加分项
    "techStack": 0.2,     # 技术栈
    "jobDuties": 0.1,     # 岗位职责
}
GROUP_CORE = ("mustHave", "degree", "experience")
GROUP_SECONDARY = ("niceToHave", "techStack", "jobDuties")

# ==================== 正则规则配置 ====================
TECH_KEYWORDS = [
    # 编程语言
    r"\bPython\b", r"\bJava\b", r"\bJavaScript\b", r"\bTypeScript\b",
    r"\bGo(?:lang)?\b", r"\bRust\b", r"(?<!\w)C\+\+(?!\w)", r"(?<!\w)C#(?!\w)", r"\bRuby\b",
    r"\bPHP\b", r"\bSwift\b", r"\bKotlin\b", r"\bScala\b",
    # 前端框架
    r"\bReact\b", r"\bVue(?:\.js)?\b", r"\bAngular\b", r"\bNext\.?js\b",
    r"\bNuxt\b", r"\bSvelte\b",
    # 后端框架
    r"\bSpring\s*(?:Boot|Cloud|MVC)?\b", r"\bDjango\b", r"\bFlask\b",
    r"\bFastAPI\b", r"\bExpress\b", r"\bNest\.?js\b", r"\bGin\b",
    # 数据库
    r"\bMySQL\b", r"\bPostgreSQL\b", r"\bMongoDB\b", r"\bRedis\b",
    r"\bElasticsearch\b", r"\bOracle\b", r"\bSQL\s*Server\b",
    # 云/DevOps
    r"\bDocker\b", r"\bKubernetes\b", r"\bK8s\b", r"\bAWS\b",
    r"\bAzure\b", r"\bGCP\b", r"\bCI/CD\b", r"\bJenkins\b", r"\bGitLab\b",
    # 大数据/AI
    r"\bSpark\b", r"\bHadoop\b", r"\bKafka\b", r"\bFlink\b",
    r"\bTensorFlow\b", r"\bPyTorch\b", r"\bLLM\b", r"\bGPT\b",
    # 其他
    r"\bGraphQL\b", r"\bREST(?:ful)?\b", r"\b微服务\b", r"\b分布式\b",
]

DEGREE_PATTERNS = [
    (r"博士|PhD|Ph\.D", "博士"),
    (r"硕士|研究生|Master", "硕士"),
    (r"本科|学士|Bachelor", "本科"),
    (r"专科|大专|Associate", "专科"),
]

EXPERIENCE_PATTERN = r"(\d+)\s*(?:年|years?|yrs?)"

CERT_KEYWORDS = [
    r"\bPMP\b", r"\bCISSP\b", r"\bCKA\b", r"\bCKAD\b",
    r"\bAWS\s+Certified\b", r"\bAzure\s+Certified\b",
    r"\bCPA\b", r"\bCFA\b",
]


class JDResumeMatcher:
    """Service for matching resume against JD requirements."""

    @classmethod
    def from_runtime_config(cls, runtime_config: ResolvedRuntimeConfig) -> "JDResumeMatcher":
        """Create a request-scoped matcher from resolved runtime config."""
        return cls(
            model_provider=runtime_config.model_provider,
            api_key=runtime_config.api_key,
            base_url=runtime_config.base_url,
            model=runtime_config.model,
            runtime_config=runtime_config,
        )

    # Allowed categories for consistent summary output
    ALLOWED_CATEGORIES = (
        "mustHave",
        "niceToHave",
        "degree",
        "experience",
        "techStack",
        "jobDuties",
    )

    def __init__(
        self,
        model_provider: str = None,
        api_key: str = None,
        base_url: str = None,
        model: str = None,
        rate_limiter: Optional[InMemoryRateLimiter] = None,
        runtime_config: ResolvedRuntimeConfig | None = None,
    ):
        settings = get_settings()

        active_config = settings.get_active_config()
        model_provider = model_provider or active_config["model_provider"]
        api_key = api_key or active_config["api_key"]
        base_url = base_url or active_config["base_url"]
        model = model or active_config["model"]

        print(f"   🔧 JDResumeMatcher initialized")
        print(f"   🤖 Model Provider: {model_provider}")
        print(f"   📦 Model: {model}")

        self.runtime_config = runtime_config or ResolvedRuntimeConfig(
            model_provider=model_provider,
            api_key=api_key,
            base_url=base_url,
            model=model,
        )

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

        self.match_llm = self.chat_model.with_structured_output(JDMatchResult)
        self.overview_llm = self.chat_model.with_structured_output(ResumeOverviewResponse)
        self.suggestion_llm = self.chat_model.with_structured_output(ResumeSuggestionsResponse)
        self.validation_llm = self.chat_model.with_structured_output(JDMatchPatch)
        self.prompts = get_jd_prompts()

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
                "temperature": 0.2,  # 提高得分一致性
            }
            if base_url:
                kwargs["base_url"] = base_url
            return init_chat_model(**kwargs)

        elif model_provider == "google_genai":
            return init_chat_model(
                f"google_genai:{model}",
                rate_limiter=rate_limiter,
                temperature=0.2,  # 提高得分一致性
            )

        elif model_provider == "anthropic":
            return init_chat_model(
                model,
                model_provider="anthropic",
                rate_limiter=rate_limiter,
                temperature=0.2,  # 提高得分一致性
            )

        else:
            raise ValueError(f"Unsupported model provider: {model_provider}")

    def _create_messages(
        self, prompt: str, resume_json: str, jd_json: str
    ) -> List[Union[SystemMessage, HumanMessage]]:
        """Create message list for LLM call."""
        return [
            SystemMessage(content="你是资深求职顾问与简历-JD匹配分析专家。"),
            HumanMessage(
                content=f"{prompt}\n\nresume_json:\n{resume_json}\n\njd_json:\n{jd_json}"
            ),
        ]

    async def match(
        self, resume_data: ResumeData, jd_text: str, jd_data: Optional[JDData] = None
    ) -> tuple[JDMatchResult, float]:
        """
        Analyze resume-JD match with two-pass validation.

        Scoring rules:
        - 0: Not mentioned in resume
        - 0.5: Mentioned but vague (no specific scenario or quantified results)
        - 1: Clear evidence with specific scenario or quantified results

        Args:
            resume_data: Structured resume data
            jd_text: Raw JD text (used for extraction if jd_data not provided)
            jd_data: Optional pre-extracted structured JD data

        Returns:
            Tuple of (JDMatchResult, elapsed_seconds)
        """
        start = time.perf_counter()

        # If no structured JD data provided, extract it from text
        if jd_data is None:
            extractor = JDExtractor.from_runtime_config(self.runtime_config)
            jd_data, _ = extractor.extract_all(jd_text)

        resume_json = json.dumps(
            resume_data.model_dump(),
            ensure_ascii=False,
            sort_keys=True,
        )

        jd_json = json.dumps(
            jd_data.model_dump(),
            ensure_ascii=False,
            sort_keys=True,
        )

        messages = self._create_messages(
            self.prompts["jdMatch"], resume_json, jd_json
        )

        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            lambda: invoke_with_fallback(
                self.match_llm, messages, JDMatchResult
            ),
        )

        # Post-process: calculate summary scores
        result = self._calculate_summary(result)

        # Phase 2: Regex validation
        regex_diff = self._build_regex_diff(result, resume_data, jd_data)

        if regex_diff.hasDiff:
            print(f"   🔍 Found {len(regex_diff.findings)} regex discrepancies, running validation...")
            # Phase 3: Second LLM validation
            patch = await self._run_validation_llm(
                resume_json, jd_json, result, regex_diff
            )
            # Apply patch
            result = self._apply_match_patch(result, patch)
            # Recalculate summary
            result = self._calculate_summary(result)
            print(f"   ✅ Applied {len([u for u in patch.updates if u.action == 'adjust_score'])} corrections")

        elapsed = time.perf_counter() - start
        print(f"   ⏱️ JD Match analysis: {elapsed:.2f}s")
        print(f"   📊 Match score: {result.summary.percent:.0%}")

        return result, elapsed

    def _calculate_summary(self, result: JDMatchResult) -> JDMatchResult:
        """Calculate weighted summary scores from individual matches."""
        # Handle empty matches case
        if not result.matches:
            result.summary = JDMatchSummary(
                totalScore=0,
                maxScore=0,
                percent=0,
                byCategory=CategoryScores(),
            )
            result.gaps = []
            return result

        # Initialize all categories with empty lists
        category_scores: dict[str, list[float]] = {
            cat: [] for cat in self.ALLOWED_CATEGORIES
        }

        # Populate scores for known categories only
        for match in result.matches:
            if match.category in category_scores:
                category_scores[match.category].append(match.score)

        # Calculate average for each category and weighted totals
        weighted_total = 0.0
        weighted_max = 0.0
        by_category_dict = {}

        for cat in self.ALLOWED_CATEGORIES:
            scores = category_scores[cat]
            weight = CATEGORY_WEIGHTS.get(cat, 0.0)
            if scores:
                cat_avg = sum(scores) / len(scores)
                weighted_total += cat_avg * weight
                weighted_max += weight
                by_category_dict[cat] = cat_avg
            else:
                by_category_dict[cat] = 0.0

        by_category = CategoryScores(**by_category_dict)

        # Calculate weighted percent
        percent = weighted_total / weighted_max if weighted_max > 0 else 0

        # Identify gaps (score < 1, only for known categories)
        gaps = [
            JDRequirement(
                id=m.requirementId,
                category=m.category,
                text=m.requirementText,
            )
            for m in result.matches
            if m.score < 1 and m.category in category_scores
        ]

        result.summary = JDMatchSummary(
            totalScore=weighted_total,
            maxScore=weighted_max,
            percent=percent,
            byCategory=by_category,
        )
        result.gaps = gaps

        return result

    def _build_regex_diff(
        self,
        result: JDMatchResult,
        resume_data: ResumeData,
        jd_data: JDData,
    ) -> JDRegexDiff:
        """Build regex diff by comparing LLM scores with regex keyword matches."""
        findings: List[JDRegexFinding] = []

        # Flatten resume text for regex search
        resume_text_map = self._flatten_resume_text(resume_data)
        resume_full_text = " ".join(resume_text_map.values())

        for match in result.matches:
            # Only check techStack and mustHave categories for keyword matching
            if match.category not in ("techStack", "mustHave", "niceToHave"):
                continue

            # Extract all patterns that match the requirement text
            patterns_in_req = [
                pattern
                for pattern in TECH_KEYWORDS
                if re.search(pattern, match.requirementText, re.IGNORECASE)
            ]

            # Check for discrepancy: LLM gave 0 but regex found keyword
            if match.score == 0 and patterns_in_req:
                # Search each section individually to get correct local indices
                keywords_found = []
                for pattern in patterns_in_req:
                    local_matches = []
                    for loc, text in resume_text_map.items():
                        for m in re.finditer(pattern, text, re.IGNORECASE):
                            local_matches.append((loc, text, m))
                    if local_matches:
                        keywords_found.append((pattern, local_matches))

                if keywords_found:
                    evidence = []
                    for pattern, matches in keywords_found:
                        for loc, text, m in matches[:2]:  # Limit to 2 evidence per keyword
                            snippet = self._extract_snippet(text, m.start(), m.end())
                            evidence.append(JDRegexEvidence(
                                source="resume",
                                location=loc,
                                snippet=snippet,
                            ))

                    first_match = keywords_found[0][1][0][2]
                    keyword_text = first_match.group()

                    findings.append(JDRegexFinding(
                        requirementId=match.requirementId,
                        category=match.category,
                        keyword=keyword_text,
                        llmScore=match.score,
                        regexFound=True,
                        evidence=evidence,
                        discrepancy=f"LLM gave 0 but regex found '{keyword_text}' in resume",
                    ))

            # Check for discrepancy: LLM gave 1 but regex didn't find ANY keyword
            elif match.score == 1 and patterns_in_req:
                # Only report if NONE of the patterns match in resume
                any_found = any(
                    re.search(pattern, resume_full_text, re.IGNORECASE)
                    for pattern in patterns_in_req
                )
                if not any_found:
                    findings.append(JDRegexFinding(
                        requirementId=match.requirementId,
                        category=match.category,
                        keyword=patterns_in_req[0],
                        llmScore=match.score,
                        regexFound=False,
                        evidence=[],
                        discrepancy=f"LLM gave 1 but regex didn't find keyword in resume",
                    ))

        return JDRegexDiff(findings=findings, hasDiff=len(findings) > 0)

    def _flatten_resume_text(self, resume_data: ResumeData) -> Dict[str, str]:
        """Flatten resume data into location -> text map for regex search."""
        text_map = {}

        # Work experience
        if resume_data.workExperience:
            for i, exp in enumerate(resume_data.workExperience):
                if exp.jobDescription:
                    text_map[f"workExperience[{i}].jobDescription"] = exp.jobDescription
                if exp.title:
                    text_map[f"workExperience[{i}].title"] = exp.title
                if exp.position:
                    text_map[f"workExperience[{i}].position"] = exp.position

        # Projects
        if resume_data.projects:
            for i, proj in enumerate(resume_data.projects):
                if proj.projectDescription:
                    text_map[f"projects[{i}].projectDescription"] = proj.projectDescription
                if proj.role:
                    text_map[f"projects[{i}].role"] = proj.role

        # Education
        if resume_data.education:
            for i, edu in enumerate(resume_data.education):
                if edu.major:
                    text_map[f"education[{i}].major"] = edu.major

        return text_map

    def _extract_snippet(self, text: str, start: int, end: int, context: int = 30) -> str:
        """Extract a snippet around the match with context."""
        snippet_start = max(0, start - context)
        snippet_end = min(len(text), end + context)
        snippet = text[snippet_start:snippet_end]
        if snippet_start > 0:
            snippet = "..." + snippet
        if snippet_end < len(text):
            snippet = snippet + "..."
        return snippet

    async def _run_validation_llm(
        self,
        resume_json: str,
        jd_json: str,
        initial_result: JDMatchResult,
        regex_diff: JDRegexDiff,
    ) -> JDMatchPatch:
        """Run second LLM to validate regex discrepancies."""
        initial_match_json = json.dumps(
            initial_result.model_dump(),
            ensure_ascii=False,
        )
        regex_diff_json = json.dumps(
            regex_diff.model_dump(),
            ensure_ascii=False,
        )

        messages = [
            SystemMessage(content="你是简历-JD匹配结果校验专家。"),
            HumanMessage(
                content=f"{self.prompts['jdMatchValidation']}\n\n"
                f"resume_json:\n{resume_json}\n\n"
                f"jd_json:\n{jd_json}\n\n"
                f"initial_match_json:\n{initial_match_json}\n\n"
                f"regex_diff_json:\n{regex_diff_json}"
            ),
        ]

        loop = asyncio.get_event_loop()
        patch = await loop.run_in_executor(
            None,
            lambda: invoke_with_fallback(
                self.validation_llm, messages, JDMatchPatch
            ),
        )

        return patch

    def _apply_match_patch(
        self, result: JDMatchResult, patch: JDMatchPatch
    ) -> JDMatchResult:
        """Apply validation patch to match result."""
        # Build lookup map
        match_map = {m.requirementId: m for m in result.matches}

        for update in patch.updates:
            if update.action != "adjust_score":
                continue

            match = match_map.get(update.requirementId)
            if not match:
                continue

            # Store original values in correction
            match.correction = CorrectionDetails(
                original_score=match.score,
                original_evidence=match.evidence.copy(),
                reason=update.reason,
            )

            # Apply new values
            if update.newScore is not None:
                match.score = update.newScore
            if update.newEvidence is not None:
                match.evidence = update.newEvidence

        return result

    async def get_jd_overview(
        self, resume_data: ResumeData, jd_text: str, jd_data: Optional[JDData] = None
    ) -> tuple[ResumeOverviewResponse, float]:
        """
        Generate JD-targeted resume overview.

        Args:
            resume_data: Structured resume data
            jd_text: Raw JD text (used for extraction if jd_data not provided)
            jd_data: Optional pre-extracted structured JD data

        Returns:
            Tuple of (ResumeOverviewResponse, elapsed_seconds)
        """
        start = time.perf_counter()

        # If no structured JD data provided, extract it from text
        if jd_data is None:
            extractor = JDExtractor.from_runtime_config(self.runtime_config)
            jd_data, _ = extractor.extract_all(jd_text)

        resume_json = json.dumps(
            resume_data.model_dump(),
            ensure_ascii=False,
            sort_keys=True,
        )

        jd_json = json.dumps(
            jd_data.model_dump(),
            ensure_ascii=False,
            sort_keys=True,
        )

        messages = self._create_messages(
            self.prompts["jdOverview"], resume_json, jd_json
        )

        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            lambda: invoke_with_fallback(
                self.overview_llm, messages, ResumeOverviewResponse
            ),
        )

        elapsed = time.perf_counter() - start
        print(f"   ⏱️ JD Overview generation: {elapsed:.2f}s")

        return result, elapsed

    async def get_jd_suggestions(
        self, resume_data: ResumeData, jd_text: str, jd_data: Optional[JDData] = None
    ) -> tuple[ResumeSuggestionsResponse, float]:
        """
        Generate JD-targeted resume suggestions.

        Args:
            resume_data: Structured resume data
            jd_text: Raw JD text (used for extraction if jd_data not provided)
            jd_data: Optional pre-extracted structured JD data

        Returns:
            Tuple of (ResumeSuggestionsResponse, elapsed_seconds)
        """
        start = time.perf_counter()

        # If no structured JD data provided, extract it from text
        if jd_data is None:
            extractor = JDExtractor.from_runtime_config(self.runtime_config)
            jd_data, _ = extractor.extract_all(jd_text)

        resume_json = json.dumps(
            resume_data.model_dump(),
            ensure_ascii=False,
            sort_keys=True,
        )

        jd_json = json.dumps(
            jd_data.model_dump(),
            ensure_ascii=False,
            sort_keys=True,
        )

        messages = self._create_messages(
            self.prompts["jdSuggestions"], resume_json, jd_json
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
            print(f"   ⚠️ Deduplicated {duplicates} duplicate JD suggestions")

        _normalize_suggestions(result.sections)

        elapsed = time.perf_counter() - start
        total_items = sum(len(section.suggestions) for section in result.sections)
        print(f"   ⏱️ JD Suggestions generation: {elapsed:.2f}s, {total_items} items")

        return result, elapsed


# ==================== Helper Functions ====================

# Singleton instance
_matcher: JDResumeMatcher = None


def get_jd_resume_matcher() -> JDResumeMatcher:
    """Get or create the JD resume matcher singleton."""
    global _matcher
    if _matcher is None:
        _matcher = JDResumeMatcher()
    return _matcher
