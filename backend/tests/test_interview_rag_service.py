from __future__ import annotations

import json
import sqlite3

import pytest

try:
    import zvec
except ImportError:  # pragma: no cover - exercised in default install path
    zvec = None

from app.schemas.interview import Category, InterviewType
from app.schemas.jd import JDData, JDBasicInfo, JDRequirements
from app.schemas.resume import ResumeData
from app.services import interview_rag_service as rag_module
from app.services.interview_rag_service import (
    InterviewRagService,
    InterviewZvecIndexService,
    RetrievalQueryContext,
)
from app.services.interview_service import DataService

CREATE_TABLE = """
CREATE TABLE interviews (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    title          TEXT NOT NULL,
    content        TEXT,
    publish_time   TEXT,
    category       TEXT NOT NULL,
    source         TEXT NOT NULL,
    source_id      TEXT NOT NULL,
    company        TEXT,
    department     TEXT,
    stage          TEXT,
    result         TEXT DEFAULT 'null',
    interview_type TEXT,
    created_at     TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (source, source_id)
);
"""


def make_db(rows: list[dict]) -> sqlite3.Connection:
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.execute(CREATE_TABLE)
    for row in rows:
        conn.execute(
            """
            INSERT INTO interviews
                (title, content, publish_time, category, source, source_id,
                 company, department, stage, result, interview_type)
            VALUES (:title, :content, :publish_time, :category, :source, :source_id,
                    :company, :department, :stage, :result, :interview_type)
            """,
            row,
        )
    conn.commit()
    return conn


SAMPLE_ROWS = [
    {
        "title": "阿里前端一面",
        "content": "React 性能优化、Vite、TypeScript 工程化",
        "publish_time": "2024-10-01 10:00:00",
        "category": "前端开发",
        "source": "nowcoder",
        "source_id": "nc-ali-fe-1",
        "company": "阿里巴巴",
        "department": "前端",
        "stage": "一面",
        "result": "offer",
        "interview_type": "校招",
    },
    {
        "title": "阿里前端二面",
        "content": "组件设计、状态管理、浏览器缓存",
        "publish_time": "2024-10-02 10:00:00",
        "category": "前端开发",
        "source": "nowcoder",
        "source_id": "nc-ali-fe-2",
        "company": "阿里云",
        "department": "前端",
        "stage": "二面",
        "result": "offer",
        "interview_type": "校招",
    },
    {
        "title": "腾讯后端一面",
        "content": "FastAPI、数据库索引、系统设计",
        "publish_time": "2024-10-03 10:00:00",
        "category": "后端开发",
        "source": "nowcoder",
        "source_id": "nc-tencent-be-1",
        "company": "腾讯",
        "department": "后台",
        "stage": "一面",
        "result": "offer",
        "interview_type": "社招",
    },
]


class StubDenseEmbedding:
    dimension = 4

    def __init__(self, name: str = "dense") -> None:
        self.name = name

    def embed(self, text: str) -> list[float]:
        text = text.lower()
        return [
            1.0 if "react" in text else 0.0,
            1.0 if "typescript" in text else 0.0,
            1.0 if "fastapi" in text else 0.0,
            min(len(text) / 100.0, 1.0),
        ]


class StubSparseEmbedding:
    def embed(self, text: str) -> dict[int, float]:
        text = text.lower()
        vector: dict[int, float] = {}
        if "react" in text:
            vector[1] = 1.0
        if "typescript" in text:
            vector[2] = 1.0
        if "vite" in text:
            vector[3] = 1.0
        if "fastapi" in text:
            vector[4] = 1.0
        if "数据库" in text or "database" in text:
            vector[5] = 1.0
        return vector


class RecordingCollection:
    def __init__(self):
        self.insert_batches: list[int] = []
        self.optimized = False

    def insert(self, docs):
        self.insert_batches.append(len(docs))

    def optimize(self, _option):
        self.optimized = True


class QueryRecordingCollection:
    def __init__(self, responses: list[list]):
        self.responses = responses
        self.filters: list[str | None] = []

    def query(self, *, filter=None, **kwargs):
        self.filters.append(filter)
        index = len(self.filters) - 1
        return self.responses[index] if index < len(self.responses) else []


