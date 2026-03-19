"""Runtime configuration schemas."""

from __future__ import annotations

from pydantic import BaseModel, Field


class RuntimeConfig(BaseModel):
    """Optional request-scoped runtime overrides."""

    modelProvider: str | None = Field(default=None, description="Runtime model provider override")
    apiKey: str | None = Field(default=None, description="Runtime API key override")
    baseURL: str | None = Field(default=None, description="Runtime base URL override")
    model: str | None = Field(default=None, description="Runtime model override")
    ocrApiKey: str | None = Field(default=None, description="Runtime OCR API key override")
    speechAppKey: str | None = Field(
        default=None, description="Runtime Volcengine speech app key override"
    )
    speechAccessKey: str | None = Field(
        default=None, description="Runtime Volcengine speech access key override"
    )
