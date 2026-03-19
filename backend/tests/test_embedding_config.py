from __future__ import annotations

from pydantic import ValidationError

from app.core.config import Settings


def test_settings_accepts_local_only_embedding_provider_literals():
    settings = Settings(
        interview_dense_embedding_provider="local_hf_qwen3",
        interview_sparse_embedding_provider="local_default",
    )

    assert settings.interview_dense_embedding_provider == "local_hf_qwen3"
    assert settings.interview_sparse_embedding_provider == "local_default"


def test_settings_rejects_removed_dense_embedding_provider():
    try:
        Settings(interview_dense_embedding_provider="openai")
    except ValidationError as exc:
        assert "interview_dense_embedding_provider" in str(exc)
    else:
        raise AssertionError("Expected ValidationError for removed dense provider")


def test_settings_rejects_removed_sparse_embedding_provider():
    try:
        Settings(interview_sparse_embedding_provider="qwen")
    except ValidationError as exc:
        assert "interview_sparse_embedding_provider" in str(exc)
    else:
        raise AssertionError("Expected ValidationError for removed sparse provider")


def test_mock_interview_rag_defaults_to_disabled():
    assert Settings.model_fields["mock_interview_rag"].default is False


def test_settings_accepts_mock_interview_rag_false_to_disable_retrieval():
    settings = Settings(mock_interview_rag=False)

    assert settings.mock_interview_rag is False