@pytest.mark.skipif(zvec is None, reason="rag extra not installed")
def test_build_collection_schema_supports_filters_and_vectors(tmp_path):
    schema = InterviewZvecIndexService.build_collection_schema(dense_dimension=4)
    assert schema.name == InterviewZvecIndexService.COLLECTION_NAME
    assert len(schema.fields) >= 8
    assert len(schema.vectors) == 2


@pytest.mark.skipif(zvec is None, reason="rag extra not installed")
def test_create_or_rebuild_index_and_retrieve_with_filters(tmp_path):
    conn = make_db(SAMPLE_ROWS)
    data_service = DataService(conn=conn)
    dense = StubDenseEmbedding()
    sparse = StubSparseEmbedding()
    index_service = InterviewZvecIndexService(
        dense_embedding_fn=dense,
        sparse_document_embedding_fn=sparse,
        data_service=data_service,
        index_path=tmp_path / "interview_zvec",
    )

    stats = index_service.create_or_rebuild_index()
    assert stats["documents"] == 3
    assert index_service.index_exists() is True

    collection = index_service.open_collection(read_only=True)
    results = collection.query(
        vectors=[
            zvec.VectorQuery(index_service.DENSE_VECTOR_FIELD, vector=dense.embed("React TypeScript")),
            zvec.VectorQuery(index_service.SPARSE_VECTOR_FIELD, vector=sparse.embed("React TypeScript")),
        ],
        topk=5,
        filter='category = "前端开发" AND interview_type = "校招" AND company like "阿里%"',
        output_fields=["interview_id", "company", "title"],
        reranker=zvec.WeightedReRanker(
            topn=2,
            metric=zvec.MetricType.IP,
            weights={
                index_service.DENSE_VECTOR_FIELD: 1.2,
                index_service.SPARSE_VECTOR_FIELD: 1.0,
            },
        ),
    )

    assert len(results) == 2
    assert results[0].fields["company"].startswith("阿里")


@pytest.mark.skipif(zvec is None, reason="rag extra not installed")
def test_retrieve_for_plan_returns_filtered_items_and_company_fallback(tmp_path):
    conn = make_db(SAMPLE_ROWS)
    data_service = DataService(conn=conn)
    dense = StubDenseEmbedding()
    sparse = StubSparseEmbedding()
    index_service = InterviewZvecIndexService(
        dense_embedding_fn=dense,
        sparse_document_embedding_fn=sparse,
        data_service=data_service,
        index_path=tmp_path / "interview_zvec",
    )
    rag_service = InterviewRagService(
        dense_embedding_fn=dense,
        sparse_query_embedding_fn=sparse,
        index_service=index_service,
        data_service=data_service,
        topk=2,
        candidate_topk=5,
        dense_weight=1.2,
        sparse_weight=1.0,
    )

    result = rag_service.retrieve_for_plan(
        RetrievalQueryContext(
            category=Category.FRONTEND,
            interview_type=InterviewType.CAMPUS,
            resume_data=ResumeData(),
            jd_text="阿里前端开发，要求熟悉 React 和 TypeScript",
            jd_data=JDData(
                basicInfo=JDBasicInfo(company="阿里", jobTitle="前端开发工程师"),
                requirements=JDRequirements(techStack=["React", "TypeScript"]),
            ),
        )
    )

    assert result.items
    assert all(item.category == Category.FRONTEND for item in result.items)
    assert result.appliedFilters.company == "阿里"
    assert result.appliedFilters.interviewType == InterviewType.CAMPUS
    assert any(item.company and item.company.startswith("阿里") for item in result.items)
    assert all(item.source == "nowcoder" for item in result.items)
    assert all(item.sourceId for item in result.items)

    fallback_result = rag_service.retrieve_for_plan(
        RetrievalQueryContext(
            category=Category.FRONTEND,
            interview_type=InterviewType.CAMPUS,
            resume_data=ResumeData(),
            jd_text="字节前端开发，要求熟悉 React 和 TypeScript",
            jd_data=JDData(
                basicInfo=JDBasicInfo(company="字节跳动", jobTitle="前端开发工程师"),
                requirements=JDRequirements(techStack=["React", "TypeScript"]),
            ),
        )
    )

    assert fallback_result.items
    assert fallback_result.appliedFilters.company is None
    assert fallback_result.appliedFilters.interviewType is None


