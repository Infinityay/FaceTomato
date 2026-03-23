from __future__ import annotations

import importlib
import math
from pathlib import Path
from typing import Any

from app.core.config import Settings, get_settings
from app.services.interview_service import DataService, get_data_service

QWEN3_EMBEDDING_MODEL = "Qwen/Qwen3-Embedding-0.6B"
RAG_OPTIONAL_DEPENDENCY_MESSAGE = (
    "RAG functionality requires the backend rag optional dependency. "
    "Install it with `uv sync --extra rag`."
)


def _missing_rag_dependency_error(package_name: str) -> RuntimeError:
    return RuntimeError(f"{package_name} is required. {RAG_OPTIONAL_DEPENDENCY_MESSAGE}")


def _import_zvec():
    try:
        return importlib.import_module("zvec")
    except ImportError as exc:
        raise _missing_rag_dependency_error("zvec") from exc


def ensure_rag_dependencies_available(settings: Settings | None = None) -> None:
    current_settings = settings or get_settings()
    _import_zvec()

    if current_settings.interview_dense_embedding_provider == "local_hf_qwen3":
        try:
            importlib.import_module("sentence_transformers")
        except ImportError as exc:
            raise _missing_rag_dependency_error("sentence-transformers") from exc

    if current_settings.interview_dense_embedding_model_source == "modelscope":
        try:
            importlib.import_module("modelscope")
        except ImportError as exc:
            raise _missing_rag_dependency_error("modelscope") from exc

    if (
        current_settings.interview_sparse_embedding_provider == "local_default"
        and current_settings.interview_sparse_embedding_model_source == "modelscope"
    ):
        try:
            importlib.import_module("modelscope")
        except ImportError as exc:
            raise _missing_rag_dependency_error("modelscope") from exc


class LocalQwenDenseEmbedding:
    def __init__(
        self,
        *,
        model_name: str = QWEN3_EMBEDDING_MODEL,
        model_source: str = "huggingface",
        device: str | None = None,
        normalize: bool = True,
    ) -> None:
        self.model_name = model_name
        self.model_source = model_source
        self.device = device
        self.normalize = normalize
        self._model = self._load_model()
        self.dimension = self._infer_dimension()
        self.extra_params = {
            "model_name": self.model_name,
            "model_source": self.model_source,
            "device": self.device,
            "normalize": self.normalize,
        }

    def __call__(self, input: str) -> list[float]:
        return self.embed(input)

    def embed(self, input: str) -> list[float]:
        if not isinstance(input, str):
            raise TypeError("LocalQwenDenseEmbedding expects string input")
        text = input.strip()
        if not text:
            raise ValueError("LocalQwenDenseEmbedding requires non-empty text")
        vector = self._model.encode(
            text,
            normalize_embeddings=False,
            convert_to_numpy=True,
            show_progress_bar=False,
        )
        values = vector.tolist() if hasattr(vector, "tolist") else list(vector)
        return self._normalize(values) if self.normalize else values

    def _infer_dimension(self) -> int:
        if hasattr(self._model, "get_sentence_embedding_dimension"):
            dimension = self._model.get_sentence_embedding_dimension()
            if isinstance(dimension, int) and dimension > 0:
                return dimension
        probe = self.embed("dimension probe")
        return len(probe)

    def _load_model(self):
        try:
            from sentence_transformers import SentenceTransformer
        except ImportError as exc:
            raise _missing_rag_dependency_error("sentence-transformers") from exc

        model_path = self._resolve_model_path()
        kwargs: dict[str, Any] = {"trust_remote_code": True}
        requested_device = (self.device or "").strip().lower()
        if requested_device:
            kwargs["device"] = requested_device

        try:
            return SentenceTransformer(model_path, **kwargs)
        except AssertionError as exc:
            if "CUDA enabled" not in str(exc):
                raise
            if kwargs.get("device") == "cpu":
                raise
            kwargs["device"] = "cpu"
            self.device = "cpu"
            return SentenceTransformer(model_path, **kwargs)

    def _resolve_model_path(self) -> str:
        model_path = Path(self.model_name)
        if model_path.exists():
            return str(model_path)
        if self.model_source == "huggingface":
            return self.model_name
        if self.model_source == "modelscope":
            try:
                from modelscope import snapshot_download
            except ImportError as exc:
                raise _missing_rag_dependency_error("modelscope") from exc
            return snapshot_download(self.model_name)
        raise ValueError(f"Unsupported dense model source: {self.model_source}")

    @staticmethod
    def _normalize(vector: list[float]) -> list[float]:
        norm = math.sqrt(sum(value * value for value in vector))
        if norm == 0:
            return vector
        return [value / norm for value in vector]


def _build_dense_embedding_from_settings(settings: Settings, *, encoding_type: str):
    del encoding_type
    provider = settings.interview_dense_embedding_provider
    if provider == "local_default":
        zvec = _import_zvec()
        return zvec.DefaultLocalDenseEmbedding(
            model_source=settings.interview_dense_embedding_model_source
        )
    if provider == "local_hf_qwen3":
        return LocalQwenDenseEmbedding(
            model_name=settings.interview_dense_embedding_model_name,
            model_source=settings.interview_dense_embedding_model_source,
            device=settings.interview_dense_embedding_device,
            normalize=settings.interview_dense_embedding_normalize,
        )
    raise ValueError(f"Unsupported interview dense embedding provider: {provider}")


