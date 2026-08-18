"""Administrative API for previewing and importing league CSV files."""

from __future__ import annotations

import json
import re
import secrets
import shutil
import sqlite3
import time
import unicodedata
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

import pandas as pd
from flask import Flask, jsonify, request
from werkzeug.exceptions import HTTPException

from config import Config


BASE_DIR = Path(__file__).resolve().parent
DATABASE_PATH = Path(Config.DATABASE)
if not DATABASE_PATH.is_absolute():
    DATABASE_PATH = (BASE_DIR / DATABASE_PATH).resolve()

UPLOAD_ROOT = Path(Config.ADMIN_UPLOAD_DIR)
if not UPLOAD_ROOT.is_absolute():
    UPLOAD_ROOT = (BASE_DIR / UPLOAD_ROOT).resolve()

BACKUP_ROOT = Path(Config.DB_BACKUP_DIR)
if not BACKUP_ROOT.is_absolute():
    BACKUP_ROOT = (BASE_DIR / BACKUP_ROOT).resolve()
PREVIEW_TTL_SECONDS = 60 * 60
MIN_PLAYER_ID = 2
MAX_SQLITE_INTEGER = 2**63 - 1
INVALID_TEXT_CATEGORIES = {"Cc", "Cf", "Cs"}

REQUIRED_MATCH_COLUMNS = [
    "帮会名",
    "玩家",
    "等级",
    "职业",
    "所在团长",
    "击败",
    "助攻",
    "战备资源",
    "对玩家伤害",
    "对建筑伤害",
    "治疗值",
    "承受伤害",
    "重伤",
    "青灯焚骨",
    "化羽",
    "控制",
]

REQUIRED_PERSONAL_COLUMNS = ["名称", "装评", "修为", "修炼", "总战力"]

MATCH_STAT_COLUMNS = [
    "等级",
    "击败",
    "助攻",
    "战备资源",
    "对玩家伤害",
    "对建筑伤害",
    "治疗值",
    "承受伤害",
    "重伤",
    "青灯焚骨",
    "化羽",
    "控制",
]


class ImportValidationError(ValueError):
    """An import error that is safe to show to an administrator."""


class DatabaseBackupError(RuntimeError):
    """Raised when the pre-import database backup cannot be created."""


@dataclass
class PromptItem:
    nickname: str
    reason: str
    existing_id: int | None = None
    last_time: str | None = None
    days_diff: int | None = None


app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024 * 1024


def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DATABASE_PATH, timeout=15)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 15000")
    return conn


def ensure_upload_root() -> None:
    UPLOAD_ROOT.mkdir(mode=0o700, parents=True, exist_ok=True)


def create_database_backup() -> Path:
    timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    backup_path = BACKUP_ROOT / f"{timestamp}.db"
    temp_path = BACKUP_ROOT / f".{timestamp}-{secrets.token_hex(8)}.tmp"
    source_conn: sqlite3.Connection | None = None
    backup_conn: sqlite3.Connection | None = None

    try:
        BACKUP_ROOT.mkdir(mode=0o700, parents=True, exist_ok=True)
        if backup_path.exists():
            raise DatabaseBackupError("同一时间戳的数据库备份已经存在")

        temp_path.touch(mode=0o600, exist_ok=False)
        source_conn = sqlite3.connect(DATABASE_PATH, timeout=15)
        source_conn.execute("PRAGMA query_only = ON")
        backup_conn = sqlite3.connect(temp_path)
        source_conn.backup(backup_conn)
        backup_conn.close()
        backup_conn = None
        source_conn.close()
        source_conn = None
        temp_path.replace(backup_path)
        return backup_path
    except DatabaseBackupError:
        raise
    except Exception as exc:
        raise DatabaseBackupError("无法创建导入前数据库备份") from exc
    finally:
        if backup_conn is not None:
            backup_conn.close()
        if source_conn is not None:
            source_conn.close()
        if temp_path.exists():
            temp_path.unlink()


def cleanup_expired_previews() -> None:
    ensure_upload_root()
    cutoff = time.time() - PREVIEW_TTL_SECONDS
    for child in UPLOAD_ROOT.iterdir():
        if not child.is_dir():
            continue
        try:
            if child.stat().st_mtime < cutoff:
                shutil.rmtree(child)
        except FileNotFoundError:
            continue


