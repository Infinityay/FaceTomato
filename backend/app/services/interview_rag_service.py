"""ZVEC-backed retrieval service for mock interview planning."""

from __future__ import annotations

import hashlib
import json
import re
import shutil
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any, Protocol

from app.core.config import Settings, get_settings
from app.schemas.interview import Category, InterviewData, InterviewType
from app.schemas.jd import JDData
from app.schemas.mock_interview import (
    MockInterviewRetrievalFilters,
    MockInterviewRetrievalItem,
    MockInterviewRetrievalResult,
)
from app.schemas.resume import ResumeData
from app.services.interview_embedding_service import (
    build_dense_document_embedding_from_settings,
    build_dense_query_embedding_from_settings,
    build_interview_corpus,
    build_interview_embedding_metadata,
    build_sparse_document_embedding_from_settings,
    build_sparse_query_embedding_from_settings,
    ensure_rag_dependencies_available,
    resolve_dense_embedding_dimension,
)
from app.services.interview_service import DataService, get_data_service


class DenseEmbeddingFunction(Protocol):
    dimension: int

    def embed(self, input: str) -> list[float]: ...


class SparseEmbeddingFunction(Protocol):
    def embed(self, input: str) -> dict[int, float]: ...


@dataclass(slots=True)
class RetrievalQueryContext:
    """Input context used to build a RAG query."""

    category: Category
    interview_type: InterviewType
    resume_data: ResumeData
    jd_text: str = ""
    jd_data: JDData | None = None


@dataclass(slots=True)
class RetrievalQueryPayload:
    """Normalized query payload passed into ZVEC."""

    query_text: str
    dense_query: list[float]
    sparse_query: dict[int, float]
    filter_chain: list[MockInterviewRetrievalFilters]


@dataclass(slots=True)
class RetrievalExecutionDebug:
    """Developer-facing retrieval debug metadata without raw embeddings."""

    query_text: str
    filter_chain: list[MockInterviewRetrievalFilters]
    applied_filters: MockInterviewRetrievalFilters
    candidate_topk: int
    topk: int
    dense_weight: float
    sparse_weight: float
    selected_items: list[MockInterviewRetrievalItem]


@dataclass(slots=True)
class IndexedInterviewDocument:
    """A normalized interview record ready for ZVEC indexing."""

    document_id: str
    interview_id: int
    source: str
    source_id: str
    title: str
    content: str
    publish_time: str
    category: str
    interview_type: str
    company: str
    department: str
    stage: str
    dense_embedding: list[float]
    sparse_embedding: dict[int, float]


def _import_zvec():
    from app.services.interview_embedding_service import _import_zvec as import_zvec

    return import_zvec()