def build_dense_document_embedding_from_settings(settings: Settings | None = None):
    current_settings = settings or get_settings()
    return _build_dense_embedding_from_settings(current_settings, encoding_type="document")


def build_dense_query_embedding_from_settings(settings: Settings | None = None):
    current_settings = settings or get_settings()
    return _build_dense_embedding_from_settings(current_settings, encoding_type="query")


def _build_sparse_embedding_from_settings(
    corpus: list[str],
    settings: Settings,
    *,
    encoding_type: str,
):
    provider = settings.interview_sparse_embedding_provider
    if provider == "bm25":
        zvec = _import_zvec()
        kwargs = {
            "corpus": corpus,
            "encoding_type": encoding_type,
            "language": settings.interview_sparse_embedding_language,
        }
        if settings.interview_sparse_embedding_bm25_b is not None:
            kwargs["b"] = settings.interview_sparse_embedding_bm25_b
        if settings.interview_sparse_embedding_bm25_k1 is not None:
            kwargs["k1"] = settings.interview_sparse_embedding_bm25_k1
        return zvec.BM25EmbeddingFunction(**kwargs)
    if provider == "local_default":
        zvec = _import_zvec()
        return zvec.DefaultLocalSparseEmbedding(
            model_source=settings.interview_sparse_embedding_model_source,
            encoding_type=encoding_type,
        )
    raise ValueError(f"Unsupported interview sparse embedding provider: {provider}")


def build_sparse_document_embedding_from_settings(
    corpus: list[str],
    settings: Settings | None = None,
):
    current_settings = settings or get_settings()
    return _build_sparse_embedding_from_settings(corpus, current_settings, encoding_type="document")


def build_sparse_query_embedding_from_settings(
    corpus: list[str],
    settings: Settings | None = None,
):
    current_settings = settings or get_settings()
    return _build_sparse_embedding_from_settings(corpus, current_settings, encoding_type="query")


def resolve_dense_embedding_dimension(embedding: Any, configured_dimension: int | None = None) -> int:
    dimension = getattr(embedding, "dimension", None)
    if isinstance(dimension, int) and dimension > 0:
        return dimension
    if isinstance(configured_dimension, int) and configured_dimension > 0:
        return configured_dimension
    raise ValueError("Unable to resolve dense embedding dimension")


def _build_dense_metadata(settings: Settings, *, encoding_type: str, dimension: int) -> dict[str, Any]:
    del encoding_type
    provider = settings.interview_dense_embedding_provider
    if provider == "local_default":
        return {
            "provider": provider,
            "model_source": settings.interview_dense_embedding_model_source,
            "dimension": dimension,
        }
    if provider == "local_hf_qwen3":
        return {
            "provider": provider,
            "model_name": settings.interview_dense_embedding_model_name,
            "model_source": settings.interview_dense_embedding_model_source,
            "device": settings.interview_dense_embedding_device,
            "normalize": settings.interview_dense_embedding_normalize,
            "dimension": dimension,
        }
    raise ValueError(f"Unsupported interview dense embedding provider: {provider}")


def _build_sparse_metadata(settings: Settings) -> dict[str, Any]:
    provider = settings.interview_sparse_embedding_provider
    if provider == "bm25":
        metadata: dict[str, Any] = {
            "provider": provider,
            "language": settings.interview_sparse_embedding_language,
        }
        if settings.interview_sparse_embedding_bm25_b is not None:
            metadata["b"] = settings.interview_sparse_embedding_bm25_b
        if settings.interview_sparse_embedding_bm25_k1 is not None:
            metadata["k1"] = settings.interview_sparse_embedding_bm25_k1
        return metadata
    if provider == "local_default":
        return {
            "provider": provider,
            "model_source": settings.interview_sparse_embedding_model_source,
        }
    raise ValueError(f"Unsupported interview sparse embedding provider: {provider}")


def build_interview_embedding_metadata(
    settings: Settings | None = None,
    *,
    dense_document_dimension: int,
    dense_query_dimension: int | None = None,
) -> dict[str, Any]:
    current_settings = settings or get_settings()
    query_dimension = dense_query_dimension if dense_query_dimension is not None else dense_document_dimension
    return {
        "index_embedding": {
            "dense": _build_dense_metadata(
                current_settings,
                encoding_type="document",
                dimension=dense_document_dimension,
            ),
            "sparse": _build_sparse_metadata(current_settings),
        },
        "query_embedding": {
            "dense": _build_dense_metadata(
                current_settings,
                encoding_type="query",
                dimension=query_dimension,
            ),
            "sparse": _build_sparse_metadata(current_settings),
        },
    }


def build_interview_corpus(data_service: DataService | None = None) -> list[str]:
    service = data_service or get_data_service()
    from app.services.interview_rag_service import InterviewZvecIndexService

    return [
        InterviewZvecIndexService._build_document_text(item)
        for item in service.list_all_interviews()
    ]
