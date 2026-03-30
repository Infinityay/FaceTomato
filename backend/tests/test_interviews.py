"""TDD tests for interview service — based on in-memory SQLite (no real DB needed).

Run:
    cd backend
    python -m pytest tests/test_interviews.py -v
"""

import sqlite3

import pytest

# ---------------------------------------------------------------------------
# Helpers: in-memory DB setup
# ---------------------------------------------------------------------------

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
    """Create an in-memory SQLite DB and populate it with given rows."""
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
        "title": "阿里一面",
        "content": "算法题若干",
        "publish_time": "2024-03-01 10:00:00",
        "category": "大模型应用开发",
        "source": "nowcoder",
        "source_id": "nc-ali-1",
        "company": "阿里",
        "department": "通义实验室",
        "stage": "一面",
        "result": "offer",
        "interview_type": "校招",
    },
    {
        "title": "腾讯二面",
        "content": "系统设计",
        "publish_time": "2024-03-05 14:00:00",
        "category": "后端开发",
        "source": "xiaohongshu",
        "source_id": "xhs-tencent-2",
        "company": "腾讯",
        "department": "后台开发",
        "stage": "二面",
        "result": "fail",
        "interview_type": "社招",
    },
    {
        "title": "百度实习面",
        "content": "项目问答",
        "publish_time": "2024-02-20 09:00:00",
        "category": "大模型算法",
        "source": "nowcoder",
        "source_id": "nc-baidu-3",
        "company": "百度",
        "department": "NLP",
        "stage": "一面",
        "result": "null",
        "interview_type": "实习",
    },
    {
        "title": "移动端专项面",
        "content": "iOS 与 Android 性能优化",
        "publish_time": "2024-03-03 11:00:00",
        "category": "移动端开发",
        "source": "nowcoder",
        "source_id": "nc-mobile-4",
        "company": "小米",
        "department": "客户端",
        "stage": "一面",
        "result": "offer",
        "interview_type": "校招",
    },
    {
        "title": "产品经理终面",
        "content": "需求分析与跨团队协作",
        "publish_time": "2024-03-04 16:30:00",
        "category": "产品经理",
        "source": "boss",
        "source_id": "boss-pm-5",
        "company": "美团",
        "department": "平台产品",
        "stage": "终面",
        "result": "offer",
        "interview_type": "社招",
    },
    {
        "title": "语音算法一面",
        "content": "语音识别与声学建模",
        "publish_time": "2024-03-02 09:30:00",
        "category": "语音算法",
        "source": "nowcoder",
        "source_id": "nc-speech-6",
        "company": "科大讯飞",
        "department": "语音算法",
        "stage": "一面",
        "result": "offer",
        "interview_type": "校招",
    },
]


# ---------------------------------------------------------------------------
# Import under test (after schema/service are implemented these must pass)
# ---------------------------------------------------------------------------

from app.schemas.interview import (  # noqa: E402
    Category,
    InterviewResult,
    InterviewType,
    NeighborItem,
)
from app.services.interview_service import DataService, row_to_interview  # noqa: E402


# ---------------------------------------------------------------------------
# Test 1: row_to_interview maps all fields correctly
# ---------------------------------------------------------------------------


def test_row_to_interview_maps_all_fields():
    conn = make_db(SAMPLE_ROWS)
    row = conn.execute("SELECT * FROM interviews WHERE title = '阿里一面'").fetchone()
    interview = row_to_interview(row)

    assert isinstance(interview.id, int)
    assert interview.id >= 1
    assert interview.title == "阿里一面"
    assert interview.content == "算法题若干"
    assert interview.publish_time == "2024-03-01 10:00:00"
    assert interview.category == Category.LLM_APP
    assert interview.company == "阿里"
    assert interview.department == "通义实验室"
    assert interview.stage == "一面"
    assert interview.result == InterviewResult.OFFER
    assert interview.interview_type == InterviewType.CAMPUS
    assert interview.source == "nowcoder"
    assert interview.source_id == "nc-ali-1"


# ---------------------------------------------------------------------------
# Test 2: filter by category
# ---------------------------------------------------------------------------


def test_filter_by_category():
    conn = make_db(SAMPLE_ROWS)
    svc = DataService(conn=conn)

    items, total = svc.filter_interviews(categories=[Category.LLM_APP])
    assert total == 1
    assert items[0].title == "阿里一面"