class InterviewZvecIndexService:
    """Manage the lifecycle of the local ZVEC interview collection."""

    DENSE_VECTOR_FIELD = "dense_embedding"
    SPARSE_VECTOR_FIELD = "sparse_embedding"
    COLLECTION_NAME = "interview_documents"
    INDEX_METADATA_FILENAME = "index_meta.json"
    INSERT_BATCH_SIZE = 256

    def __init__(
        self,
        *,
        dense_embedding_fn: DenseEmbeddingFunction,
        sparse_document_embedding_fn: SparseEmbeddingFunction,
        data_service: DataService | None = None,
        index_path: str | Path | None = None,
        settings: Settings | None = None,
    ) -> None:
        self.dense_embedding_fn = dense_embedding_fn
        self.sparse_document_embedding_fn = sparse_document_embedding_fn
        self.data_service = data_service or get_data_service()
        self._settings = settings or get_settings()
        configured_path = Path(index_path or self._settings.interview_zvec_index_path)
        self.index_path = self._resolve_index_path(configured_path)

    @staticmethod
    def _resolve_index_path(index_path: Path) -> Path:
        if index_path.is_absolute():
            return index_path
        base_dir = Path(__file__).resolve().parents[2]
        return base_dir / index_path

    @classmethod
    def build_collection_schema(cls, dense_dimension: int):
        zvec = _import_zvec()
        scalar_index = zvec.InvertIndexParam()
        range_index = zvec.InvertIndexParam(enable_range_optimization=True)
        return zvec.CollectionSchema(
            name=cls.COLLECTION_NAME,
            fields=[
                zvec.FieldSchema("interview_id", zvec.DataType.INT64, index_param=range_index),
                zvec.FieldSchema("source", zvec.DataType.STRING, nullable=True, index_param=scalar_index),
                zvec.FieldSchema("source_id", zvec.DataType.STRING, nullable=True, index_param=scalar_index),
                zvec.FieldSchema("category", zvec.DataType.STRING, nullable=True, index_param=scalar_index),
                zvec.FieldSchema(
                    "interview_type", zvec.DataType.STRING, nullable=True, index_param=scalar_index
                ),
                zvec.FieldSchema("company", zvec.DataType.STRING, nullable=True, index_param=scalar_index),
                zvec.FieldSchema("department", zvec.DataType.STRING, nullable=True),
                zvec.FieldSchema("stage", zvec.DataType.STRING, nullable=True),
                zvec.FieldSchema(
                    "publish_time",
                    zvec.DataType.STRING,
                    nullable=True,
                    index_param=zvec.InvertIndexParam(enable_range_optimization=True),
                ),
                zvec.FieldSchema("title", zvec.DataType.STRING, nullable=True),
                zvec.FieldSchema("content", zvec.DataType.STRING, nullable=True),
            ],
            vectors=[
                zvec.VectorSchema(
                    cls.DENSE_VECTOR_FIELD,
                    zvec.DataType.VECTOR_FP32,
                    dense_dimension,
                    index_param=zvec.FlatIndexParam(metric_type=zvec.MetricType.IP),
                ),
                zvec.VectorSchema(cls.SPARSE_VECTOR_FIELD, zvec.DataType.SPARSE_VECTOR_FP32),
            ],
        )

    def index_exists(self) -> bool:
        metadata = self._metadata_path()
        return self.index_path.exists() and metadata.exists()

    def _metadata_path(self) -> Path:
        return self.index_path.parent / self.INDEX_METADATA_FILENAME

    def _current_signature(self) -> str:
        items = self.data_service.list_all_interviews()
        hasher = hashlib.sha256()
        for item in items:
            hasher.update(self._build_document_id(item).encode("utf-8"))
            hasher.update((item.publish_time or "").encode("utf-8"))
            hasher.update((item.content or "").encode("utf-8"))
        return hasher.hexdigest()

    def _current_embedding_metadata(self) -> dict[str, Any]:
        dense_dimension = resolve_dense_embedding_dimension(self.dense_embedding_fn)
        return build_interview_embedding_metadata(
            self._settings,
            dense_document_dimension=dense_dimension,
        )

    @staticmethod
    def _index_affecting_embedding_metadata(metadata: dict[str, Any] | None) -> dict[str, Any] | None:
        if not metadata:
            return metadata
        return metadata.get("index_embedding") if "index_embedding" in metadata else metadata

    def _load_metadata(self) -> dict | None:
        metadata_path = self._metadata_path()
        if not metadata_path.exists():
            return None
        return json.loads(metadata_path.read_text(encoding="utf-8"))

    def _write_metadata(self, metadata: dict) -> None:
        self._metadata_path().write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")

    def open_collection(self, *, read_only: bool = True):
        zvec = _import_zvec()
        option = zvec.CollectionOption(read_only=read_only)
        return zvec.open(str(self.index_path), option=option)

    def create_or_rebuild_index(self) -> dict[str, int]:
        zvec = _import_zvec()
        records = self.data_service.list_all_interviews()
        normalized = [self._normalize_interview(record) for record in records]
        schema = self.build_collection_schema(resolve_dense_embedding_dimension(self.dense_embedding_fn))
        self.index_path.parent.mkdir(parents=True, exist_ok=True)
        if self.index_path.exists():
            if self.index_path.is_dir():
                shutil.rmtree(self.index_path)
            else:
                self.index_path.unlink()

        collection = zvec.create_and_open(str(self.index_path), schema=schema)
        docs = [self._to_doc(item) for item in normalized]
        if docs:
            for batch_start in range(0, len(docs), self.INSERT_BATCH_SIZE):
                batch = docs[batch_start : batch_start + self.INSERT_BATCH_SIZE]
                collection.insert(batch)
            collection.optimize(zvec.OptimizeOption(concurrency=1))
        stats = {
            "documents": len(docs),
            "categories": len({item.category for item in normalized if item.category}),
            "companies": len({item.company for item in normalized if item.company}),
        }
        self._write_metadata({
            "signature": self._current_signature(),
            "stats": stats,
            "embedding": self._current_embedding_metadata(),
        })
        return stats

    def ensure_index(self) -> None:
        metadata = self._load_metadata()
        if not self.index_exists() or metadata is None:
            self.create_or_rebuild_index()
            return
        if metadata.get("signature") != self._current_signature():
            self.create_or_rebuild_index()
            return
        stored_embedding = self._index_affecting_embedding_metadata(metadata.get("embedding"))
        current_embedding = self._index_affecting_embedding_metadata(self._current_embedding_metadata())
        if stored_embedding != current_embedding:
            self.create_or_rebuild_index()

    def _normalize_interview(self, interview: InterviewData) -> IndexedInterviewDocument:
        document_id = self._build_document_id(interview)
        text = self._build_document_text(interview)
        return IndexedInterviewDocument(
            document_id=document_id,
            interview_id=interview.id,
            source=interview.source,
            source_id=interview.source_id,
            title=interview.title,
            content=interview.content or "",
            publish_time=interview.publish_time or "",
            category=interview.category.value,
            interview_type=interview.interview_type.value if interview.interview_type else "",
            company=(interview.company or "").strip(),
            department=(interview.department or "").strip(),
            stage=(interview.stage or "").strip(),
            dense_embedding=self.dense_embedding_fn.embed(text),
            sparse_embedding=self.sparse_document_embedding_fn.embed(text),
        )

    @staticmethod
    def _build_document_id(interview: InterviewData) -> str:
        source = interview.source.strip()
        source_id = interview.source_id.strip()
        if not source or not source_id:
            raise ValueError("Interview source/source_id are required for stable document IDs")
        stable_key = f"{source}:{source_id}"
        digest = hashlib.sha1(stable_key.encode("utf-8")).hexdigest()[:24]
        return f"src_{digest}"

    @staticmethod
    def _build_document_text(interview: InterviewData) -> str:
        parts = [
            interview.title,
            interview.category.value,
            interview.interview_type.value if interview.interview_type else "",
            interview.company or "",
            interview.department or "",
            interview.stage or "",
            interview.content or "",
        ]
        return "\n".join(part for part in parts if part).strip()

    def _to_doc(self, document: IndexedInterviewDocument):
        zvec = _import_zvec()
        return zvec.Doc(
            id=document.document_id,
            vectors={
                self.DENSE_VECTOR_FIELD: document.dense_embedding,
                self.SPARSE_VECTOR_FIELD: document.sparse_embedding,
            },
            fields={
                "interview_id": document.interview_id,
                "source": document.source,
                "source_id": document.source_id,
                "category": document.category,
                "interview_type": document.interview_type,
                "company": document.company,
                "department": document.department,
                "stage": document.stage,
                "publish_time": document.publish_time,
                "title": document.title,
                "content": document.content,
            },
        )