def require_columns(df: pd.DataFrame, columns: list[str], label: str) -> None:
    missing = [column for column in columns if column not in df.columns]
    if missing:
        raise ImportValidationError(f"{label}缺少列：{', '.join(missing)}")


def read_csv(path: Path, label: str) -> pd.DataFrame:
    try:
        return pd.read_csv(path, dtype=str, keep_default_na=False)
    except Exception as exc:
        raise ImportValidationError(f"无法读取{label}：{exc}") from exc


def clean_match_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    cleaned = df.dropna(how="all").copy()
    cleaned = cleaned[
        ~cleaned.apply(
            lambda row: all(not str(value).strip() for value in row.tolist()), axis=1
        )
    ]
    cleaned = cleaned[cleaned["帮会名"].astype(str).str.strip() != "帮会名"]
    cleaned = cleaned[cleaned["帮会名"].astype(str).str.strip() != ""]

    for column in ["帮会名", "玩家", "职业", "所在团长"]:
        cleaned[column] = cleaned[column].astype(str).str.strip()

    if cleaned.empty:
        raise ImportValidationError("联赛数据文件没有有效战绩行")
    return cleaned


def validate_import_text(value: Any, field_name: str, max_length: int) -> None:
    text = str(value).strip()
    if not text:
        raise ImportValidationError(f"{field_name}不能为空")
    if len(text) > max_length:
        raise ImportValidationError(f"{field_name}不能超过 {max_length} 个字符")
    if any(
        char in "<>" or unicodedata.category(char) in INVALID_TEXT_CATEGORIES
        for char in text
    ):
        raise ImportValidationError(
            f"{field_name}包含非法字符，不允许使用尖括号、控制字符或不可见格式字符"
        )


def parse_required_int(value: Any, field_name: str) -> int:
    text = str(value).strip()
    try:
        return int(text)
    except (TypeError, ValueError) as exc:
        raise ImportValidationError(f"{field_name}不是合法整数") from exc


def parse_optional_int(value: Any, field_name: str) -> int:
    text = str(value or "").strip()
    if not text or text.lower() == "nan":
        return 0
    return parse_required_int(text, field_name)


def extract_match_time(filename: str) -> datetime:
    match = re.search(r"(\d{4}_\d{2}_\d{2}_\d{2}_\d{2}_\d{2})", filename)
    if not match:
        raise ImportValidationError("联赛 CSV 文件名中未找到 YYYY_MM_DD_HH_MM_SS 时间戳")
    try:
        return datetime.strptime(match.group(1), "%Y_%m_%d_%H_%M_%S")
    except ValueError as exc:
        raise ImportValidationError("联赛 CSV 文件名中的时间戳无效") from exc


def prepare_import(
    match_path: Path,
    personal_path: Path,
    original_filename: str,
    target_guild: str,
) -> dict[str, Any]:
    match_df = read_csv(match_path, "联赛数据文件")
    require_columns(match_df, REQUIRED_MATCH_COLUMNS, "联赛数据文件")
    match_df = clean_match_dataframe(match_df)

    validate_import_text(target_guild, "本帮帮会名", 100)
    for row_index, row in match_df.iterrows():
        line_number = int(row_index) + 2
        validate_import_text(row["帮会名"], f"联赛数据第 {line_number} 行的帮会名", 100)
        validate_import_text(row["玩家"], f"联赛数据第 {line_number} 行的玩家昵称", 64)
        validate_import_text(row["职业"], f"联赛数据第 {line_number} 行的职业", 50)
        validate_import_text(
            row["所在团长"], f"联赛数据第 {line_number} 行的团长昵称", 64
        )

    personal_df = read_csv(personal_path, "帮会成员文件")
    require_columns(personal_df, REQUIRED_PERSONAL_COLUMNS, "帮会成员文件")
    for column in REQUIRED_PERSONAL_COLUMNS:
        personal_df[column] = personal_df[column].astype(str).str.strip()

    guild_names = list(dict.fromkeys(match_df["帮会名"].tolist()))
    if target_guild not in guild_names:
        raise ImportValidationError(
            f"联赛数据中未找到本帮“{target_guild}”，实际帮会：{', '.join(guild_names)}"
        )

    opponents = [guild for guild in guild_names if guild != target_guild]
    if len(opponents) != 1:
        raise ImportValidationError(
            f"无法唯一识别对方帮会，识别到：{', '.join(opponents) or '无'}"
        )

    opponent_guild = opponents[0]
    home_rows = match_df[match_df["帮会名"] == target_guild].copy()
    opponent_rows = match_df[match_df["帮会名"] == opponent_guild].copy()
    if home_rows.empty or opponent_rows.empty:
        raise ImportValidationError("联赛数据必须同时包含本帮和对方战绩")

    match_time = extract_match_time(Path(original_filename).name)
    timestamp = match_time.strftime("%Y_%m_%d_%H_%M_%S")
    match_name = f"{target_guild}vs{opponent_guild}_{timestamp}.csv"

    for _, row in match_df.iterrows():
        nickname = row["玩家"]
        for column in MATCH_STAT_COLUMNS:
            parse_required_int(row[column], f"{nickname}的{column}")

    extra_map: dict[str, dict[str, str]] = {}
    for row_index, row in personal_df.iterrows():
        nickname = row["名称"]
        if not nickname:
            continue
        line_number = int(row_index) + 2
        validate_import_text(
            nickname, f"帮会成员数据第 {line_number} 行的玩家昵称", 64
        )
        for column in REQUIRED_PERSONAL_COLUMNS[1:]:
            parse_optional_int(row[column], f"{nickname}的{column}")
        extra_map[nickname] = row.to_dict()

    return {
        "match_df": match_df,
        "home_rows": home_rows,
        "opponent_rows": opponent_rows,
        "extra_map": extra_map,
        "match_time": match_time,
        "match_name": match_name,
        "opponent_guild": opponent_guild,
    }


