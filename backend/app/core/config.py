"""Application configuration using pydantic-settings."""

import os
from functools import lru_cache
from typing import Literal, Optional

from pydantic import Field
from pydantic_settings import BaseSettings


DenseEmbeddingProvider = Literal[
    "local_default",
    "local_hf_qwen3",
]
SparseEmbeddingProvider = Literal["bm25", "local_default"]
ModelSource = Literal["huggingface", "modelscope"]
BM25Language = Literal["zh", "en"]


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Application
    app_host: str = Field(default="0.0.0.0", description="Application host")
    app_port: int = Field(default=6522, description="Application port")
    cors_origins: str = Field(
        default="http://localhost:5569,http://127.0.0.1:5569",
        description="Comma-separated list of allowed CORS origins",
    )
    max_upload_mb: int = Field(default=10, description="Maximum upload file size in MB")
    interview_db_path: str = Field(
        default="data/interviews.db",
        description="Interview question bank SQLite DB path",
    )
    mock_interview_session_ttl_minutes: int = Field(
        default=1440,
        description="Anonymous mock interview recovery token ttl in minutes",
    )
    mock_interview_rag: bool = Field(
        default=False,
        description="Enable mock interview RAG retrieval",
    )
    mock_interview_plan_timeout_seconds: int = Field(
        default=600,
        description="Timeout in seconds for mock interview plan generation",
    )
    interview_zvec_index_path: str = Field(
        default="data/interview_zvec",
        description="ZVEC interview retrieval index path",
    )
    interview_rag_topk: int = Field(
        default=5, description="Top-k retrieval items for mock interview planning"
    )
    interview_rag_candidate_topk: int = Field(
        default=12,
        description="Candidate top-k before weighted rerank",
    )
    interview_rag_dense_weight: float = Field(
        default=1.2,
        description="Dense retrieval weight for weighted rerank",
    )
    interview_rag_sparse_weight: float = Field(
        default=1.0,
        description="Sparse retrieval weight for weighted rerank",
    )

    interview_dense_embedding_provider: DenseEmbeddingProvider = Field(
        default="local_hf_qwen3",
        description="Dense embedding provider for interview retrieval",
    )
    interview_dense_embedding_model_source: ModelSource = Field(
        default="huggingface",
        description="Dense model source for local embedding models",
    )
    interview_dense_embedding_model_name: str = Field(
        default="Qwen/Qwen3-Embedding-0.6B",
        description="Dense embedding model name or local path",
    )
    interview_dense_embedding_device: Optional[str] = Field(
        default=None,
        description="Dense embedding runtime device, for example cpu or cuda",
    )
    interview_dense_embedding_normalize: bool = Field(
        default=True,
        description="Whether to L2-normalize dense embeddings before indexing and querying",
    )

    interview_sparse_embedding_provider: SparseEmbeddingProvider = Field(
        default="bm25",
        description="Sparse embedding provider for interview retrieval",
    )
    interview_sparse_embedding_model_source: ModelSource = Field(
        default="huggingface",
        description="Sparse model source for local sparse embedding models",
    )
    interview_sparse_embedding_language: BM25Language = Field(
        default="zh",
        description="Language for BM25 sparse embeddings",
    )
    interview_sparse_embedding_bm25_b: Optional[float] = Field(
        default=None,
        description="Optional BM25 b parameter override",
    )
    interview_sparse_embedding_bm25_k1: Optional[float] = Field(
        default=None,
        description="Optional BM25 k1 parameter override",
    )

    # Model Provider Selection
    model_provider: Literal["openai", "google_genai", "anthropic"] = Field(
        default="openai", description="Active model provider"
    )

    # OpenAI / OpenAI-Compatible API
    openai_api_key: Optional[str] = Field(default=None, description="OpenAI API key")
    openai_base_url: Optional[str] = Field(
        default=None, description="OpenAI API base URL for compatible APIs"
    )
    openai_model: str = Field(default="gpt-4o-mini", description="OpenAI model name")

    # Google Gemini API
    google_api_key: Optional[str] = Field(default=None, description="Google API key")
    google_model: str = Field(
        default="gemini-2.0-flash", description="Google model name"
    )

    # Anthropic Claude API
    anthropic_api_key: Optional[str] = Field(
        default=None, description="Anthropic API key"
    )
    anthropic_model: str = Field(
        default="claude-sonnet-4-5-20250929", description="Anthropic model name"
    )

    # Speech-to-Text API
    volcengine_speech_base_url: str = Field(
        default="wss://openspeech.bytedance.com/api/v3/sauc/bigmodel",
        description="Volcengine speech websocket URL",
    )
    volcengine_speech_mode: Literal["nostream", "streaming", "streaming_async"] = Field(
        default="nostream",
        description="Volcengine speech mode",
    )
    volcengine_speech_app_key: Optional[str] = Field(
        default=None,
        description="Volcengine X-Api-App-Key",
    )
    volcengine_speech_access_key: Optional[str] = Field(
        default=None,
        description="Volcengine X-Api-Access-Key",
    )
    volcengine_speech_token: Optional[str] = Field(
        default=None,
        description="Volcengine Bearer token",
    )
    volcengine_speech_resource_id: str = Field(
        default="volc.bigasr.sauc.duration",
        description="Volcengine speech resource id",
    )

    # Zhipu API
    zhipu_api_key: Optional[str] = Field(
        default=None,
        description="Zhipu API key",
        validation_alias="ZHIPU_APIKEY",
    )

    # Rate Limiter
    rate_limit_requests_per_second: float = Field(
        default=20, description="Rate limit requests per second"
    )
    rate_limit_check_every_n_seconds: float = Field(
        default=5, description="Rate limit check interval"
    )
    rate_limit_max_bucket_size: int = Field(
        default=20, description="Rate limit max bucket size"
    )

    # Legacy compatibility
    api_key: Optional[str] = Field(default=None, description="Legacy API key")
    base_url: Optional[str] = Field(default=None, description="Legacy base URL")
    model: Optional[str] = Field(default=None, description="Legacy model name")

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}

    def get_cors_origins(self) -> list[str]:
        """Parse CORS origins from comma-separated string."""
        return [
            origin.strip() for origin in self.cors_origins.split(",") if origin.strip()
        ]

    def get_provider_config(
        self, provider: Literal["openai", "google_genai", "anthropic"]
    ) -> dict:
        """Get configuration for the specified model provider."""
        if provider == "openai":
            return {
                "model_provider": "openai",
                "api_key": self.openai_api_key,
                "base_url": self.openai_base_url,
                "model": self.openai_model,
            }
        if provider == "google_genai":
            if self.google_api_key:
                os.environ["GOOGLE_API_KEY"] = self.google_api_key
            return {
                "model_provider": "google_genai",
                "api_key": self.google_api_key,
                "base_url": None,
                "model": self.google_model,
            }
        if provider == "anthropic":
            if self.anthropic_api_key:
                os.environ["ANTHROPIC_API_KEY"] = self.anthropic_api_key
            return {
                "model_provider": "anthropic",
                "api_key": self.anthropic_api_key,
                "base_url": None,
                "model": self.anthropic_model,
            }
        raise ValueError(f"Unsupported model provider: {provider}")

    def get_active_config(self) -> dict:
        """
        Get the active model configuration based on model_provider.

        Returns:
            dict: Configuration with model_provider, api_key, base_url, model
        """
        if self.api_key and self.base_url and self.model:
            return {
                "model_provider": "openai",
                "api_key": self.api_key,
                "base_url": self.base_url,
                "model": self.model,
            }

        return self.get_provider_config(self.model_provider)


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
