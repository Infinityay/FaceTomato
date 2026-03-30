"""One-time migration script: rebuild interviews table from scratch using new schema.

Usage:
    cd backend
    uv run python scripts/migrate_db.py --source-dir <path-to-interview-json-root> [--db-path data/interviews.db]

This script:
1. Drops the old interviews table (all old data discarded)
2. Creates the new table with the updated schema
3. Imports all JSON files from the supported category directories in the source tree
"""

import argparse
import json
import sqlite3
from collections import defaultdict
from pathlib import Path

# Only these supported categories are imported
VALID_CATEGORIES = [
    "前端开发",
    "后端开发",
    "移动端开发",
    "产品经理",
    "语音算法",
    "大模型应用开发",
    "大模型算法",
    "搜广推算法",
    "游戏开发",
    "风控算法",
]
VALID_CATEGORY_SET = set(VALID_CATEGORIES)

CREATE_TABLE_SQL = """
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

CREATE_INDEXES_SQL = [
    "CREATE INDEX idx_category       ON interviews(category);",
    "CREATE INDEX idx_result         ON interviews(result);",
    "CREATE INDEX idx_company        ON interviews(company);",
    "CREATE INDEX idx_publish_time   ON interviews(publish_time DESC);",
    "CREATE INDEX idx_source         ON interviews(source);",
    "CREATE INDEX idx_source_id      ON interviews(source_id);",
    "CREATE INDEX idx_interview_type ON interviews(interview_type);",
]


def rebuild_db(db_path: Path, source_dir: Path) -> None:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path))
    cursor = conn.cursor()

    # Drop old table if exists
    cursor.execute("DROP TABLE IF EXISTS interviews")
    cursor.execute("DROP TABLE IF EXISTS interviews_old")

    # Create new table
    cursor.execute(CREATE_TABLE_SQL)
    for idx_sql in CREATE_INDEXES_SQL:
        cursor.execute(idx_sql)

    conn.commit()
    print(f"Table 'interviews' created at {db_path}")

    # Import data from JSON files
    total_imported = 0
    total_skipped = 0
    duplicate_keys: dict[tuple[str, str], list[str]] = defaultdict(list)

    for category in VALID_CATEGORIES:
        category_dir = source_dir / category
        if not category_dir.is_dir():
            continue

        json_files = sorted(category_dir.glob("*.json"))
        if not json_files:
            print(f"  [{category}] imported=0")
            continue

        dir_skipped = 0
        dir_imported = 0

        for json_file in json_files:
            try:
                with open(json_file, encoding="utf-8") as f:
                    data = json.load(f)
            except Exception as e:
                print(f"  SKIP (parse error): {json_file.name} — {e}")
                total_skipped += 1
                dir_skipped += 1
                continue

            record_category = data.get("category", "")
            if record_category not in VALID_CATEGORY_SET:
                dir_skipped += 1
                total_skipped += 1
                continue

            source = (data.get("source") or "").strip()
            source_id = str(data.get("source_id") or "").strip()
            if not source or not source_id:
                print(f"  SKIP (missing source/source_id): {json_file.name}")
                total_skipped += 1
                dir_skipped += 1
                continue

            duplicate_key = (source, source_id)
            duplicate_keys[duplicate_key].append(json_file.name)
            if len(duplicate_keys[duplicate_key]) > 1:
                print(
                    "  SKIP (duplicate source/source_id): "
                    f"{json_file.name} — duplicates {duplicate_key[0]}:{duplicate_key[1]}"
                )
                total_skipped += 1
                dir_skipped += 1
                continue

            cursor.execute(
                """
                INSERT INTO interviews
                    (title, content, publish_time, category, source, source_id,
                     company, department, stage, result, interview_type)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    data.get("title", ""),
                    data.get("content", ""),
                    data.get("publish_time", ""),
                    record_category,
                    source,
                    source_id,
                    data.get("company"),
                    data.get("department"),
                    data.get("stage"),
                    data.get("result") or "null",
                    data.get("interview_type"),
                ),
            )
            dir_imported += 1
            total_imported += 1

        if dir_skipped > 0:
            print(f"  [{category}] imported={dir_imported}, skipped={dir_skipped}")
        else:
            print(f"  [{category}] imported={dir_imported}")

    conn.commit()
    conn.close()

    repeated_keys = {key: files for key, files in duplicate_keys.items() if len(files) > 1}
    if repeated_keys:
        print(f"\nDetected duplicate source assets: {len(repeated_keys)} key(s)")
        for (source, source_id), files in sorted(repeated_keys.items())[:20]:
            print(f"  - {source}:{source_id} -> {', '.join(files)}")
        if len(repeated_keys) > 20:
            print(f"  ... and {len(repeated_keys) - 20} more duplicate key(s)")

    print(f"\nDone. Total imported: {total_imported}, skipped: {total_skipped}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Rebuild interviews.db from JSON source files"
    )
    parser.add_argument(
        "--db-path",
        default="data/interviews.db",
        help="Path to SQLite database (default: data/interviews.db)",
    )
    parser.add_argument(
        "--source-dir",
        required=True,
        help="Path to interview JSON root directory (contains category subdirectories)",
    )
    args = parser.parse_args()

    backend_root = Path(__file__).resolve().parents[1]

    db_path = Path(args.db_path)
    if not db_path.is_absolute():
        db_path = backend_root / db_path

    source_dir = Path(args.source_dir)
    if not source_dir.is_absolute():
        source_dir = backend_root / source_dir

    if not source_dir.exists() or not source_dir.is_dir():
        raise FileNotFoundError(f"Source directory not found: {source_dir}")

    rebuild_db(db_path, source_dir)


if __name__ == "__main__":
    main()
