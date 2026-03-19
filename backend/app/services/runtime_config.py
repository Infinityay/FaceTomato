"""Helpers for resolving request-scoped runtime model and capability configuration."""

from __future__ import annotations

from dataclasses import dataclass

from app.core.config import get_settings
from app.schemas.runtime_config import RuntimeConfig


@dataclass(frozen=True, slots=True)
class ResolvedRuntimeConfig:
    """Effective runtime model configuration after merging request overrides."""

    model_provider: str
    api_key: str | None
    base_url: str | None
    model: str | None


@dataclass(frozen=True, slots=True)
class ResolvedSpeechConfig:
    """Effective speech configuration after merging runtime overrides."""

    app_key: str | None
    access_key: str | None

    @property
    def available(self) -> bool:
        return bool(self.app_key and self.access_key)



def normalize_optional_string(value: str | None) -> str | None:
    """Normalize blank strings to None."""
    if value is None:
        return None
    normalized = value.strip()
    return normalized or None



def resolve_runtime_config(runtime_config: RuntimeConfig | None = None) -> ResolvedRuntimeConfig:
    """Merge runtime overrides with provider-aware environment defaults."""
    settings = get_settings()
    runtime_config = runtime_config or RuntimeConfig()

    requested_provider = normalize_optional_string(runtime_config.modelProvider)
    active_config = (
        settings.get_provider_config(requested_provider)
        if requested_provider is not None
        else settings.get_active_config()
    )

    return ResolvedRuntimeConfig(
        model_provider=active_config["model_provider"],
        api_key=normalize_optional_string(runtime_config.apiKey) or active_config["api_key"],
        base_url=normalize_optional_string(runtime_config.baseURL) or active_config["base_url"],
        model=normalize_optional_string(runtime_config.model) or active_config["model"],
    )



def resolve_ocr_api_key(runtime_ocr_api_key: str | None = None) -> str | None:
    """Resolve OCR API key, treating blank strings as missing."""
    settings = get_settings()
    return normalize_optional_string(runtime_ocr_api_key) or settings.zhipu_api_key



def resolve_ocr_api_key_from_runtime(runtime_config: RuntimeConfig | None = None) -> str | None:
    """Resolve OCR API key from runtime config or env default."""
    runtime_config = runtime_config or RuntimeConfig()
    return resolve_ocr_api_key(runtime_config.ocrApiKey)



def resolve_speech_config(runtime_config: RuntimeConfig | None = None) -> ResolvedSpeechConfig:
    """Resolve speech credentials from runtime config or env defaults."""
    settings = get_settings()
    runtime_config = runtime_config or RuntimeConfig()

    return ResolvedSpeechConfig(
        app_key=normalize_optional_string(runtime_config.speechAppKey)
        or settings.volcengine_speech_app_key,
        access_key=normalize_optional_string(runtime_config.speechAccessKey)
        or settings.volcengine_speech_access_key,
    )
