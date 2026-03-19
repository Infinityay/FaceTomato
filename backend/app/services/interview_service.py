"""Interview data service using SQLite database."""

import sqlite3
from pathlib import Path
from typing import Literal, Optional

from app.core.config import get_settings
from app.schemas.interview import Category, InterviewData, InterviewResult, InterviewType

OLD_SEARCH_REC_CATEGORY = "搜广推推荐算法"
NEW_SEARCH_REC_CATEGORY = Category.SEARCH_REC.value


def normalize_category_value(value: str | None) -> str:
    """Normalize legacy category values to the current enum value."""
    if value == OLD_SEARCH_REC_CATEGORY:
        return NEW_SEARCH_REC_CATEGORY
    return value or ""


def expand_category_filter_values(categories: list[Category]) -> list[str]:
    """Expand category filters to include legacy aliases when needed."""
    values: list[str] = []
    for category in categories:
        values.append(category.value)
        if category == Category.SEARCH_REC:
            values.append(OLD_SEARCH_REC_CATEGORY)
    return values


def _resolve_db_path() -> Path:
    """Resolve database path from settings."""
    settings = get_settings()
    db_path = Path(settings.interview_db_path)
    if db_path.is_absolute():
        return db_path
    base_dir = Path(__file__).resolve().parents[2]
    return base_dir / db_path