@pytest.mark.skipif(zvec is None, reason="rag extra not installed")
def test_retrieve_for_plan_fills_results_across_three_filter_levels(tmp_path, monkeypatch):
    conn = make_db(SAMPLE_ROWS)
    data_service = DataService(conn=conn)
    dense = StubDenseEmbedding()
    sparse = StubSparseEmbedding()
    index_service = InterviewZvecIndexService(
        dense_embedding_fn=dense,
        sparse_document_embedding_fn=sparse,
        data_service=data_service,
        index_path=tmp_path / "interview_zvec",
    )
    rag_service = InterviewRagService(
        dense_embedding_fn=dense,
        sparse_query_embedding_fn=sparse,
        index_service=index_service,
        data_service=data_service,
        topk=3,
        candidate_topk=5,
        dense_weight=1.2,
        sparse_weight=1.0,
    )
    strict_filter = 'category = "前端开发" AND interview_type = "校招" AND company like "字节跳动%"'
    company_filter = 'category = "前端开发" AND company like "字节跳动%"'
    category_filter = 'category = "前端开发"'
    doc1 = zvec.Doc(id="1", fields={
        "interview_id": 1,
        "source": "nowcoder",
        "source_id": "nc-ali-fe-1",
        "title": "阿里前端一面",
        "company": "阿里巴巴",
        "category": "前端开发",
        "interview_type": "校招",
        "stage": "一面",
        "publish_time": "2024-10-01 10:00:00",
        "content": "React 性能优化",
    }, score=1.0)
    doc2 = zvec.Doc(id="2", fields={
        "interview_id": 2,
        "source": "nowcoder",
        "source_id": "nc-ali-fe-2",
        "title": "阿里前端二面",
        "company": "阿里云",
        "category": "前端开发",
        "interview_type": "校招",
        "stage": "二面",
        "publish_time": "2024-10-02 10:00:00",
        "content": "组件设计",
    }, score=0.9)
    doc3 = zvec.Doc(id="3", fields={
        "interview_id": 3,
        "source": "nowcoder",
        "source_id": "nc-extra-fe-3",
        "title": "其他前端面经",
        "company": "快手",
        "category": "前端开发",
        "interview_type": "实习",
        "stage": "一面",
        "publish_time": "2024-10-03 10:00:00",
        "content": "前端工程化",
    }, score=0.8)
    collection = QueryRecordingCollection([[doc1], [doc1, doc2], [doc2, doc3]])
    monkeypatch.setattr(index_service, "open_collection", lambda read_only=True: collection)
    monkeypatch.setattr(index_service, "ensure_index", lambda: None)

    result = rag_service.retrieve_for_plan(
        RetrievalQueryContext(
            category=Category.FRONTEND,
            interview_type=InterviewType.CAMPUS,
            resume_data=ResumeData(),
            jd_data=JDData(
                basicInfo=JDBasicInfo(company="字节跳动", jobTitle="前端开发工程师"),
                requirements=JDRequirements(techStack=["React"], jobDuties=["负责前端开发"]),
            ),
        )
    )

    assert collection.filters == [strict_filter, company_filter, category_filter]
    assert [item.interviewId for item in result.items] == [1, 2, 3]
    assert result.appliedFilters.category == Category.FRONTEND
    assert result.appliedFilters.interviewType is None
    assert result.appliedFilters.company is None