def find_active_player_id(
    cursor: sqlite3.Cursor, nickname: str, match_time: datetime
) -> int | None:
    row = cursor.execute(
        """
        SELECT player_id
          FROM nickname_history
         WHERE nickname = ?
           AND valid_from <= ?
           AND (valid_to IS NULL OR valid_to > ?)
         ORDER BY valid_from DESC
         LIMIT 1
        """,
        (nickname, match_time, match_time),
    ).fetchone()
    return int(row[0]) if row else None


def get_last_match_time(cursor: sqlite3.Cursor, player_id: int) -> datetime | None:
    row = cursor.execute(
        """
        SELECT MAX(m.match_time)
          FROM match_performance mp
          JOIN matches m ON m.match_id = mp.match_id
         WHERE mp.player_id = ?
        """,
        (player_id,),
    ).fetchone()
    return datetime.fromisoformat(row[0]) if row and row[0] else None


def collect_prompts(
    cursor: sqlite3.Cursor, nicknames: list[str], match_time: datetime
) -> list[PromptItem]:
    prompts: list[PromptItem] = []
    for nickname in nicknames:
        existing_id = find_active_player_id(cursor, nickname, match_time)
        if existing_id is None:
            prompts.append(PromptItem(nickname=nickname, reason="not_found"))
            continue

        last_time = get_last_match_time(cursor, existing_id)
        if last_time is None:
            if nickname == "无":
                continue
            raise ImportValidationError(
                f"数据异常：昵称“{nickname}”对应 player_id={existing_id}，但没有历史战绩"
            )

        days_diff = (match_time - last_time).days
        if days_diff > 29:
            prompts.append(
                PromptItem(
                    nickname=nickname,
                    reason="inactive",
                    existing_id=existing_id,
                    last_time=last_time.isoformat(sep=" "),
                    days_diff=days_diff,
                )
            )
    return prompts


def get_database_revision(cursor: sqlite3.Cursor) -> dict[str, int | str | None]:
    row = cursor.execute(
        """
        SELECT COUNT(*) AS match_count,
               MAX(match_id) AS latest_match_id,
               MAX(match_time) AS latest_match_time
          FROM matches
        """
    ).fetchone()
    return {
        "match_count": int(row["match_count"]),
        "latest_match_id": (
            int(row["latest_match_id"]) if row["latest_match_id"] is not None else None
        ),
        "latest_match_time": (
            str(row["latest_match_time"])
            if row["latest_match_time"] is not None
            else None
        ),
    }