class InterviewRagService:
    """High-level retrieval orchestration for mock interview planning."""

    OUTPUT_FIELDS = [
        "interview_id",
        "source",
        "source_id",
        "category",
        "interview_type",
        "company",
        "department",
        "stage",
        "publish_time",
        "title",
        "content",
    ]

    def __init__(
        self,
        *,
        dense_embedding_fn: DenseEmbeddingFunction,
        sparse_query_embedding_fn: SparseEmbeddingFunction,
        index_service: InterviewZvecIndexService,
        data_service: DataService | None = None,
        topk: int | None = None,
        candidate_topk: int | None = None,
        dense_weight: float | None = None,
        sparse_weight: float | None = None,
    ) -> None:
        settings = get_settings()
        self.dense_embedding_fn = dense_embedding_fn
        self.sparse_query_embedding_fn = sparse_query_embedding_fn
        self.index_service = index_service
        self.data_service = data_service or get_data_service()
        self.topk = topk or settings.interview_rag_topk
        self.candidate_topk = candidate_topk or settings.interview_rag_candidate_topk
        self.dense_weight = dense_weight if dense_weight is not None else settings.interview_rag_dense_weight
        self.sparse_weight = (
            sparse_weight if sparse_weight is not None else settings.interview_rag_sparse_weight
        )
        self._last_debug: RetrievalExecutionDebug | None = None

    def retrieve_for_plan(self, context: RetrievalQueryContext) -> MockInterviewRetrievalResult:
        self.index_service.ensure_index()
        payload = self.build_query_payload(context)
        collection = self.index_service.open_collection(read_only=True)
        merged_results: list[Any] = []
        seen_keys: set[str] = set()
        applied_filters = payload.filter_chain[0]
        for filters in payload.filter_chain:
            tier_results = self._query_collection(collection, filters, payload)
            for doc in tier_results:
                key = self._result_identity(doc)
                if key in seen_keys:
                    continue
                seen_keys.add(key)
                merged_results.append(doc)
                applied_filters = filters
                if len(merged_results) >= self.topk:
                    break
            if len(merged_results) >= self.topk:
                break
        items = [item for doc in merged_results[: self.topk] if (item := self._to_retrieval_item(doc)) is not None]
        self._last_debug = RetrievalExecutionDebug(
            query_text=payload.query_text,
            filter_chain=[item.model_copy(deep=True) for item in payload.filter_chain],
            applied_filters=applied_filters.model_copy(deep=True),
            candidate_topk=self.candidate_topk,
            topk=self.topk,
            dense_weight=self.dense_weight,
            sparse_weight=self.sparse_weight,
            selected_items=[item.model_copy(deep=True) for item in items],
        )
        return MockInterviewRetrievalResult(
            queryText=payload.query_text,
            appliedFilters=applied_filters,
            items=items,
        )

    def get_last_debug(self) -> RetrievalExecutionDebug | None:
        if self._last_debug is None:
            return None
        return RetrievalExecutionDebug(
            query_text=self._last_debug.query_text,
            filter_chain=[item.model_copy(deep=True) for item in self._last_debug.filter_chain],
            applied_filters=self._last_debug.applied_filters.model_copy(deep=True),
            candidate_topk=self._last_debug.candidate_topk,
            topk=self._last_debug.topk,
            dense_weight=self._last_debug.dense_weight,
            sparse_weight=self._last_debug.sparse_weight,
            selected_items=[item.model_copy(deep=True) for item in self._last_debug.selected_items],
        )

    def _query_collection(
        self,
        collection,
        filters: MockInterviewRetrievalFilters,
        payload: RetrievalQueryPayload,
    ) -> list[Any]:
        zvec = _import_zvec()
        return collection.query(
            vectors=[
                zvec.VectorQuery(
                    self.index_service.DENSE_VECTOR_FIELD,
                    vector=payload.dense_query,
                ),
                zvec.VectorQuery(
                    self.index_service.SPARSE_VECTOR_FIELD,
                    vector=payload.sparse_query,
                ),
            ],
            topk=self.candidate_topk,
            filter=self._build_filter_expression(filters),
            output_fields=self.OUTPUT_FIELDS,
            reranker=zvec.WeightedReRanker(
                topn=self.topk,
                metric=zvec.MetricType.IP,
                weights={
                    self.index_service.DENSE_VECTOR_FIELD: self.dense_weight,
                    self.index_service.SPARSE_VECTOR_FIELD: self.sparse_weight,
                },
            ),
        )

    def build_query_payload(self, context: RetrievalQueryContext) -> RetrievalQueryPayload:
        query_text = self._build_query_text(context)
        if not query_text.strip():
            query_text = f"{context.category.value}\n{context.interview_type.value}"
        company = self._normalize_company(
            context.jd_data.basicInfo.company if context.jd_data else ""
        )
        filter_chain = [
            MockInterviewRetrievalFilters(
                category=context.category,
                interviewType=context.interview_type,
                company=company or None,
            )
        ]
        if company:
            filter_chain.append(
                MockInterviewRetrievalFilters(
                    category=context.category,
                    interviewType=None,
                    company=company,
                )
            )
        filter_chain.append(
            MockInterviewRetrievalFilters(
                category=context.category,
                interviewType=None,
                company=None,
            )
        )
        return RetrievalQueryPayload(
            query_text=query_text,
            dense_query=self.dense_embedding_fn.embed(query_text),
            sparse_query=self.sparse_query_embedding_fn.embed(query_text),
            filter_chain=filter_chain,
        )

    def _build_query_text(self, context: RetrievalQueryContext) -> str:
        if not context.jd_data:
            base = context.jd_text.strip()[:400]
            return base if base else f"{context.category.value}\n{context.interview_type.value}"

        tokens = [
            context.jd_data.basicInfo.jobTitle,
            *context.jd_data.requirements.techStack[:8],
            *context.jd_data.requirements.jobDuties[:5],
            context.category.value,
            context.interview_type.value,
        ]
        deduped = [token.strip() for token in tokens if token and token.strip()]
        return "\n".join(dict.fromkeys(deduped))

    @staticmethod
    def _normalize_company(company: str) -> str:
        if not company:
            return ""
        normalized = re.sub(r"[（(].*?[)）]", "", company)
        normalized = re.sub(r"\s+", "", normalized)
        return normalized.strip()

    def _build_filter_expression(self, filters: MockInterviewRetrievalFilters) -> str | None:
        clauses: list[str] = []
        if filters.category:
            clauses.append(f'category = {json.dumps(filters.category.value, ensure_ascii=False)}')
        if filters.interviewType:
            clauses.append(
                f'interview_type = {json.dumps(filters.interviewType.value, ensure_ascii=False)}'
            )
        if filters.company:
            clauses.append(f'company like {json.dumps(filters.company + "%", ensure_ascii=False)}')
        if not clauses:
            return None
        return " AND ".join(clauses)

    def _to_retrieval_item(self, doc: Any) -> MockInterviewRetrievalItem | None:
        fields = doc.fields or {}
        interview_id = int(fields.get("interview_id", 0))
        if interview_id <= 0:
            return None
        category_value = fields.get("category") or Category.FRONTEND.value
        interview_type_value = fields.get("interview_type")
        snippet = self._build_snippet(fields.get("content") or "")
        return MockInterviewRetrievalItem(
            interviewId=interview_id,
            source=fields.get("source") or "",
            sourceId=fields.get("source_id") or "",
            title=fields.get("title") or "",
            company=fields.get("company") or None,
            category=Category(category_value),
            interviewType=(InterviewType(interview_type_value) if interview_type_value else None),
            stage=fields.get("stage") or None,
            publishTime=fields.get("publish_time") or "",
            snippet=snippet,
            score=round(float(doc.score or 0.0), 4),
            reason=self._build_reason(fields, snippet),
        )

    @staticmethod
    def _result_identity(doc: Any) -> str:
        fields = doc.fields or {}
        source = (fields.get("source") or "").strip()
        source_id = (fields.get("source_id") or "").strip()
        if source and source_id:
            return f"{source}:{source_id}"
        return doc.id or str(fields.get("interview_id") or "")

    @staticmethod
    def _build_snippet(content: str) -> str:
        compact = " ".join(content.split())
        return compact[:180]

    @staticmethod
    def _build_reason(fields: dict, snippet: str) -> str:
        reasons: list[str] = []
        if fields.get("company"):
            reasons.append(f"公司：{fields['company']}")
        if fields.get("interview_type"):
            reasons.append(f"类型：{fields['interview_type']}")
        if fields.get("stage"):
            reasons.append(f"阶段：{fields['stage']}")
        if snippet:
            reasons.append(f"片段：{snippet[:60]}")
        return "；".join(reasons)


