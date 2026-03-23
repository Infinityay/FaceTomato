from __future__ import annotations

import importlib

import pytest

from app.core.config import Settings
import app.services.interview_embedding_service as embedding_service


class FakeDefaultLocalDenseEmbedding:
    def __init__(self, *, model_source: str):
        self.model_source = model_source
        self.dimension = 384


class FakeDefaultLocalSparseEmbedding:
    def __init__(self, *, model_source: str, encoding_type: str):
        self.model_source = model_source
        self.encoding_type = encoding_type


class FakeBM25EmbeddingFunction:
    def __init__(
        self,
        *,
        corpus: list[str],
        encoding_type: str,
        language: str,
        b: float | None = None,
        k1: float | None = None,
    ):
        self.corpus = corpus
        self.encoding_type = encoding_type
        self.language = language
        self.b = b
        self.k1 = k1


class FakeLocalQwenDenseEmbedding:
    def __init__(self, *, model_name: str, model_source: str, device: str | None, normalize: bool):
        self.model_name = model_name
        self.model_source = model_source
        self.device = device
        self.normalize = normalize
        self.dimension = 1024


class FakeZvecModule:
    DefaultLocalDenseEmbedding = FakeDefaultLocalDenseEmbedding
    DefaultLocalSparseEmbedding = FakeDefaultLocalSparseEmbedding
    BM25EmbeddingFunction = FakeBM25EmbeddingFunction


class DenseWithoutDimension:
    pass


def test_module_import_is_safe_without_zvec(monkeypatch):
    original_import_module = embedding_service.importlib.import_module

    def fake_import_module(name: str, package: str | None = None):
        if name == "zvec":
            raise ImportError("No module named 'zvec'")
        return original_import_module(name, package)

    monkeypatch.setattr(embedding_service.importlib, "import_module", fake_import_module)

    reloaded_module = importlib.reload(embedding_service)

    metadata = reloaded_module.build_interview_embedding_metadata(
        Settings(
            interview_dense_embedding_provider="local_default",
            interview_dense_embedding_model_source="huggingface",
            interview_sparse_embedding_provider="bm25",
            interview_sparse_embedding_language="zh",
        ),
        dense_document_dimension=384,
        dense_query_dimension=384,
    )

    assert metadata["index_embedding"]["dense"]["provider"] == "local_default"
    assert metadata["query_embedding"]["sparse"]["provider"] == "bm25"


def test_build_dense_document_embedding_requires_rag_extra_when_zvec_missing(monkeypatch):
    original_import_module = embedding_service.importlib.import_module

    def fake_import_module(name: str, package: str | None = None):
        if name == "zvec":
            raise ImportError("No module named 'zvec'")
        return original_import_module(name, package)

    monkeypatch.setattr(embedding_service.importlib, "import_module", fake_import_module)
    settings = Settings(
        interview_dense_embedding_provider="local_default",
        interview_dense_embedding_model_source="huggingface",
    )

    with pytest.raises(RuntimeError, match="rag optional dependency"):
        embedding_service.build_dense_document_embedding_from_settings(settings)


def test_build_dense_document_embedding_uses_local_default_provider(monkeypatch):
    monkeypatch.setattr(embedding_service, "_import_zvec", lambda: FakeZvecModule)
    settings = Settings(
        interview_dense_embedding_provider="local_default",
        interview_dense_embedding_model_source="modelscope",
    )

    embedding = embedding_service.build_dense_document_embedding_from_settings(settings)

    assert isinstance(embedding, FakeDefaultLocalDenseEmbedding)
    assert embedding.model_source == "modelscope"


def test_build_dense_document_embedding_uses_local_hf_qwen3_provider(monkeypatch):
    monkeypatch.setattr(embedding_service, "LocalQwenDenseEmbedding", FakeLocalQwenDenseEmbedding)
    settings = Settings(
        interview_dense_embedding_provider="local_hf_qwen3",
        interview_dense_embedding_model_name="Qwen/Qwen3-Embedding-0.6B",
        interview_dense_embedding_model_source="huggingface",
        interview_dense_embedding_device="cpu",
        interview_dense_embedding_normalize=True,
    )

    embedding = embedding_service.build_dense_document_embedding_from_settings(settings)

    assert isinstance(embedding, FakeLocalQwenDenseEmbedding)
    assert embedding.model_name == "Qwen/Qwen3-Embedding-0.6B"
    assert embedding.model_source == "huggingface"
    assert embedding.device == "cpu"
    assert embedding.normalize is True