@pytest.mark.skipif(zvec is None, reason="rag extra not installed")
def test_retrieve_for_plan_stops_after_topk_is_filled(tmp_path, monkeypatch):
    conn = make_db(SAMPLE_ROWS)
    data_service = DataService(conn=conn)
    dense = StubDenseEmbedding()
    sparse = StubSparseEmbedding()
    index_service = InterviewZvecIndexService(
        dense_embedding_fn=dense,
        sparse_document_embedding_fn=sparse,
        data_service=data_service,
        index_path=tmp_path / "interview_zvec",
    )
    rag_service = InterviewRagService(
        dense_embedding_fn=dense,
        sparse_query_embedding_fn=sparse,
        index_service=index_service,
        data_service=data_service,
        topk=2,
        candidate_topk=5,
    )
    doc1 = zvec.Doc(id="1", fields={
        "interview_id": 1,
        "source": "nowcoder",
        "source_id": "nc-ali-fe-1",
        "title": "阿里前端一面",
        "company": "阿里巴巴",
        "category": "前端开发",
        "interview_type": "校招",
        "stage": "一面",
        "publish_time": "2024-10-01 10:00:00",
        "content": "React 性能优化",
    }, score=1.0)
    doc2 = zvec.Doc(id="2", fields={
        "interview_id": 2,
        "source": "nowcoder",
        "source_id": "nc-ali-fe-2",
        "title": "阿里前端二面",
        "company": "阿里云",
        "category": "前端开发",
        "interview_type": "校招",
        "stage": "二面",
        "publish_time": "2024-10-02 10:00:00",
        "content": "组件设计",
    }, score=0.9)
    collection = QueryRecordingCollection([[doc1, doc2], []])
    monkeypatch.setattr(index_service, "open_collection", lambda read_only=True: collection)
    monkeypatch.setattr(index_service, "ensure_index", lambda: None)

    result = rag_service.retrieve_for_plan(
        RetrievalQueryContext(
            category=Category.FRONTEND,
            interview_type=InterviewType.CAMPUS,
            resume_data=ResumeData(),
            jd_data=JDData(
                basicInfo=JDBasicInfo(company="字节跳动", jobTitle="前端开发工程师"),
                requirements=JDRequirements(techStack=["React"], jobDuties=["负责前端开发"]),
            ),
        )
    )

    assert [item.interviewId for item in result.items] == [1, 2]
    assert len(collection.filters) == 1


def test_build_query_payload_uses_short_jd_query_only(tmp_path):
    conn = make_db(SAMPLE_ROWS)
    data_service = DataService(conn=conn)
    dense = StubDenseEmbedding()
    sparse = StubSparseEmbedding()
    index_service = InterviewZvecIndexService(
        dense_embedding_fn=dense,
        sparse_document_embedding_fn=sparse,
        data_service=data_service,
        index_path=tmp_path / "interview_zvec",
    )
    rag_service = InterviewRagService(
        dense_embedding_fn=dense,
        sparse_query_embedding_fn=sparse,
        index_service=index_service,
        data_service=data_service,
    )

    payload = rag_service.build_query_payload(
        RetrievalQueryContext(
            category=Category.FRONTEND,
            interview_type=InterviewType.CAMPUS,
            resume_data=ResumeData(),
            jd_text="这段原始 JD 不应该参与 query text",
            jd_data=JDData(
                basicInfo=JDBasicInfo(company="阿里巴巴", jobTitle="大模型算法实习生"),
                requirements=JDRequirements(
                    techStack=["Python", "PyTorch", "RAG"],
                    mustHave=["这段不应该出现"],
                    jobDuties=["负责检索增强生成", "负责向量召回优化"],
                ),
            ),
        )
    )

    assert payload.query_text == "大模型算法实习生\nPython\nPyTorch\nRAG\n负责检索增强生成\n负责向量召回优化\n前端开发\n校招"


def test_build_document_id_uses_stable_source_identity(tmp_path):
    conn = make_db(SAMPLE_ROWS)
    data_service = DataService(conn=conn)
    index_service = InterviewZvecIndexService(
        dense_embedding_fn=StubDenseEmbedding(),
        sparse_document_embedding_fn=StubSparseEmbedding(),
        data_service=data_service,
        index_path=tmp_path / "interview_zvec",
    )
    interview = data_service.list_all_interviews()[0]
    same_identity_different_content = interview.model_copy(
        update={"title": "新标题", "content": "不同内容", "company": "新公司"}
    )

    document_id = index_service._build_document_id(interview)

    assert document_id.startswith("src_")
    assert document_id == index_service._build_document_id(same_identity_different_content)