def validate_database_state(
    cursor: sqlite3.Cursor, prepared: dict[str, Any], target_guild: str
) -> tuple[int, dict[str, int], list[PromptItem]]:
    if cursor.execute(
        "SELECT 1 FROM matches WHERE match_name = ?", (prepared["match_name"],)
    ).fetchone():
        raise ImportValidationError(f"比赛“{prepared['match_name']}”已经导入")

    latest_match_row = cursor.execute(
        "SELECT MAX(match_time) AS latest_match_time FROM matches"
    ).fetchone()
    latest_match_value = (
        latest_match_row["latest_match_time"] if latest_match_row else None
    )
    if latest_match_value:
        try:
            latest_match_time = datetime.fromisoformat(latest_match_value)
        except (TypeError, ValueError) as exc:
            raise ImportValidationError("数据库中的最新比赛时间格式无效") from exc

        if prepared["match_time"] <= latest_match_time:
            raise ImportValidationError(
                "只能按时间顺序导入更新的比赛："
                f"本次比赛时间为 {prepared['match_time'].isoformat(sep=' ')}，"
                f"数据库最新比赛时间为 {latest_match_time.isoformat(sep=' ')}"
            )

    guild_row = cursor.execute(
        "SELECT guild_id FROM guilds WHERE guild_name = ?", (target_guild,)
    ).fetchone()
    if not guild_row:
        raise ImportValidationError(f"数据库中不存在本帮“{target_guild}”")

    profession_map = {
        row["profession_name"]: row["profession_id"]
        for row in cursor.execute(
            "SELECT profession_id, profession_name FROM professions"
        ).fetchall()
    }
    unknown_professions = sorted(
        set(prepared["match_df"]["职业"].tolist()) - set(profession_map)
    )
    if unknown_professions:
        raise ImportValidationError(f"数据库中不存在职业：{', '.join(unknown_professions)}")

    nicknames = list(
        dict.fromkeys(
            prepared["home_rows"]["玩家"].tolist()
            + prepared["home_rows"]["所在团长"].tolist()
        )
    )
    prompts = collect_prompts(cursor, nicknames, prepared["match_time"])
    return int(guild_row[0]), profession_map, prompts


def write_metadata(stage_dir: Path, metadata: dict[str, Any]) -> None:
    temp_path = stage_dir / "metadata.tmp"
    temp_path.write_text(json.dumps(metadata, ensure_ascii=False), encoding="utf-8")
    temp_path.replace(stage_dir / "metadata.json")


def load_stage(token: str) -> tuple[Path, dict[str, Any]]:
    if not re.fullmatch(r"[A-Za-z0-9_-]{30,100}", token):
        raise ImportValidationError("无效的预检令牌")
    stage_dir = UPLOAD_ROOT / token
    metadata_path = stage_dir / "metadata.json"
    if not metadata_path.is_file():
        raise ImportValidationError("预检记录不存在或已经过期，请重新上传")
    if time.time() - metadata_path.stat().st_mtime > PREVIEW_TTL_SECONDS:
        shutil.rmtree(stage_dir, ignore_errors=True)
        raise ImportValidationError("预检记录已经过期，请重新上传")
    return stage_dir, json.loads(metadata_path.read_text(encoding="utf-8"))


def apply_nickname_update(
    cursor: sqlite3.Cursor,
    old_player_id: int | None,
    new_player_id: int,
    nickname: str,
    match_time: datetime,
) -> None:
    if old_player_id is not None and old_player_id != new_player_id:
        cursor.execute(
            "UPDATE nickname_history SET valid_to = ? "
            "WHERE player_id = ? AND valid_to IS NULL",
            (match_time, old_player_id),
        )

    exists = cursor.execute(
        "SELECT 1 FROM players WHERE player_id = ?", (new_player_id,)
    ).fetchone()
    if exists:
        cursor.execute(
            "UPDATE nickname_history SET valid_to = ? "
            "WHERE player_id = ? AND valid_to IS NULL",
            (match_time, new_player_id),
        )
    else:
        cursor.execute(
            "INSERT INTO players(player_id, created_at) VALUES (?, ?)",
            (new_player_id, match_time),
        )

    cursor.execute(
        "INSERT INTO nickname_history(player_id, nickname, valid_from) VALUES (?, ?, ?)",
        (new_player_id, nickname, match_time),
    )