def get_connection() -> sqlite3.Connection:
    """Get a read-only database connection."""
    db_path = _resolve_db_path()
    if not db_path.exists():
        raise FileNotFoundError(f"Interview DB not found: {db_path}")
    conn = sqlite3.connect(f"file:{db_path.as_posix()}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    return conn


def row_to_interview(row: sqlite3.Row) -> InterviewData:
    """Convert a database row to InterviewData model."""
    raw_result = row["result"] or "null"
    try:
        result = InterviewResult(raw_result)
    except ValueError:
        result = InterviewResult.NULL

    raw_interview_type = row["interview_type"]
    interview_type: Optional[InterviewType] = None
    if raw_interview_type:
        try:
            interview_type = InterviewType(raw_interview_type)
        except ValueError:
            interview_type = None

    return InterviewData(
        id=row["id"],
        title=row["title"],
        content=row["content"] or "",
        publish_time=row["publish_time"] or "",
        category=Category(normalize_category_value(row["category"])),
        source=row["source"] or "",
        source_id=row["source_id"] or "",
        company=row["company"],
        department=row["department"],
        stage=row["stage"],
        result=result,
        interview_type=interview_type,
    )


class DataService:
    """Service for querying interview data."""

    def __init__(self, conn: Optional[sqlite3.Connection] = None) -> None:
        # Allow injecting an in-memory connection for testing
        self._conn = conn

    def list_all_interviews(self) -> list[InterviewData]:
        """Return all interviews ordered by primary key."""
        conn = self._get_conn()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM interviews ORDER BY id ASC")
        rows = cursor.fetchall()
        self._close(conn)
        return [row_to_interview(row) for row in rows]

    def _get_conn(self) -> sqlite3.Connection:
        if self._conn is not None:
            return self._conn
        return get_connection()

    def _close(self, conn: sqlite3.Connection) -> None:
        # Don't close injected connections (used in tests)
        if self._conn is None:
            conn.close()

    def get_by_id(self, id: int) -> Optional[InterviewData]:
        """Get interview by integer primary key."""
        conn = self._get_conn()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM interviews WHERE id = ?", (id,))
        row = cursor.fetchone()
        self._close(conn)
        if not row:
            return None
        return row_to_interview(row)

    def filter_interviews(
        self,
        categories: list[Category] | None = None,
        results: list[str] | None = None,
        interview_types: list[str] | None = None,
        include_unknown_interview_type: bool = False,
        company: str | None = None,
        search: str | None = None,
        sort_order: Literal["asc", "desc"] = "desc",
        page: int | None = None,
        page_size: int | None = None,
    ) -> tuple[list[InterviewData], int]:
        """Filter and paginate interviews."""
        conn = self._get_conn()
        cursor = conn.cursor()

        where_clauses = ["1=1"]
        params: list = []

        if categories:
            category_values = expand_category_filter_values(categories)
            placeholders = ",".join("?" * len(category_values))
            where_clauses.append(f"category IN ({placeholders})")
            params.extend(category_values)

        if results:
            placeholders = ",".join("?" * len(results))
            where_clauses.append(f"result IN ({placeholders})")
            params.extend(results)

        if interview_types and include_unknown_interview_type:
            placeholders = ",".join("?" * len(interview_types))
            where_clauses.append(
                f"(interview_type IN ({placeholders}) OR interview_type IS NULL OR interview_type = '')"
            )
            params.extend(interview_types)
        elif interview_types:
            placeholders = ",".join("?" * len(interview_types))
            where_clauses.append(f"interview_type IN ({placeholders})")
            params.extend(interview_types)
        elif include_unknown_interview_type:
            where_clauses.append("(interview_type IS NULL OR interview_type = '')")

        if company:
            where_clauses.append("company LIKE ?")
            params.append(f"%{company}%")

        if search:
            where_clauses.append("(title LIKE ? OR content LIKE ? OR company LIKE ?)")
            search_pattern = f"%{search}%"
            params.extend([search_pattern] * 3)

        where_sql = " AND ".join(where_clauses)

        cursor.execute(f"SELECT COUNT(*) FROM interviews WHERE {where_sql}", params)
        total_count = cursor.fetchone()[0]

        order_dir = "DESC" if sort_order == "desc" else "ASC"
        query = f"SELECT * FROM interviews WHERE {where_sql} ORDER BY publish_time {order_dir}"

        if page is not None and page_size is not None:
            offset = (page - 1) * page_size
            query += f" LIMIT {page_size} OFFSET {offset}"

        cursor.execute(query, params)
        rows = cursor.fetchall()
        self._close(conn)

        return [row_to_interview(row) for row in rows], total_count

    def get_stats(self) -> dict:
        """Get statistics about interview data."""
        conn = self._get_conn()
        cursor = conn.cursor()

        cursor.execute(
            """
            SELECT
                COUNT(*) as total,
                SUM(CASE WHEN result = 'offer' THEN 1 ELSE 0 END) as offer_count,
                COUNT(DISTINCT company) as companies_count
            FROM interviews
            """
        )
        stats_row = cursor.fetchone()

        cursor.execute(
            """
            SELECT category, COUNT(*) as cnt
            FROM interviews
            GROUP BY category
            """
        )
        category_rows = cursor.fetchall()
        self._close(conn)

        categories: dict[str, int] = {}
        for row in category_rows:
            normalized = normalize_category_value(row["category"])
            categories[normalized] = categories.get(normalized, 0) + row["cnt"]

        return {
            "total": stats_row["total"] or 0,
            "offer_count": stats_row["offer_count"] or 0,
            "companies_count": stats_row["companies_count"] or 0,
            "categories": categories,
        }

    def get_companies(self) -> list[str]:
        """Get list of unique companies."""
        conn = self._get_conn()
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT DISTINCT company
            FROM interviews
            WHERE company IS NOT NULL AND company != ''
            ORDER BY company
            """
        )
        rows = cursor.fetchall()
        self._close(conn)
        return [r["company"] for r in rows]

    def get_neighbors(
        self,
        id: int,
        categories: list[Category] | None = None,
        results: list[str] | None = None,
        interview_types: list[str] | None = None,
        include_unknown_interview_type: bool = False,
        company: str | None = None,
        search: str | None = None,
    ) -> dict:
        """Get previous and next interviews for navigation (by publish_time order)."""
        conn = self._get_conn()
        cursor = conn.cursor()

        where_clauses: list[str] = ["1=1"]
        params: list = []

        if categories:
            category_values = expand_category_filter_values(categories)
            placeholders = ",".join("?" * len(category_values))
            where_clauses.append(f"category IN ({placeholders})")
            params.extend(category_values)

        if results:
            placeholders = ",".join("?" * len(results))
            where_clauses.append(f"result IN ({placeholders})")
            params.extend(results)

        if interview_types and include_unknown_interview_type:
            placeholders = ",".join("?" * len(interview_types))
            where_clauses.append(
                f"(interview_type IN ({placeholders}) OR interview_type IS NULL OR interview_type = '')"
            )
            params.extend(interview_types)
        elif interview_types:
            placeholders = ",".join("?" * len(interview_types))
            where_clauses.append(f"interview_type IN ({placeholders})")
            params.extend(interview_types)
        elif include_unknown_interview_type:
            where_clauses.append("(interview_type IS NULL OR interview_type = '')")

        if company:
            where_clauses.append("company LIKE ?")
            params.append(f"%{company}%")

        if search:
            where_clauses.append("(title LIKE ? OR content LIKE ? OR company LIKE ?)")
            search_pattern = f"%{search}%"
            params.extend([search_pattern] * 3)

        where_sql = " AND ".join(where_clauses)

        query = f"""
        WITH ranked AS (
            SELECT
                id,
                title,
                ROW_NUMBER() OVER (ORDER BY publish_time DESC) as rn
            FROM interviews
            WHERE {where_sql}
        ),
        current AS (
            SELECT rn FROM ranked WHERE id = ?
        )
        SELECT
            r.id,
            r.title,
            r.rn,
            (SELECT rn FROM current) as current_rn,
            (SELECT COUNT(*) FROM ranked) as total
        FROM ranked r
        WHERE r.rn BETWEEN (SELECT rn - 1 FROM current) AND (SELECT rn + 1 FROM current)
        ORDER BY r.rn
        """

        cursor.execute(query, params + [id])
        rows = cursor.fetchall()
        self._close(conn)

        if not rows:
            return {"prev": None, "next": None, "current_index": 0, "total": 0}

        prev_item = None
        next_item = None
        current_rn = rows[0]["current_rn"]
        total = rows[0]["total"]

        for row in rows:
            if row["rn"] == current_rn - 1:
                prev_item = {"id": row["id"], "title": row["title"]}
            elif row["rn"] == current_rn + 1:
                next_item = {"id": row["id"], "title": row["title"]}

        return {
            "prev": prev_item,
            "next": next_item,
            "current_index": current_rn,
            "total": total,
        }


_data_service: Optional[DataService] = None


def get_data_service() -> DataService:
    """Get the global data service instance."""
    global _data_service
    if _data_service is None:
        _data_service = DataService()
    return _data_service
