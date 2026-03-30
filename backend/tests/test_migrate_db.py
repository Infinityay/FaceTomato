from __future__ import annotations

import sqlite3
from pathlib import Path

from scripts import migrate_db


def _write_record(base_dir: Path, category: str, filename: str, payload: dict) -> None:
    target_dir = base_dir / category
    target_dir.mkdir(parents=True, exist_ok=True)
    (target_dir / filename).write_text(__import__("json").dumps(payload, ensure_ascii=False), encoding="utf-8")


def _fetch_categories(db_path: Path) -> list[str]:
    conn = sqlite3.connect(str(db_path))
    try:
        rows = conn.execute("SELECT category FROM interviews ORDER BY id ASC").fetchall()
        return [row[0] for row in rows]
    finally:
        conn.close()


def test_rebuild_db_imports_new_categories_and_skips_invalid_records(tmp_path: Path):
    source_dir = tmp_path / "source"
    db_path = tmp_path / "data" / "interviews.db"

    _write_record(
        source_dir,
        "移动端开发",
        "mobile.json",
        {
            "source_id": "mobile-1",
            "title": "移动端面经",
            "content": "移动端性能优化",
            "publish_time": "2026-03-01 10:00:00",
            "category": "移动端开发",
            "source": "nowcoder",
            "company": "小米",
            "department": "客户端",
            "stage": "一面",
            "result": "offer",
            "interview_type": "校招",
        },
    )
    _write_record(
        source_dir,
        "产品经理",
        "pm.json",
        {
            "source_id": "pm-1",
            "title": "产品经理面经",
            "content": "需求拆解与指标设计",
            "publish_time": "2026-03-02 11:00:00",
            "category": "产品经理",
            "source": "boss",
            "company": "美团",
            "department": "平台产品",
            "stage": "二面",
            "result": "offer",
            "interview_type": "社招",
        },
    )
    _write_record(
        source_dir,
        "语音算法",
        "speech.json",
        {
            "source_id": "speech-1",
            "title": "语音算法面经",
            "content": "ASR 与声学模型优化",
            "publish_time": "2026-03-02 15:00:00",
            "category": "语音算法",
            "source": "nowcoder",
            "company": "科大讯飞",
            "department": "语音算法",
            "stage": "一面",
            "result": "offer",
            "interview_type": "校招",
        },
    )
    _write_record(
        source_dir,
        "产品经理",
        "invalid-record.json",
        {
            "source_id": "pm-invalid",
            "title": "非法分类记录",
            "content": "应该被跳过",
            "publish_time": "2026-03-03 11:00:00",
            "category": "非法分类",
            "source": "boss",
        },
    )
    _write_record(
        source_dir,
        "测试目录",
        "ignored-dir.json",
        {
            "source_id": "ignored-1",
            "title": "目录不合法",
            "content": "不应该被导入",
            "publish_time": "2026-03-03 11:00:00",
            "category": "测试目录",
            "source": "boss",
        },
    )

    migrate_db.rebuild_db(db_path, source_dir)

    assert _fetch_categories(db_path) == ["移动端开发", "产品经理", "语音算法"]


def test_valid_categories_include_new_shared_categories():
    assert "移动端开发" in migrate_db.VALID_CATEGORIES
    assert "产品经理" in migrate_db.VALID_CATEGORIES
    assert "语音算法" in migrate_db.VALID_CATEGORIES