def resolve_player_id(
    cursor: sqlite3.Cursor,
    nickname: str,
    match_time: datetime,
    prompt_map: dict[str, PromptItem],
    resolutions: dict[str, int],
    cache: dict[str, int],
) -> int:
    if nickname in cache:
        return cache[nickname]

    existing_id = find_active_player_id(cursor, nickname, match_time)
    prompt = prompt_map.get(nickname)
    if prompt is None:
        if existing_id is None:
            raise ImportValidationError(f"昵称“{nickname}”当前没有可用的玩家 ID")
        cache[nickname] = existing_id
        return existing_id

    new_player_id = resolutions[nickname]
    if prompt.reason == "inactive" and new_player_id == existing_id:
        cache[nickname] = existing_id
        return existing_id

    apply_nickname_update(cursor, existing_id, new_player_id, nickname, match_time)
    cache[nickname] = new_player_id
    return new_player_id


def parse_resolutions(payload: Any, prompts: list[PromptItem]) -> dict[str, int]:
    raw = payload.get("player_ids") if isinstance(payload, dict) else None
    if not isinstance(raw, dict):
        raw = {}

    resolutions: dict[str, int] = {}
    for prompt in prompts:
        value = raw.get(prompt.nickname)
        if not isinstance(value, str):
            raise ImportValidationError(f"“{prompt.nickname}”的玩家 ID 必须以字符串提交")

        normalized = value.strip()
        if not normalized or not normalized.isascii() or not normalized.isdigit():
            raise ImportValidationError(f"“{prompt.nickname}”的玩家 ID 必须是纯数字")

        player_id = int(normalized)
        if not MIN_PLAYER_ID <= player_id <= MAX_SQLITE_INTEGER:
            raise ImportValidationError(
                f"“{prompt.nickname}”的玩家 ID 必须在 "
                f"{MIN_PLAYER_ID} 到 {MAX_SQLITE_INTEGER} 之间"
            )
        resolutions[prompt.nickname] = player_id
    return resolutions


def serialize_prompt(prompt: PromptItem) -> dict[str, Any]:
    data = asdict(prompt)
    if prompt.existing_id is not None:
        data["existing_id"] = str(prompt.existing_id)
    return data


