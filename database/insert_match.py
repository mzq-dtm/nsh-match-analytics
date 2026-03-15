#
# insert_match.py
# database
#
# Created by mzq on 2025/5/26
#
import os
import re
import sqlite3
from dataclasses import dataclass
from datetime import datetime
from typing import Dict, Optional

import pandas as pd
import tkinter as tk
from tkinter import filedialog, messagebox, ttk


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

REQUIRED_PERSONAL_COLUMNS = [
    "名称",
    "装评",
    "修为",
    "修炼",
    "总战力",
]


class UserCancelledError(Exception):
    pass


def center_window(window: tk.Misc, width: int, height: int):
    screen_w = window.winfo_screenwidth()
    screen_h = window.winfo_screenheight()
    x = max((screen_w - width) // 2, 0)
    y = max((screen_h - height) // 2, 0)
    window.geometry(f"{width}x{height}+{x}+{y}")


@dataclass
class PromptItem:
    reason: str
    existing_id: Optional[int] = None
    last_time: Optional[datetime] = None
    days_diff: Optional[int] = None

    def reason_text(self) -> str:
        if self.reason == "not_found":
            return "（未找到昵称对应的id）"
        if self.reason == "inactive" and self.last_time is not None and self.days_diff is not None:
            ts = self.last_time.strftime("%Y-%m-%d %H:%M:%S")
            return f"（上次参赛时间为{ts}，已相隔{self.days_diff}天）"
        return "（需要确认id）"


def safe_int(text: str, field_name: str) -> int:
    raw = (text or "").strip()
    try:
        return int(raw)
    except ValueError as exc:
        raise ValueError(f"{field_name} 不是合法数字") from exc


def parse_int_or_zero(value) -> int:
    if value is None:
        return 0
    text = str(value).strip()
    if not text or text.lower() == "nan":
        return 0
    return int(text)


def ensure_required_columns(df: pd.DataFrame, required_columns, label: str):
    missing = [col for col in required_columns if col not in df.columns]
    if missing:
        raise ValueError(f"{label} 缺少列: {', '.join(missing)}")


def clean_match_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    """
    清洗联赛数据：
    1) 删除整行空白（含只有空字符串/nan 的行）
    2) 删除重复表头行（帮会名列值为“帮会名”）
    3) 删除帮会名为空的行
    """
    cleaned = df.dropna(how="all").copy()

    def is_blank(value) -> bool:
        text = str(value).strip()
        return not text or text.lower() == "nan"

    cleaned = cleaned[
        ~cleaned.apply(lambda row: all(is_blank(v) for v in row.tolist()), axis=1)
    ]
    cleaned = cleaned[cleaned["帮会名"].astype(str).str.strip() != "帮会名"]
    cleaned = cleaned[cleaned["帮会名"].astype(str).str.strip() != ""]
    return cleaned


def extract_match_time_from_filename(filename: str) -> datetime:
    m = re.search(r"(\d{4}_\d{2}_\d{2}_\d{2}_\d{2}_\d{2})", filename)
    if not m:
        raise ValueError("文件名中未找到有效时间戳")
    return datetime.strptime(m.group(1), "%Y_%m_%d_%H_%M_%S")


def find_active_player_id(cursor, nickname: str, at_time: datetime) -> Optional[int]:
    cursor.execute(
        """
        SELECT player_id
        FROM nickname_history
        WHERE nickname = ?
          AND valid_from <= ?
          AND (valid_to IS NULL OR valid_to > ?)
        ORDER BY valid_from DESC
        LIMIT 1
        """,
        (nickname, at_time, at_time),
    )
    row = cursor.fetchone()
    return row[0] if row else None


def get_last_match_time(cursor, player_id: int) -> Optional[datetime]:
    cursor.execute(
        """
        SELECT MAX(m.match_time)
        FROM match_performance mp
        JOIN matches m ON mp.match_id = m.match_id
        WHERE mp.player_id = ?
        """,
        (player_id,),
    )
    row = cursor.fetchone()
    if not row or not row[0]:
        return None
    return datetime.fromisoformat(row[0])


def collect_required_id_prompts(cursor, nicknames, match_time: datetime) -> Dict[str, PromptItem]:
    prompts: Dict[str, PromptItem] = {}
    for nickname in nicknames:
        existing_id = find_active_player_id(cursor, nickname, match_time)
        if existing_id is None:
            prompts[nickname] = PromptItem(reason="not_found")
            continue

        last_time = get_last_match_time(cursor, existing_id)
        if last_time is None:
            if nickname == '无':
                continue
            else:
                raise ValueError(
                    f"数据异常：昵称 '{nickname}' 对应 player_id={existing_id}，"
                    "但该 player_id 从未在联赛战绩中出现过"
                )
        days_diff = (match_time - last_time).days
        if days_diff > 29:
            prompts[nickname] = PromptItem(
                reason="inactive",
                existing_id=existing_id,
                last_time=last_time,
                days_diff=days_diff,
            )
    return prompts


def apply_nickname_updates(
    cursor,
    old_player_id: Optional[int],
    new_player_id: int,
    nickname: str,
    match_time: datetime,
):
    if old_player_id is not None and old_player_id != new_player_id:
        cursor.execute(
            """
            UPDATE nickname_history
            SET valid_to = ?
            WHERE player_id = ? AND valid_to IS NULL
            """,
            (match_time, old_player_id),
        )

    cursor.execute("SELECT 1 FROM players WHERE player_id = ?", (new_player_id,))
    if cursor.fetchone():
        cursor.execute(
            """
            UPDATE nickname_history
            SET valid_to = ?
            WHERE player_id = ? AND valid_to IS NULL
            """,
            (match_time, new_player_id),
        )
    else:
        cursor.execute(
            """
            INSERT INTO players(player_id, created_at)
            VALUES (?, ?)
            """,
            (new_player_id, match_time),
        )

    cursor.execute(
        """
        INSERT INTO nickname_history(player_id, nickname, valid_from)
        VALUES (?, ?, ?)
        """,
        (new_player_id, nickname, match_time),
    )


def resolve_player_id(
    cursor,
    nickname: str,
    match_time: datetime,
    prompt_items: Dict[str, PromptItem],
    user_input_ids: Dict[str, int],
    resolved_cache: Dict[str, int],
) -> int:
    if nickname in resolved_cache:
        return resolved_cache[nickname]

    existing_id = find_active_player_id(cursor, nickname, match_time)
    prompt = prompt_items.get(nickname)

    if prompt is None:
        if existing_id is None:
            raise RuntimeError(f"昵称 '{nickname}' 未找到可用 player_id")
        resolved_cache[nickname] = existing_id
        return existing_id

    input_id = user_input_ids[nickname]
    if prompt.reason == "not_found":
        apply_nickname_updates(
            cursor=cursor,
            old_player_id=None,
            new_player_id=input_id,
            nickname=nickname,
            match_time=match_time,
        )
        resolved_cache[nickname] = input_id
        return input_id

    if prompt.reason == "inactive":
        if existing_id is None:
            raise RuntimeError(f"昵称 '{nickname}' 需要确认但缺少现有 player_id")
        if input_id == existing_id:
            resolved_cache[nickname] = existing_id
            return existing_id

        apply_nickname_updates(
            cursor=cursor,
            old_player_id=existing_id,
            new_player_id=input_id,
            nickname=nickname,
            match_time=match_time,
        )
        resolved_cache[nickname] = input_id
        return input_id

    raise RuntimeError(f"昵称 '{nickname}' 的确认类型无效: {prompt.reason}")


def rename_guild_match_file(filepath: str, target_guild: str, cleaned_df: pd.DataFrame) -> str:
    guilds = [g for g in cleaned_df["帮会名"].dropna().unique().tolist() if str(g).strip()]
    if len(guilds) < 2:
        raise ValueError("联赛数据文件中未找到两个不同帮会名")

    if target_guild not in guilds:
        raise ValueError(f"联赛数据文件中未找到本帮 '{target_guild}'，实际帮会: {guilds}")

    other_guild = [g for g in guilds if g != target_guild][0]
    filename = os.path.basename(filepath)
    m = re.search(r"(\d{4}_\d{2}_\d{2}_\d{2}_\d{2}_\d{2})", filename)
    if not m:
        raise ValueError("联赛数据文件名中未找到有效时间戳")
    timestamp = m.group(1)

    dirpath = os.path.dirname(filepath)
    new_filename = f"{target_guild}vs{other_guild}_{timestamp}.csv"
    new_filepath = os.path.join(dirpath, new_filename)

    if os.path.abspath(new_filepath) == os.path.abspath(filepath):
        return filepath

    if os.path.exists(new_filepath):
        raise FileExistsError(f"重命名目标文件已存在: {new_filepath}")

    os.rename(filepath, new_filepath)
    return new_filepath


def open_id_dialog(parent, prompt_items: Dict[str, PromptItem]) -> Optional[Dict[str, int]]:
    if not prompt_items:
        return {}

    dialog = tk.Toplevel(parent)
    dialog.title("昵称ID确认")
    dialog.transient(parent)
    dialog.grab_set()
    dialog.resizable(False, True)
    center_window(dialog, 700, 560)
    dialog.minsize(700, 560)

    top_label = ttk.Label(dialog, text="请输入下列昵称玩家的数字id")
    top_label.pack(padx=12, pady=(12, 8), anchor="w")

    container = ttk.Frame(dialog)
    container.pack(fill="both", expand=True, padx=12, pady=(0, 8))

    canvas = tk.Canvas(container, borderwidth=0, highlightthickness=0, height=420)
    scrollbar = ttk.Scrollbar(container, orient="vertical", command=canvas.yview)
    list_frame = ttk.Frame(canvas)

    list_frame.bind(
        "<Configure>",
        lambda e: canvas.configure(scrollregion=canvas.bbox("all")),
    )
    canvas.create_window((0, 0), window=list_frame, anchor="nw")
    canvas.configure(yscrollcommand=scrollbar.set)
    canvas.pack(side="left", fill="both", expand=True)
    scrollbar.pack(side="right", fill="y")

    nick_vars: Dict[str, tk.StringVar] = {}
    input_vars: Dict[str, tk.StringVar] = {}
    input_entries = {}

    for nickname, item in prompt_items.items():
        row = ttk.Frame(list_frame)
        row.pack(fill="x", pady=3)

        nick_var = tk.StringVar(value=nickname)
        nick_vars[nickname] = nick_var
        nick_entry = ttk.Entry(row, textvariable=nick_var, width=20, state="readonly")
        nick_entry.pack(side="left", padx=(0, 6))

        prefix = ttk.Label(row, text="的id是：")
        prefix.pack(side="left")

        id_var = tk.StringVar()
        id_entry = ttk.Entry(row, textvariable=id_var, width=18)
        id_entry.pack(side="left", padx=(4, 8))
        input_vars[nickname] = id_var
        input_entries[nickname] = id_entry

        reason = ttk.Label(row, text=item.reason_text())
        reason.pack(side="left")

    result: Optional[Dict[str, int]] = None

    def on_submit():
        nonlocal result
        parsed: Dict[str, int] = {}
        for nickname, var in input_vars.items():
            text = var.get().strip()
            try:
                parsed[nickname] = safe_int(text, f"昵称 '{nickname}' 的ID")
            except ValueError as exc:
                messagebox.showwarning("输入有误", str(exc), parent=dialog)
                input_entries[nickname].focus_set()
                return
        result = parsed
        dialog.destroy()

    def on_close():
        dialog.destroy()

    btn_frame = ttk.Frame(dialog)
    btn_frame.pack(fill="x", padx=12, pady=(0, 12))

    confirm_btn = ttk.Button(btn_frame, text="确定", command=on_submit)
    confirm_btn.pack()

    dialog.protocol("WM_DELETE_WINDOW", on_close)
    dialog.wait_visibility()
    dialog.focus_set()
    dialog.wait_window()
    return result


def import_match_transactional(
    parent,
    db_path: str,
    csv_path: str,
    personal_csv_path: str,
    target_guild: str,
    home_outcome: str,
    note: str,
):
    if home_outcome not in {"win", "lose"}:
        raise ValueError("home_outcome 只能是 win 或 lose")
    note_value = note if note else None

    match_df = pd.read_csv(csv_path, dtype=str)
    ensure_required_columns(match_df, REQUIRED_MATCH_COLUMNS, "联赛数据文件")
    match_df = clean_match_dataframe(match_df)

    personal_df = pd.read_csv(personal_csv_path, dtype=str)
    ensure_required_columns(personal_df, REQUIRED_PERSONAL_COLUMNS, "帮会成员文件")
    extra_map = {row["名称"]: row for _, row in personal_df.iterrows()}

    renamed_csv_path = rename_guild_match_file(csv_path, target_guild, match_df)
    match_name = os.path.basename(renamed_csv_path)
    match_time = extract_match_time_from_filename(match_name)

    guild_names = [g for g in match_df["帮会名"].dropna().astype(str).str.strip().unique().tolist() if g]
    opponent_candidates = [g for g in guild_names if g != target_guild]
    if len(opponent_candidates) != 1:
        raise ValueError(f"联赛数据中无法唯一识别对方帮会，识别到: {opponent_candidates}")
    opponent_guild_name = opponent_candidates[0]

    df_my = match_df[match_df["帮会名"] == target_guild]
    if df_my.empty:
        raise ValueError(f"联赛数据文件中未找到本帮 '{target_guild}' 的战绩行")
    df_opponent = match_df[match_df["帮会名"] == opponent_guild_name]
    if df_opponent.empty:
        raise ValueError(f"联赛数据文件中未找到对方帮会 '{opponent_guild_name}' 的战绩行")

    ordered_nicknames = list(
        dict.fromkeys(df_my["玩家"].tolist() + df_my["所在团长"].tolist())
    )

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT match_id FROM matches WHERE match_name = ?", (match_name,))
        if cursor.fetchone():
            raise ValueError(f"比赛文件 '{match_name}' 已存在于 matches 表中，已终止导入")

        cursor.execute("SELECT guild_id FROM guilds WHERE guild_name = ?", (target_guild,))
        guild_row = cursor.fetchone()
        if not guild_row:
            raise ValueError(f"数据库中不存在帮会 '{target_guild}'")
        guild_id = guild_row[0]

        cursor.execute("SELECT profession_id, profession_name FROM professions")
        profession_map = {row[1]: row[0] for row in cursor.fetchall()}

        prompt_items = collect_required_id_prompts(cursor, ordered_nicknames, match_time)
        user_input_ids: Dict[str, int] = {}
        if prompt_items:
            dialog_result = open_id_dialog(parent, prompt_items)
            if dialog_result is None:
                raise UserCancelledError("用户取消了昵称ID输入，导入终止")
            user_input_ids = dialog_result

        conn.execute("BEGIN")

        cursor.execute("SELECT guild_id FROM guilds WHERE guild_name = ?", (opponent_guild_name,))
        opponent_guild_row = cursor.fetchone()
        if opponent_guild_row:
            opponent_guild_id = opponent_guild_row[0]
        else:
            cursor.execute("SELECT MAX(guild_id) FROM guilds")
            max_guild_row = cursor.fetchone()
            max_guild_id = max_guild_row[0] if max_guild_row and max_guild_row[0] is not None else 0
            opponent_guild_id = max_guild_id + 1
            cursor.execute(
                "INSERT INTO guilds(guild_id, guild_name) VALUES (?, ?)",
                (opponent_guild_id, opponent_guild_name),
            )

        cursor.execute(
            "INSERT INTO matches(match_name, match_time) VALUES (?, ?)",
            (match_name, match_time),
        )
        match_id = cursor.lastrowid
        cursor.execute(
            """
            INSERT INTO match_results(match_id, home_guild_id, away_guild_id, home_outcome, note)
            VALUES (?, ?, ?, ?, ?)
            """,
            (match_id, guild_id, opponent_guild_id, home_outcome, note_value),
        )

        resolved_cache: Dict[str, int] = {}
        inserted_my_count = 0
        inserted_opponent_count = 0

        for _, row in df_my.iterrows():
            player_nick = row["玩家"]
            leader_nick = row["所在团长"]
            profession_name = row["职业"]

            player_id = resolve_player_id(
                cursor=cursor,
                nickname=player_nick,
                match_time=match_time,
                prompt_items=prompt_items,
                user_input_ids=user_input_ids,
                resolved_cache=resolved_cache,
            )
            leader_id = resolve_player_id(
                cursor=cursor,
                nickname=leader_nick,
                match_time=match_time,
                prompt_items=prompt_items,
                user_input_ids=user_input_ids,
                resolved_cache=resolved_cache,
            )

            if profession_name not in profession_map:
                raise ValueError(f"数据库中找不到职业: {profession_name}")
            profession_id = profession_map[profession_name]

            stats = extra_map.get(player_nick, {})

            level = safe_int(row["等级"], f"{player_nick} 的等级")
            kills = safe_int(row["击败"], f"{player_nick} 的击败")
            assists = safe_int(row["助攻"], f"{player_nick} 的助攻")
            war_resources = safe_int(row["战备资源"], f"{player_nick} 的战备资源")
            damage_to_players = safe_int(row["对玩家伤害"], f"{player_nick} 的对玩家伤害")
            damage_to_structures = safe_int(row["对建筑伤害"], f"{player_nick} 的对建筑伤害")
            healing_amount = safe_int(row["治疗值"], f"{player_nick} 的治疗值")
            damage_taken = safe_int(row["承受伤害"], f"{player_nick} 的承受伤害")
            serious_injuries = safe_int(row["重伤"], f"{player_nick} 的重伤")
            skill_qingdeng = safe_int(row["青灯焚骨"], f"{player_nick} 的青灯焚骨")
            skill_huayu = safe_int(row["化羽"], f"{player_nick} 的化羽")
            control_count = safe_int(row["控制"], f"{player_nick} 的控制")

            equipment_score = parse_int_or_zero(stats.get("装评", 0))
            skill_score = parse_int_or_zero(stats.get("修为", 0))
            cultivation_score = parse_int_or_zero(stats.get("修炼", 0))
            total_combat_power = parse_int_or_zero(stats.get("总战力", 0))

            cursor.execute(
                """
                INSERT INTO match_performance(
                    match_id, player_id, guild_id, level, profession_id, leader_id,
                    kills, assists, war_resources, damage_to_players,
                    damage_to_structures, healing_amount, damage_taken,
                    serious_injuries, skill_qingdeng, skill_huayu,
                    control_count, recorded_nick, equipment_score,
                    skill_score, cultivation_score, total_combat_power
                ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                """,
                (
                    match_id,
                    player_id,
                    guild_id,
                    level,
                    profession_id,
                    leader_id,
                    kills,
                    assists,
                    war_resources,
                    damage_to_players,
                    damage_to_structures,
                    healing_amount,
                    damage_taken,
                    serious_injuries,
                    skill_qingdeng,
                    skill_huayu,
                    control_count,
                    player_nick,
                    equipment_score,
                    skill_score,
                    cultivation_score,
                    total_combat_power,
                ),
            )
            inserted_my_count += 1

        for _, row in df_opponent.iterrows():
            profession_name = str(row["职业"]).strip()
            profession_id = profession_map.get(profession_name)
            if profession_id is None:
                raise ValueError(f"数据库中找不到职业: {profession_name}")

            player_nick = str(row["玩家"]).strip()
            leader_nick = str(row["所在团长"]).strip()
            level = safe_int(row["等级"], f"{player_nick} 的等级")
            kills = safe_int(row["击败"], f"{player_nick} 的击败")
            assists = safe_int(row["助攻"], f"{player_nick} 的助攻")
            war_resources = safe_int(row["战备资源"], f"{player_nick} 的战备资源")
            damage_to_players = safe_int(row["对玩家伤害"], f"{player_nick} 的对玩家伤害")
            damage_to_structures = safe_int(row["对建筑伤害"], f"{player_nick} 的对建筑伤害")
            healing_amount = safe_int(row["治疗值"], f"{player_nick} 的治疗值")
            damage_taken = safe_int(row["承受伤害"], f"{player_nick} 的承受伤害")
            serious_injuries = safe_int(row["重伤"], f"{player_nick} 的重伤")
            skill_qingdeng = safe_int(row["青灯焚骨"], f"{player_nick} 的青灯焚骨")
            skill_huayu = safe_int(row["化羽"], f"{player_nick} 的化羽")
            control_count = safe_int(row["控制"], f"{player_nick} 的控制")

            cursor.execute(
                """
                INSERT INTO opponent_match_performance(
                    match_id, guild_id, recorded_nick, level, profession_id, leader_nick,
                    kills, assists, war_resources, damage_to_players,
                    damage_to_structures, healing_amount, damage_taken,
                    serious_injuries, skill_qingdeng, skill_huayu, control_count
                ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                """,
                (
                    match_id,
                    opponent_guild_id,
                    player_nick,
                    level,
                    profession_id,
                    leader_nick,
                    kills,
                    assists,
                    war_resources,
                    damage_to_players,
                    damage_to_structures,
                    healing_amount,
                    damage_taken,
                    serious_injuries,
                    skill_qingdeng,
                    skill_huayu,
                    control_count,
                ),
            )
            inserted_opponent_count += 1

        conn.commit()
        return renamed_csv_path, match_name, inserted_my_count, inserted_opponent_count
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def build_main_window():
    root = tk.Tk()
    root.title("联赛导入工具")
    root.resizable(False, False)
    center_window(root, 920, 240)

    cwd = os.path.abspath(os.getcwd())
    default_db = os.path.join(cwd, "game_league.db")

    guild_var = tk.StringVar(value="十月唱晚")
    db_var = tk.StringVar(value=default_db)
    match_var = tk.StringVar(value="")
    personal_var = tk.StringVar(value="")
    outcome_var = tk.StringVar(value="win")
    note_var = tk.StringVar(value="")

    main = ttk.Frame(root, padding=12)
    main.pack(fill="both", expand=True)

    ttk.Label(main, text="本帮帮会名：").grid(row=0, column=0, sticky="w", pady=4)
    ttk.Entry(main, textvariable=guild_var, width=40).grid(
        row=0, column=1, columnspan=1, sticky="ew", pady=4
    )

    ttk.Label(main, text="数据库文件：").grid(row=1, column=0, sticky="w", pady=4)
    ttk.Entry(main, textvariable=db_var, state="readonly", width=60).grid(
        row=1, column=1, sticky="ew", pady=4
    )

    def browse_db():
        path = filedialog.askopenfilename(
            title="选择数据库文件",
            filetypes=[("SQLite DB", "*.db *.sqlite *.sqlite3"), ("All Files", "*.*")],
        )
        if path:
            db_var.set(path)

    ttk.Button(main, text="浏览", command=browse_db).grid(
        row=1, column=2, sticky="w", padx=(8, 0), pady=4
    )

    ttk.Label(main, text="联赛数据文件：").grid(row=2, column=0, sticky="w", pady=4)
    ttk.Entry(main, textvariable=match_var, state="readonly", width=60).grid(
        row=2, column=1, sticky="ew", pady=4
    )

    def browse_match():
        path = filedialog.askopenfilename(
            title="选择联赛数据文件",
            filetypes=[("CSV Files", "*.csv"), ("All Files", "*.*")],
        )
        if path:
            match_var.set(path)

    ttk.Button(main, text="浏览", command=browse_match).grid(
        row=2, column=2, sticky="w", padx=(8, 0), pady=4
    )

    ttk.Label(main, text="帮会成员文件：").grid(row=3, column=0, sticky="w", pady=4)
    ttk.Entry(main, textvariable=personal_var, state="readonly", width=60).grid(
        row=3, column=1, sticky="ew", pady=4
    )

    def browse_personal():
        path = filedialog.askopenfilename(
            title="选择帮会成员文件",
            filetypes=[("CSV Files", "*.csv"), ("All Files", "*.*")],
        )
        if path:
            personal_var.set(path)

    ttk.Button(main, text="浏览", command=browse_personal).grid(
        row=3, column=2, sticky="w", padx=(8, 0), pady=4
    )

    ttk.Label(main, text="本帮是否胜利：").grid(row=4, column=0, sticky="w", pady=4)
    outcome_frame = ttk.Frame(main)
    outcome_frame.grid(row=4, column=1, sticky="w", pady=4)
    ttk.Radiobutton(outcome_frame, text="胜利", value="win", variable=outcome_var).pack(
        side="left", padx=(0, 12)
    )
    ttk.Radiobutton(outcome_frame, text="败北", value="lose", variable=outcome_var).pack(
        side="left"
    )
    ttk.Label(outcome_frame, text="备注：").pack(side="left", padx=(16, 4))
    ttk.Entry(outcome_frame, textvariable=note_var, width=28).pack(side="left")

    main.columnconfigure(1, weight=1)

    button_frame = ttk.Frame(main)
    button_frame.grid(row=5, column=0, columnspan=3, pady=(14, 4))

    importing = {"running": False}

    def on_import():
        if importing["running"]:
            return

        target_guild = guild_var.get().strip()
        home_outcome = outcome_var.get().strip()
        note = note_var.get().strip()
        db_path = db_var.get().strip()
        match_path = match_var.get().strip()
        personal_path = personal_var.get().strip()

        if not target_guild:
            messagebox.showwarning("参数错误", "本帮帮会名不能为空", parent=root)
            return
        if not db_path or not os.path.isfile(db_path):
            messagebox.showwarning("参数错误", "数据库文件不存在", parent=root)
            return
        if not match_path or not os.path.isfile(match_path):
            messagebox.showwarning("参数错误", "联赛数据文件不存在", parent=root)
            return
        if not personal_path or not os.path.isfile(personal_path):
            messagebox.showwarning("参数错误", "帮会成员文件不存在", parent=root)
            return
        if home_outcome not in {"win", "lose"}:
            messagebox.showwarning("参数错误", "请先选择本帮是否胜利", parent=root)
            return

        importing["running"] = True
        import_btn.config(state="disabled")
        close_btn.config(state="disabled")

        try:
            renamed_path, match_name, inserted_my_count, inserted_opponent_count = import_match_transactional(
                parent=root,
                db_path=db_path,
                csv_path=match_path,
                personal_csv_path=personal_path,
                target_guild=target_guild,
                home_outcome=home_outcome,
                note=note,
            )
            match_var.set(renamed_path)
            messagebox.showinfo(
                "导入成功",
                (
                    f"已导入比赛：{match_name}\n"
                    f"本帮战绩插入 {inserted_my_count} 条\n"
                    f"对方战绩插入 {inserted_opponent_count} 条"
                ),
                parent=root,
            )
        except UserCancelledError:
            messagebox.showinfo("已取消", "你已取消导入", parent=root)
        except Exception as exc:
            messagebox.showerror("导入失败", f"{exc}", parent=root)
        finally:
            importing["running"] = False
            import_btn.config(state="normal")
            close_btn.config(state="normal")

    import_btn = ttk.Button(button_frame, text="导入", command=on_import, width=12)
    import_btn.pack(side="left", padx=10)

    close_btn = ttk.Button(button_frame, text="关闭", command=root.destroy, width=12)
    close_btn.pack(side="left", padx=10)

    root.mainloop()


if __name__ == "__main__":
    build_main_window()