@pytest.mark.skipif(zvec is None, reason="rag extra not installed")
def test_create_or_rebuild_index_writes_embedding_metadata(tmp_path, monkeypatch):
    conn = make_db(SAMPLE_ROWS)
    data_service = DataService(conn=conn)
    index_service = InterviewZvecIndexService(
        dense_embedding_fn=StubDenseEmbedding("document"),
        sparse_document_embedding_fn=StubSparseEmbedding(),
        data_service=data_service,
        index_path=tmp_path / "interview_zvec",
    )
    monkeypatch.setattr(
        rag_module,
        "build_interview_embedding_metadata",
        lambda settings=None, *, dense_document_dimension, dense_query_dimension=None: {
            "index_embedding": {
                "dense": {"provider": "local_default", "dimension": dense_document_dimension},
                "sparse": {"provider": "bm25", "language": "zh"},
            },
            "query_embedding": {
                "dense": {"provider": "local_hf_qwen3", "dimension": dense_query_dimension},
                "sparse": {"provider": "local_default", "model_source": "huggingface"},
            },
        },
    )

    index_service.create_or_rebuild_index()

    metadata = json.loads(index_service._metadata_path().read_text(encoding="utf-8"))
    assert metadata["embedding"]["index_embedding"]["dense"]["provider"] == "local_default"
    assert metadata["embedding"]["index_embedding"]["dense"]["dimension"] == 4
    assert metadata["embedding"]["query_embedding"]["dense"]["provider"] == "local_hf_qwen3"


@pytest.mark.skipif(zvec is None, reason="rag extra not installed")
def test_ensure_index_rebuilds_when_index_embedding_metadata_changes(tmp_path, monkeypatch):
    conn = make_db(SAMPLE_ROWS)
    data_service = DataService(conn=conn)
    index_service = InterviewZvecIndexService(
        dense_embedding_fn=StubDenseEmbedding(),
        sparse_document_embedding_fn=StubSparseEmbedding(),
        data_service=data_service,
        index_path=tmp_path / "interview_zvec",
    )
    states = [
        {
            "index_embedding": {
                "dense": {"provider": "local_default", "dimension": 4},
                "sparse": {"provider": "bm25"},
            },
            "query_embedding": {
                "dense": {"provider": "local_hf_qwen3", "dimension": 4},
                "sparse": {"provider": "bm25"},
            },
        },
        {
            "index_embedding": {
                "dense": {"provider": "local_hf_qwen3", "dimension": 1024},
                "sparse": {"provider": "bm25"},
            },
            "query_embedding": {
                "dense": {"provider": "local_hf_qwen3", "dimension": 4},
                "sparse": {"provider": "bm25"},
            },
        },
    ]
    monkeypatch.setattr(
        rag_module,
        "build_interview_embedding_metadata",
        lambda settings=None, *, dense_document_dimension, dense_query_dimension=None: states[0],
    )
    index_service.create_or_rebuild_index()

    rebuild_calls: list[str] = []
    original = InterviewZvecIndexService.create_or_rebuild_index

    def wrapped(self):
        rebuild_calls.append("rebuild")
        return original(self)

    monkeypatch.setattr(
        rag_module,
        "build_interview_embedding_metadata",
        lambda settings=None, *, dense_document_dimension, dense_query_dimension=None: states[1],
    )
    monkeypatch.setattr(InterviewZvecIndexService, "create_or_rebuild_index", wrapped)

    index_service.ensure_index()

    assert rebuild_calls == ["rebuild"]


@pytest.mark.skipif(zvec is None, reason="rag extra not installed")
def test_ensure_index_ignores_query_only_embedding_metadata_changes(tmp_path, monkeypatch):
    conn = make_db(SAMPLE_ROWS)
    data_service = DataService(conn=conn)
    index_service = InterviewZvecIndexService(
        dense_embedding_fn=StubDenseEmbedding(),
        sparse_document_embedding_fn=StubSparseEmbedding(),
        data_service=data_service,
        index_path=tmp_path / "interview_zvec",
    )
    states = [
        {
            "index_embedding": {
                "dense": {"provider": "local_default", "dimension": 4},
                "sparse": {"provider": "bm25"},
            },
            "query_embedding": {
                "dense": {"provider": "local_default", "dimension": 4},
                "sparse": {"provider": "bm25"},
            },
        },
        {
            "index_embedding": {
                "dense": {"provider": "local_default", "dimension": 4},
                "sparse": {"provider": "bm25"},
            },
            "query_embedding": {
                "dense": {"provider": "local_hf_qwen3", "dimension": 4},
                "sparse": {"provider": "local_default", "model_source": "huggingface"},
            },
        },
    ]
    monkeypatch.setattr(
        rag_module,
        "build_interview_embedding_metadata",
        lambda settings=None, *, dense_document_dimension, dense_query_dimension=None: states[0],
    )
    index_service.create_or_rebuild_index()

    rebuild_calls: list[str] = []
    monkeypatch.setattr(
        rag_module,
        "build_interview_embedding_metadata",
        lambda settings=None, *, dense_document_dimension, dense_query_dimension=None: states[1],
    )
    monkeypatch.setattr(
        InterviewZvecIndexService,
        "create_or_rebuild_index",
        lambda self: rebuild_calls.append("rebuild"),
    )

    index_service.ensure_index()

    assert rebuild_calls == []