def test_build_sparse_embeddings_support_bm25_and_local_default(monkeypatch):
    monkeypatch.setattr(embedding_service, "_import_zvec", lambda: FakeZvecModule)
    corpus = ["doc1", "doc2"]

    bm25_settings = Settings(
        interview_sparse_embedding_provider="bm25",
        interview_sparse_embedding_language="zh",
        interview_sparse_embedding_bm25_b=0.6,
        interview_sparse_embedding_bm25_k1=1.4,
    )
    bm25_document = embedding_service.build_sparse_document_embedding_from_settings(corpus, bm25_settings)
    bm25_query = embedding_service.build_sparse_query_embedding_from_settings(corpus, bm25_settings)
    assert isinstance(bm25_document, FakeBM25EmbeddingFunction)
    assert bm25_document.encoding_type == "document"
    assert bm25_query.encoding_type == "query"
    assert bm25_document.language == "zh"
    assert bm25_document.b == 0.6
    assert bm25_document.k1 == 1.4

    local_settings = Settings(
        interview_sparse_embedding_provider="local_default",
        interview_sparse_embedding_model_source="modelscope",
    )
    local_document = embedding_service.build_sparse_document_embedding_from_settings(corpus, local_settings)
    local_query = embedding_service.build_sparse_query_embedding_from_settings(corpus, local_settings)
    assert isinstance(local_document, FakeDefaultLocalSparseEmbedding)
    assert local_document.encoding_type == "document"
    assert local_query.encoding_type == "query"
    assert local_document.model_source == "modelscope"


def test_build_interview_embedding_metadata_separates_index_and_query_config():
    settings = Settings(
        interview_dense_embedding_provider="local_hf_qwen3",
        interview_dense_embedding_model_name="Qwen/Qwen3-Embedding-0.6B",
        interview_dense_embedding_model_source="huggingface",
        interview_dense_embedding_device="cpu",
        interview_dense_embedding_normalize=True,
        interview_sparse_embedding_provider="local_default",
        interview_sparse_embedding_model_source="modelscope",
    )

    metadata = embedding_service.build_interview_embedding_metadata(
        settings,
        dense_document_dimension=1024,
        dense_query_dimension=1024,
    )

    assert metadata["index_embedding"]["dense"] == {
        "provider": "local_hf_qwen3",
        "model_name": "Qwen/Qwen3-Embedding-0.6B",
        "model_source": "huggingface",
        "device": "cpu",
        "normalize": True,
        "dimension": 1024,
    }
    assert metadata["query_embedding"]["dense"] == {
        "provider": "local_hf_qwen3",
        "model_name": "Qwen/Qwen3-Embedding-0.6B",
        "model_source": "huggingface",
        "device": "cpu",
        "normalize": True,
        "dimension": 1024,
    }
    assert metadata["index_embedding"]["sparse"] == {
        "provider": "local_default",
        "model_source": "modelscope",
    }
    assert metadata["query_embedding"]["sparse"] == {
        "provider": "local_default",
        "model_source": "modelscope",
    }


def test_build_interview_embedding_metadata_trims_provider_specific_fields():
    settings = Settings(
        interview_dense_embedding_provider="local_default",
        interview_dense_embedding_model_source="huggingface",
        interview_sparse_embedding_provider="bm25",
        interview_sparse_embedding_language="zh",
    )

    metadata = embedding_service.build_interview_embedding_metadata(
        settings,
        dense_document_dimension=384,
        dense_query_dimension=384,
    )

    assert metadata["index_embedding"]["dense"] == {
        "provider": "local_default",
        "model_source": "huggingface",
        "dimension": 384,
    }
    assert metadata["index_embedding"]["sparse"] == {
        "provider": "bm25",
        "language": "zh",
    }
    assert metadata["query_embedding"]["sparse"] == {
        "provider": "bm25",
        "language": "zh",
    }
    assert "api_key" not in str(metadata)


def test_build_dense_embedding_rejects_unsupported_provider():
    settings = Settings.model_construct(interview_dense_embedding_provider="unsupported")

    try:
        embedding_service.build_dense_document_embedding_from_settings(settings)
    except ValueError as exc:
        assert "Unsupported interview dense embedding provider" in str(exc)
    else:
        raise AssertionError("Expected ValueError for unsupported dense provider")


def test_build_sparse_embedding_rejects_unsupported_provider():
    settings = Settings.model_construct(interview_sparse_embedding_provider="unsupported")

    try:
        embedding_service.build_sparse_document_embedding_from_settings(["doc"], settings)
    except ValueError as exc:
        assert "Unsupported interview sparse embedding provider" in str(exc)
    else:
        raise AssertionError("Expected ValueError for unsupported sparse provider")


def test_resolve_dense_embedding_dimension_prefers_runtime_dimension():
    assert embedding_service.resolve_dense_embedding_dimension(DenseWithoutDimension(), configured_dimension=1024) == 1024