def insert_import(
    cursor: sqlite3.Cursor,
    prepared: dict[str, Any],
    target_guild: str,
    outcome: str,
    note: str,
    guild_id: int,
    profession_map: dict[str, int],
    prompts: list[PromptItem],
    resolutions: dict[str, int],
) -> tuple[int, int, int]:
    opponent_row = cursor.execute(
        "SELECT guild_id FROM guilds WHERE guild_name = ?",
        (prepared["opponent_guild"],),
    ).fetchone()
    if opponent_row:
        opponent_guild_id = int(opponent_row[0])
    else:
        max_id = cursor.execute("SELECT MAX(guild_id) FROM guilds").fetchone()[0] or 0
        opponent_guild_id = int(max_id) + 1
        cursor.execute(
            "INSERT INTO guilds(guild_id, guild_name) VALUES (?, ?)",
            (opponent_guild_id, prepared["opponent_guild"]),
        )

    cursor.execute(
        "INSERT INTO matches(match_name, match_time) VALUES (?, ?)",
        (prepared["match_name"], prepared["match_time"]),
    )
    match_id = int(cursor.lastrowid)
    cursor.execute(
        """
        INSERT INTO match_results(
            match_id, home_guild_id, away_guild_id, home_outcome, note
        ) VALUES (?, ?, ?, ?, ?)
        """,
        (match_id, guild_id, opponent_guild_id, outcome, note or None),
    )

    prompt_map = {prompt.nickname: prompt for prompt in prompts}
    resolved_cache: dict[str, int] = {}
    home_count = 0
    opponent_count = 0

    for _, row in prepared["home_rows"].iterrows():
        nickname = row["玩家"]
        player_id = resolve_player_id(
            cursor,
            nickname,
            prepared["match_time"],
            prompt_map,
            resolutions,
            resolved_cache,
        )
        leader_id = resolve_player_id(
            cursor,
            row["所在团长"],
            prepared["match_time"],
            prompt_map,
            resolutions,
            resolved_cache,
        )
        stats = prepared["extra_map"].get(nickname, {})
        cursor.execute(
            """
            INSERT INTO match_performance(
                match_id, player_id, guild_id, level, profession_id, leader_id,
                kills, assists, war_resources, damage_to_players,
                damage_to_structures, healing_amount, damage_taken,
                serious_injuries, skill_qingdeng, skill_huayu, control_count,
                recorded_nick, equipment_score, skill_score,
                cultivation_score, total_combat_power
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """,
            (
                match_id,
                player_id,
                guild_id,
                parse_required_int(row["等级"], f"{nickname}的等级"),
                profession_map[row["职业"]],
                leader_id,
                parse_required_int(row["击败"], f"{nickname}的击败"),
                parse_required_int(row["助攻"], f"{nickname}的助攻"),
                parse_required_int(row["战备资源"], f"{nickname}的战备资源"),
                parse_required_int(row["对玩家伤害"], f"{nickname}的对玩家伤害"),
                parse_required_int(row["对建筑伤害"], f"{nickname}的对建筑伤害"),
                parse_required_int(row["治疗值"], f"{nickname}的治疗值"),
                parse_required_int(row["承受伤害"], f"{nickname}的承受伤害"),
                parse_required_int(row["重伤"], f"{nickname}的重伤"),
                parse_required_int(row["青灯焚骨"], f"{nickname}的青灯焚骨"),
                parse_required_int(row["化羽"], f"{nickname}的化羽"),
                parse_required_int(row["控制"], f"{nickname}的控制"),
                nickname,
                parse_optional_int(stats.get("装评", 0), f"{nickname}的装评"),
                parse_optional_int(stats.get("修为", 0), f"{nickname}的修为"),
                parse_optional_int(stats.get("修炼", 0), f"{nickname}的修炼"),
                parse_optional_int(stats.get("总战力", 0), f"{nickname}的总战力"),
            ),
        )
        home_count += 1

    for _, row in prepared["opponent_rows"].iterrows():
        nickname = row["玩家"]
        cursor.execute(
            """
            INSERT INTO opponent_match_performance(
                match_id, guild_id, recorded_nick, level, profession_id,
                leader_nick, kills, assists, war_resources, damage_to_players,
                damage_to_structures, healing_amount, damage_taken,
                serious_injuries, skill_qingdeng, skill_huayu, control_count
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """,
            (
                match_id,
                opponent_guild_id,
                nickname,
                parse_required_int(row["等级"], f"{nickname}的等级"),
                profession_map[row["职业"]],
                row["所在团长"],
                parse_required_int(row["击败"], f"{nickname}的击败"),
                parse_required_int(row["助攻"], f"{nickname}的助攻"),
                parse_required_int(row["战备资源"], f"{nickname}的战备资源"),
                parse_required_int(row["对玩家伤害"], f"{nickname}的对玩家伤害"),
                parse_required_int(row["对建筑伤害"], f"{nickname}的对建筑伤害"),
                parse_required_int(row["治疗值"], f"{nickname}的治疗值"),
                parse_required_int(row["承受伤害"], f"{nickname}的承受伤害"),
                parse_required_int(row["重伤"], f"{nickname}的重伤"),
                parse_required_int(row["青灯焚骨"], f"{nickname}的青灯焚骨"),
                parse_required_int(row["化羽"], f"{nickname}的化羽"),
                parse_required_int(row["控制"], f"{nickname}的控制"),
            ),
        )
        opponent_count += 1

    return match_id, home_count, opponent_count


@app.errorhandler(ImportValidationError)
def handle_validation_error(error: ImportValidationError):
    return jsonify({"error": str(error)}), 400


@app.errorhandler(DatabaseBackupError)
def handle_backup_error(error: DatabaseBackupError):
    app.logger.exception("Database backup failed", exc_info=error)
    return jsonify({"error": "数据库备份失败，导入已经取消，请检查服务日志"}), 500


@app.errorhandler(413)
def handle_too_large(_error):
    return jsonify({"error": "上传文件过大，单次请求不能超过 16MB"}), 413


@app.errorhandler(sqlite3.IntegrityError)
def handle_integrity_error(error: sqlite3.IntegrityError):
    app.logger.warning("Import integrity error: %s", error)
    return jsonify({"error": "数据违反唯一性或关联约束，请检查玩家 ID 和比赛记录"}), 409


@app.errorhandler(sqlite3.OperationalError)
def handle_operational_error(error: sqlite3.OperationalError):
    app.logger.exception("Import database error")
    if "locked" in str(error).lower():
        return jsonify({"error": "数据库正在执行其他写入，请稍后重试"}), 409
    return jsonify({"error": "数据库操作失败"}), 500


@app.errorhandler(Exception)
def handle_unexpected_error(error: Exception):
    if isinstance(error, HTTPException):
        return error
    app.logger.exception("Unexpected admin API error")
    return jsonify({"error": "服务器内部错误，请查看管理服务日志"}), 500