@pytest.mark.parametrize(
    ("category", "expected_title"),
    [
        (Category.MOBILE, "移动端专项面"),
        (Category.PRODUCT_MANAGER, "产品经理终面"),
        (Category.SPEECH_ALGO, "语音算法一面"),
    ],
)
def test_filter_by_new_shared_categories(category: Category, expected_title: str):
    conn = make_db(SAMPLE_ROWS)
    svc = DataService(conn=conn)

    items, total = svc.filter_interviews(categories=[category])

    assert total == 1
    assert items[0].title == expected_title
    assert items[0].category == category


def test_legacy_search_rec_category_is_normalized_and_filterable():
    conn = make_db(
        SAMPLE_ROWS
        + [
            {
                "title": "推荐算法旧分类",
                "content": "旧分类数据",
                "publish_time": "2024-03-06 10:00:00",
                "category": "搜广推推荐算法",
                "source": "nowcoder",
                "source_id": "nc-bytedance-legacy-rec",
                "company": "字节",
                "department": "推荐",
                "stage": "一面",
                "result": "offer",
                "interview_type": "校招",
            }
        ]
    )
    svc = DataService(conn=conn)

    items, total = svc.filter_interviews(categories=[Category.SEARCH_REC])

    assert total == 1
    assert items[0].title == "推荐算法旧分类"
    assert items[0].category == Category.SEARCH_REC

    stats = svc.get_stats()
    assert stats["categories"][Category.SEARCH_REC.value] == 1
    assert "搜广推推荐算法" not in stats["categories"]



def test_get_stats_includes_new_shared_categories():
    conn = make_db(SAMPLE_ROWS)
    svc = DataService(conn=conn)

    stats = svc.get_stats()

    assert stats["categories"][Category.MOBILE.value] == 1
    assert stats["categories"][Category.PRODUCT_MANAGER.value] == 1
    assert stats["categories"][Category.SPEECH_ALGO.value] == 1


# ---------------------------------------------------------------------------
# Test 3: filter by result
# ---------------------------------------------------------------------------


def test_filter_by_result():
    conn = make_db(SAMPLE_ROWS)
    svc = DataService(conn=conn)

    items, total = svc.filter_interviews(results=[InterviewResult.FAIL.value])
    assert total == 1
    assert items[0].title == "腾讯二面"


# ---------------------------------------------------------------------------
# Test 4: filter by interview_type
# ---------------------------------------------------------------------------


def test_filter_by_interview_type():
    conn = make_db(SAMPLE_ROWS)
    svc = DataService(conn=conn)

    items, total = svc.filter_interviews(interview_types=[InterviewType.INTERN.value])
    assert total == 1
    assert items[0].title == "百度实习面"


# ---------------------------------------------------------------------------
# Test 5: get_by_id returns correct record
# ---------------------------------------------------------------------------


def test_get_by_id():
    conn = make_db(SAMPLE_ROWS)
    # get the auto-assigned id of "腾讯二面"
    row = conn.execute("SELECT id FROM interviews WHERE title = '腾讯二面'").fetchone()
    target_id = row["id"]

    svc = DataService(conn=conn)
    interview = svc.get_by_id(target_id)

    assert interview is not None
    assert interview.id == target_id
    assert interview.title == "腾讯二面"


def test_get_by_id_not_found():
    conn = make_db(SAMPLE_ROWS)
    svc = DataService(conn=conn)
    assert svc.get_by_id(99999) is None


# ---------------------------------------------------------------------------
# Test 6: get_neighbors returns prev/next with id + title only
# ---------------------------------------------------------------------------


def test_get_neighbors_returns_prev_next():
    conn = make_db(SAMPLE_ROWS)
    # rows ordered by publish_time DESC:
    # 腾讯(3-05) > 产品经理(3-04) > 移动端(3-03) > 语音算法(3-02) > 阿里(3-01) > 百度(2-20)
    ali_id = conn.execute("SELECT id FROM interviews WHERE title = '阿里一面'").fetchone()["id"]

    svc = DataService(conn=conn)
    neighbors = svc.get_neighbors(ali_id)

    assert "prev" in neighbors
    assert "next" in neighbors

    # prev (higher publish_time) = 语音算法一面
    assert neighbors["prev"] is not None
    prev = neighbors["prev"]
    assert prev["title"] == "语音算法一面"
    assert "id" in prev
    # NeighborItem should only have id and title (no content_hash, no formatted_title)
    assert "content_hash" not in prev
    assert "formatted_title" not in prev

    # next (lower publish_time) = 百度实习面
    assert neighbors["next"] is not None
    assert neighbors["next"]["title"] == "百度实习面"