def test_get_interview_rag_service_requires_rag_extra_when_dependency_is_missing(monkeypatch):
    rag_module.get_interview_rag_service.cache_clear()
    rag_module._build_default_dense_document_embedding.cache_clear()
    rag_module._build_default_dense_query_embedding.cache_clear()
    rag_module._build_default_sparse_document_embedding.cache_clear()
    rag_module._build_default_sparse_query_embedding.cache_clear()

    monkeypatch.setattr(
        rag_module,
        "ensure_rag_dependencies_available",
        lambda: (_ for _ in ()).throw(RuntimeError("Please install the backend rag optional dependency")),
        raising=False,
    )

    with pytest.raises(RuntimeError, match="rag optional dependency"):
        rag_module.get_interview_rag_service()



def test_get_interview_rag_service_uses_document_and_query_dense_builders(monkeypatch):
    dense_document = StubDenseEmbedding("document")
    dense_query = StubDenseEmbedding("query")
    sparse_document = StubSparseEmbedding()
    sparse_query = StubSparseEmbedding()
    fake_data_service = object()

    rag_module.get_interview_rag_service.cache_clear()
    rag_module._build_default_dense_document_embedding.cache_clear()
    rag_module._build_default_dense_query_embedding.cache_clear()
    rag_module._build_default_sparse_document_embedding.cache_clear()
    rag_module._build_default_sparse_query_embedding.cache_clear()

    monkeypatch.setattr(rag_module, "ensure_rag_dependencies_available", lambda: None, raising=False)
    monkeypatch.setattr(rag_module, "_build_default_dense_document_embedding", lambda: dense_document)
    monkeypatch.setattr(rag_module, "_build_default_dense_query_embedding", lambda: dense_query)
    monkeypatch.setattr(rag_module, "_build_default_sparse_document_embedding", lambda: sparse_document)
    monkeypatch.setattr(rag_module, "_build_default_sparse_query_embedding", lambda: sparse_query)
    monkeypatch.setattr(rag_module, "get_data_service", lambda: fake_data_service)

    service = rag_module.get_interview_rag_service()

    assert service.index_service.dense_embedding_fn is dense_document
    assert service.dense_embedding_fn is dense_query
    assert service.index_service.sparse_document_embedding_fn is sparse_document
    assert service.sparse_query_embedding_fn is sparse_query


def test_create_or_rebuild_index_inserts_docs_in_batches(tmp_path, monkeypatch):
    many_rows = [
        {
            "title": f"面经{i}",
            "content": "React TypeScript FastAPI",
            "publish_time": f"2024-10-{(i % 28) + 1:02d} 10:00:00",
            "category": "前端开发",
            "source": "nowcoder",
            "source_id": f"nc-batch-{i}",
            "company": f"公司{i}",
            "department": "前端",
            "stage": "一面",
            "result": "offer",
            "interview_type": "校招",
        }
        for i in range(600)
    ]
    conn = make_db(many_rows)
    data_service = DataService(conn=conn)
    index_service = InterviewZvecIndexService(
        dense_embedding_fn=StubDenseEmbedding(),
        sparse_document_embedding_fn=StubSparseEmbedding(),
        data_service=data_service,
        index_path=tmp_path / "interview_zvec",
    )
    collection = RecordingCollection()
    class FakeZvecModule:
        @staticmethod
        def create_and_open(*args, **kwargs):
            return collection

        @staticmethod
        def OptimizeOption(concurrency):
            return {"concurrency": concurrency}

        @staticmethod
        def Doc(**kwargs):
            return kwargs

    monkeypatch.setattr(rag_module, "_import_zvec", lambda: FakeZvecModule)
    monkeypatch.setattr(index_service, "build_collection_schema", lambda dense_dimension: object())

    stats = index_service.create_or_rebuild_index()

    assert stats["documents"] == 600
    assert collection.insert_batches == [256, 256, 88]
    assert collection.optimized is True
