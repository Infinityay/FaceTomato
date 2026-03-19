from __future__ import annotations

import argparse

import pytest

from app.core.config import Settings
from scripts import build_interview_zvec_index as script


def test_parse_args_supports_local_only_provider_choices(monkeypatch):
    monkeypatch.setattr(
        "sys.argv",
        [
            "build_interview_zvec_index.py",
            "--dense-provider",
            "local_hf_qwen3",
            "--dense-model-name",
            "Qwen/Qwen3-Embedding-0.6B",
            "--dense-model-source",
            "modelscope",
            "--dense-device",
            "cpu",
            "--dense-normalize",
            "false",
            "--sparse-provider",
            "bm25",
            "--bm25-language",
            "en",
            "--bm25-b",
            "0.7",
            "--bm25-k1",
            "1.3",
        ],
    )

    args = script.parse_args()

    assert args.dense_provider == "local_hf_qwen3"
    assert args.dense_model_name == "Qwen/Qwen3-Embedding-0.6B"
    assert args.dense_model_source == "modelscope"
    assert args.dense_device == "cpu"
    assert args.dense_normalize == "false"
    assert args.sparse_provider == "bm25"
    assert args.bm25_language == "en"
    assert args.bm25_b == 0.7
    assert args.bm25_k1 == 1.3


def test_parse_args_rejects_removed_remote_only_flags(monkeypatch):
    monkeypatch.setattr(
        "sys.argv",
        ["build_interview_zvec_index.py", "--dense-dimension", "3072"],
    )

    with pytest.raises(SystemExit):
        script.parse_args()


def test_build_settings_with_overrides_only_updates_explicit_values(monkeypatch):
    base_settings = Settings(
        interview_dense_embedding_provider="local_default",
        interview_dense_embedding_model_name="default-model",
        interview_dense_embedding_model_source="huggingface",
        interview_sparse_embedding_provider="bm25",
        interview_sparse_embedding_language="zh",
    )
    monkeypatch.setattr(script, "get_settings", lambda: base_settings)
    args = argparse.Namespace(
        dense_provider="local_hf_qwen3",
        dense_model_name=None,
        dense_model_source="modelscope",
        dense_device="cpu",
        dense_normalize=None,
        sparse_provider="local_default",
        sparse_model_source="modelscope",
        bm25_language=None,
        bm25_b=None,
        bm25_k1=None,
    )

    settings = script._build_settings_with_overrides(args)

    assert settings.interview_dense_embedding_provider == "local_hf_qwen3"
    assert settings.interview_dense_embedding_model_source == "modelscope"
    assert settings.interview_dense_embedding_device == "cpu"
    assert settings.interview_dense_embedding_model_name == "default-model"
    assert settings.interview_sparse_embedding_provider == "local_default"
    assert settings.interview_sparse_embedding_model_source == "modelscope"
    assert settings.interview_sparse_embedding_language == "zh"


def test_build_settings_with_overrides_parses_dense_normalize_flag(monkeypatch):
    base_settings = Settings(interview_dense_embedding_normalize=True)
    monkeypatch.setattr(script, "get_settings", lambda: base_settings)
    args = argparse.Namespace(
        dense_provider=None,
        dense_model_name=None,
        dense_model_source=None,
        dense_device=None,
        dense_normalize="false",
        sparse_provider=None,
        sparse_model_source=None,
        bm25_language=None,
        bm25_b=None,
        bm25_k1=None,
    )

    settings = script._build_settings_with_overrides(args)

    assert settings.interview_dense_embedding_normalize is False


def test_main_builds_document_side_embeddings(monkeypatch):
    build_calls: list[tuple[str, object]] = []
    fake_settings = Settings()
    fake_data_service = object()
    fake_corpus = ["doc1", "doc2"]
    fake_dense_document = object()
    fake_dense_query = object()
    fake_sparse_document = object()
    recorded = {}

    monkeypatch.setattr(script, "parse_args", lambda: argparse.Namespace())
    monkeypatch.setattr(script, "_build_settings_with_overrides", lambda args: fake_settings)
    monkeypatch.setattr(script, "get_data_service", lambda: fake_data_service)
    monkeypatch.setattr(script, "build_interview_corpus", lambda data_service: fake_corpus)
    monkeypatch.setattr(
        script,
        "build_dense_document_embedding_from_settings",
        lambda settings: build_calls.append(("dense_document", settings)) or fake_dense_document,
    )
    monkeypatch.setattr(
        script,
        "build_dense_query_embedding_from_settings",
        lambda settings: build_calls.append(("dense_query", settings)) or fake_dense_query,
    )
    monkeypatch.setattr(
        script,
        "build_sparse_document_embedding_from_settings",
        lambda corpus, settings: build_calls.append(("sparse_document", corpus, settings)) or fake_sparse_document,
    )

    class FakeIndexService:
        def __init__(self, *, dense_embedding_fn, sparse_document_embedding_fn, data_service):
            recorded["dense_embedding_fn"] = dense_embedding_fn
            recorded["sparse_document_embedding_fn"] = sparse_document_embedding_fn
            recorded["data_service"] = data_service

        def create_or_rebuild_index(self):
            return {"documents": 2}

    monkeypatch.setattr(script, "InterviewZvecIndexService", FakeIndexService)

    script.main()

    assert build_calls[0] == ("dense_document", fake_settings)
    assert build_calls[1] == ("dense_query", fake_settings)
    assert build_calls[2] == ("sparse_document", fake_corpus, fake_settings)
    assert recorded["dense_embedding_fn"] is fake_dense_document
    assert recorded["sparse_document_embedding_fn"] is fake_sparse_document