@lru_cache(maxsize=1)
def _build_default_dense_document_embedding() -> DenseEmbeddingFunction:
    return build_dense_document_embedding_from_settings()


@lru_cache(maxsize=1)
def _build_default_dense_query_embedding() -> DenseEmbeddingFunction:
    return build_dense_query_embedding_from_settings()


@lru_cache(maxsize=1)
def _build_default_sparse_document_embedding() -> SparseEmbeddingFunction:
    corpus = build_interview_corpus(get_data_service())
    return build_sparse_document_embedding_from_settings(corpus)


@lru_cache(maxsize=1)
def _build_default_sparse_query_embedding() -> SparseEmbeddingFunction:
    corpus = build_interview_corpus(get_data_service())
    return build_sparse_query_embedding_from_settings(corpus)


@lru_cache(maxsize=1)
def get_interview_rag_service() -> InterviewRagService:
    ensure_rag_dependencies_available()
    dense_document_embedding = _build_default_dense_document_embedding()
    dense_query_embedding = _build_default_dense_query_embedding()
    sparse_document_embedding = _build_default_sparse_document_embedding()
    sparse_query_embedding = _build_default_sparse_query_embedding()
    data_service = get_data_service()
    index_service = InterviewZvecIndexService(
        dense_embedding_fn=dense_document_embedding,
        sparse_document_embedding_fn=sparse_document_embedding,
        data_service=data_service,
        settings=get_settings(),
    )
    return InterviewRagService(
        dense_embedding_fn=dense_query_embedding,
        sparse_query_embedding_fn=sparse_query_embedding,
        index_service=index_service,
        data_service=data_service,
    )
