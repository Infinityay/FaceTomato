"""Build the ZVEC interview index from the SQLite source of truth."""

from __future__ import annotations

import argparse
import json

from app.core.config import Settings, get_settings
from app.services.interview_embedding_service import (
    build_dense_document_embedding_from_settings,
    build_dense_query_embedding_from_settings,
    build_interview_corpus,
    build_sparse_document_embedding_from_settings,
    ensure_rag_dependencies_available,
)
from app.services.interview_rag_service import InterviewZvecIndexService
from app.services.interview_service import get_data_service


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build the ZVEC interview retrieval index")
    parser.add_argument(
        "--dense-provider",
        choices=["local_default", "local_hf_qwen3"],
        default=None,
        help="Dense embedding provider",
    )
    parser.add_argument(
        "--dense-model-name",
        default=None,
        help="Dense embedding model name or local path",
    )
    parser.add_argument(
        "--dense-model-source",
        choices=["huggingface", "modelscope"],
        default=None,
        help="Dense local model source",
    )
    parser.add_argument(
        "--dense-device",
        default=None,
        help="Dense embedding runtime device, such as cpu or cuda",
    )
    parser.add_argument(
        "--dense-normalize",
        choices=["true", "false"],
        default=None,
        help="Whether to normalize dense embeddings",
    )
    parser.add_argument(
        "--sparse-provider",
        choices=["bm25", "local_default"],
        default=None,
        help="Sparse embedding provider",
    )
    parser.add_argument(
        "--sparse-model-source",
        choices=["huggingface", "modelscope"],
        default=None,
        help="Sparse local model source",
    )
    parser.add_argument(
        "--bm25-language",
        choices=["zh", "en"],
        default=None,
        help="Language for BM25 sparse embeddings",
    )
    parser.add_argument("--bm25-b", type=float, default=None, help="BM25 b parameter override")
    parser.add_argument("--bm25-k1", type=float, default=None, help="BM25 k1 parameter override")
    return parser.parse_args()


def _build_settings_with_overrides(args: argparse.Namespace) -> Settings:
    base_settings = get_settings()
    updates = {
        "interview_dense_embedding_provider": getattr(args, "dense_provider", None),
        "interview_dense_embedding_model_name": getattr(args, "dense_model_name", None),
        "interview_dense_embedding_model_source": getattr(args, "dense_model_source", None),
        "interview_dense_embedding_device": getattr(args, "dense_device", None),
        "interview_dense_embedding_normalize": None
        if getattr(args, "dense_normalize", None) is None
        else args.dense_normalize == "true",
        "interview_sparse_embedding_provider": getattr(args, "sparse_provider", None),
        "interview_sparse_embedding_model_source": getattr(args, "sparse_model_source", None),
        "interview_sparse_embedding_language": getattr(args, "bm25_language", None),
        "interview_sparse_embedding_bm25_b": getattr(args, "bm25_b", None),
        "interview_sparse_embedding_bm25_k1": getattr(args, "bm25_k1", None),
    }
    overrides = {key: value for key, value in updates.items() if value is not None}
    return base_settings.model_copy(update=overrides)


def main() -> None:
    args = parse_args()
    settings = _build_settings_with_overrides(args)
    ensure_rag_dependencies_available(settings)
    data_service = get_data_service()
    corpus = build_interview_corpus(data_service)

    dense_embedding = build_dense_document_embedding_from_settings(settings)
    build_dense_query_embedding_from_settings(settings)
    sparse_document_embedding = build_sparse_document_embedding_from_settings(corpus, settings)
    index_service = InterviewZvecIndexService(
        dense_embedding_fn=dense_embedding,
        sparse_document_embedding_fn=sparse_document_embedding,
        data_service=data_service,
        settings=settings,
    )
    stats = index_service.create_or_rebuild_index()
    print(json.dumps(stats, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