@app.get("/admin-api/health")
def health():
    return jsonify({"status": "ok"})


@app.post("/admin-api/import/preview")
def preview_import():
    cleanup_expired_previews()
    target_guild = request.form.get("target_guild", "").strip()
    match_file = request.files.get("match_file")
    personal_file = request.files.get("personal_file")

    if not target_guild:
        raise ImportValidationError("本帮帮会名不能为空")
    if not match_file or not match_file.filename:
        raise ImportValidationError("请选择联赛数据 CSV")
    if not personal_file or not personal_file.filename:
        raise ImportValidationError("请选择帮会成员 CSV")
    if not match_file.filename.lower().endswith(".csv"):
        raise ImportValidationError("联赛数据文件必须是 CSV")
    if not personal_file.filename.lower().endswith(".csv"):
        raise ImportValidationError("帮会成员文件必须是 CSV")

    token = secrets.token_urlsafe(32)
    stage_dir = UPLOAD_ROOT / token
    stage_dir.mkdir(mode=0o700, parents=True)
    match_path = stage_dir / "match.csv"
    personal_path = stage_dir / "personal.csv"

    try:
        match_file.save(match_path)
        personal_file.save(personal_path)
        prepared = prepare_import(
            match_path,
            personal_path,
            match_file.filename,
            target_guild,
        )
        conn = get_db()
        try:
            conn.execute("BEGIN")
            cursor = conn.cursor()
            database_revision = get_database_revision(cursor)
            _, _, prompts = validate_database_state(cursor, prepared, target_guild)
        finally:
            conn.close()

        metadata = {
            "created_at": datetime.now().isoformat(),
            "original_filename": Path(match_file.filename).name,
            "target_guild": target_guild,
            "match_name": prepared["match_name"],
            "database_revision": database_revision,
        }
        write_metadata(stage_dir, metadata)
    except Exception:
        shutil.rmtree(stage_dir, ignore_errors=True)
        raise

    return jsonify(
        {
            "token": token,
            "expires_in": PREVIEW_TTL_SECONDS,
            "match_name": prepared["match_name"],
            "match_time": prepared["match_time"].isoformat(sep=" "),
            "home_guild": target_guild,
            "opponent_guild": prepared["opponent_guild"],
            "home_count": len(prepared["home_rows"]),
            "opponent_count": len(prepared["opponent_rows"]),
            "prompt_items": [serialize_prompt(prompt) for prompt in prompts],
        }
    )


@app.post("/admin-api/import/commit")
def commit_import():
    cleanup_expired_previews()
    payload = request.get_json(silent=True) or {}
    token = str(payload.get("token", ""))
    outcome = str(payload.get("home_outcome", "")).strip()
    note_value = payload.get("note", "")
    if outcome not in {"win", "lose"}:
        raise ImportValidationError("请选择本帮胜负")
    if not isinstance(note_value, str):
        raise ImportValidationError("备注必须是文本")
    note = note_value.strip()

    stage_dir, metadata = load_stage(token)
    prepared = prepare_import(
        stage_dir / "match.csv",
        stage_dir / "personal.csv",
        metadata["original_filename"],
        metadata["target_guild"],
    )
    if prepared["match_name"] != metadata["match_name"]:
        raise ImportValidationError("预检文件状态不一致，请重新上传")

    conn = get_db()
    try:
        conn.execute("BEGIN IMMEDIATE")
        cursor = conn.cursor()
        preview_revision = metadata.get("database_revision")
        if not isinstance(preview_revision, dict):
            raise ImportValidationError("预检版本已经失效，请重新上传并预检")
        if get_database_revision(cursor) != preview_revision:
            raise ImportValidationError("预检后数据库已经发生变化，请重新上传并预检")

        guild_id, profession_map, prompts = validate_database_state(
            cursor, prepared, metadata["target_guild"]
        )
        resolutions = parse_resolutions(payload, prompts)
        create_database_backup()
        match_id, home_count, opponent_count = insert_import(
            cursor,
            prepared,
            metadata["target_guild"],
            outcome,
            note,
            guild_id,
            profession_map,
            prompts,
            resolutions,
        )
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

    shutil.rmtree(stage_dir, ignore_errors=True)
    return jsonify(
        {
            "match_id": match_id,
            "match_name": prepared["match_name"],
            "home_count": home_count,
            "opponent_count": opponent_count,
        }
    )


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=10291)
