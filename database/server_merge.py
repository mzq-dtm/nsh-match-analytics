"""Close active nickname mappings at a server-merge boundary."""

import sqlite3
import sys
from datetime import datetime
from pathlib import Path

from config import Config


DATE_FORMAT = "%Y-%m-%d"
NO_LEADER_PLAYER_ID = 0


def parse_merge_time(value: str) -> datetime:
    """Parse a calendar date and use noon as the merge boundary."""
    try:
        merge_date = datetime.strptime(value.strip(), DATE_FORMAT)
    except ValueError as exc:
        raise ValueError("合服日期必须使用 YYYY-MM-DD 格式，例如 2026-08-31") from exc
    return merge_date.replace(hour=12)


def resolve_database_path() -> Path:
    database_path = Path(Config.DATABASE)
    if not database_path.is_absolute():
        database_path = Path(__file__).resolve().parent / database_path
    return database_path.resolve()


def close_active_nicknames(database_path: Path, merge_time: datetime) -> int:
    """Close every active non-sentinel nickname at ``merge_time``."""
    if not database_path.is_file():
        raise FileNotFoundError(f"数据库文件不存在：{database_path}")

    merge_time_text = merge_time.isoformat(sep=" ")
    conn = sqlite3.connect(database_path, timeout=15)
    try:
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA busy_timeout = 15000")
        conn.execute("BEGIN IMMEDIATE")

        latest_match = conn.execute(
            "SELECT MAX(match_time) AS latest_match_time FROM matches"
        ).fetchone()["latest_match_time"]
        if latest_match is not None:
            try:
                latest_match_time = datetime.fromisoformat(str(latest_match))
            except ValueError as exc:
                raise ValueError("数据库中的最新比赛时间格式无效") from exc
            if latest_match_time >= merge_time:
                raise ValueError(
                    "合服时间必须晚于数据库最新比赛时间："
                    f"{latest_match_time.isoformat(sep=' ')}"
                )

        invalid_count = conn.execute(
            """
            SELECT COUNT(*) AS count
              FROM nickname_history
             WHERE valid_to IS NULL
               AND player_id <> ?
               AND valid_from >= ?
            """,
            (NO_LEADER_PLAYER_ID, merge_time_text),
        ).fetchone()["count"]
        if invalid_count:
            raise ValueError(
                f"有 {invalid_count} 条开放昵称的生效时间不早于合服时间，已取消处理"
            )

        cursor = conn.execute(
            """
            UPDATE nickname_history
               SET valid_to = ?
             WHERE valid_to IS NULL
               AND player_id <> ?
            """,
            (merge_time_text, NO_LEADER_PLAYER_ID),
        )
        affected_rows = cursor.rowcount
        conn.commit()
        return affected_rows
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def main() -> int:
    raw_date = input("请输入合服日期（YYYY-MM-DD）：").strip()
    try:
        merge_time = parse_merge_time(raw_date)
        affected_rows = close_active_nicknames(resolve_database_path(), merge_time)
    except (FileNotFoundError, sqlite3.Error, ValueError) as exc:
        print(f"合服处理失败：{exc}")
        return 1

    print(
        f"合服处理完成：已将 {affected_rows} 条开放昵称的有效期设置为 "
        f"{merge_time.isoformat(sep=' ')}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
