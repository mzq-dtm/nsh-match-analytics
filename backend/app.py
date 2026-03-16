#
# app.py
# backend
#
# Created by mzq on 2025/5/26
#
from flask import Flask, jsonify, request
from flask_cors import CORS
import sqlite3
from datetime import datetime
from config import Config

app = Flask(__name__, static_folder='static', static_url_path='/')
CORS(app)

def get_db():
    conn = sqlite3.connect(Config.DATABASE)
    conn.row_factory = sqlite3.Row
    return conn


@app.route('/api/player_history/<int:player_id>', methods=['GET'])
def api_player_history(player_id):
    """
    获取指定玩家id的历史战绩及排名
    """
    db = get_db()

    # 获取该玩家的比赛数据
    rows = db.execute("""
        SELECT
            mp.match_id,
            m.match_name,
            mp.recorded_nick,
            pr.profession_name,
            mp.equipment_score,
            mp.skill_score,
            mp.cultivation_score,
            mp.total_combat_power,
            m.match_time,
            mp.leader_id,
            nhl.nickname AS leader,
            mp.kills,
            mp.assists,
            mp.war_resources,
            mp.damage_to_players,
            mp.damage_to_structures,
            mp.healing_amount,
            mp.damage_taken,
            mp.serious_injuries,
            mp.skill_qingdeng,
            mp.skill_huayu,
            mp.control_count
        FROM match_performance mp
        JOIN matches m ON mp.match_id = m.match_id
        LEFT JOIN professions pr ON mp.profession_id = pr.profession_id
        LEFT JOIN nickname_history nhl ON nhl.player_id = mp.leader_id
            AND nhl.valid_from <= m.match_time
            AND (nhl.valid_to IS NULL OR nhl.valid_to > m.match_time)
        WHERE mp.player_id = ?
        ORDER BY m.match_time DESC
    """, (player_id,)).fetchall()

    if not rows:
        return jsonify({"error": "Player not found or no match data available"}), 404

    # 处理每场比赛的数据
    player_history = []
    for r in rows:
        total_dmg = r['damage_to_players'] + r['damage_to_structures']
        kd = r['kills'] / max(r['serious_injuries'], 1)

        # 计算该玩家在当前比赛中的排名（击杀、伤害、治疗）
        kills_rank = db.execute("""
            SELECT COUNT(*) + 1
            FROM match_performance
            WHERE match_id = ?
            AND kills > ?
        """, (r['match_id'], r['kills'])).fetchone()[0]

        damage_to_player_rank = db.execute("""
            SELECT COUNT(*) + 1
            FROM match_performance
            WHERE match_id = ?
            AND damage_to_players > ?
        """, (r['match_id'], r['damage_to_players'])).fetchone()[0]

        damage_to_structure_rank = db.execute("""
            SELECT COUNT(*) + 1
            FROM match_performance
            WHERE match_id = ?
            AND damage_to_structures > ?
        """, (r['match_id'], r['damage_to_structures'])).fetchone()[0]

        damage_rank = db.execute("""
            SELECT COUNT(*) + 1
            FROM match_performance
            WHERE match_id = ?
            AND (damage_to_players + damage_to_structures) > ?
        """, (r['match_id'], total_dmg)).fetchone()[0]

        healing_rank = db.execute("""
            SELECT COUNT(*) + 1
            FROM match_performance
            WHERE match_id = ?
            AND healing_amount > ?
        """, (r['match_id'], r['healing_amount'])).fetchone()[0]

        player_history.append({
            "match_name": r['match_name'],
            "match_time": r['match_time'],
            "nickname": r['recorded_nick'],
            "profession": r['profession_name'],
            "equipment_score": r['equipment_score'],
            "skill_score": r['skill_score'],
            "cultivation_score": r['cultivation_score'],
            "total_combat_power": r['total_combat_power'],
            "leader": r['leader'],
            "kills": r['kills'],
            "assists": r['assists'],
            "war_resources": r['war_resources'],
            "damage_to_players": r['damage_to_players'],
            "damage_to_structures": r['damage_to_structures'],
            "healing": r['healing_amount'],
            "damage_taken": r['damage_taken'],
            "serious_injuries": r['serious_injuries'],
            "skill_qingdeng": r['skill_qingdeng'],
            "skill_huayu": r['skill_huayu'],
            "control_count": r['control_count'],
            "KD": round(kd, 2),
            "total_damage": total_dmg,
            "rank_kills": kills_rank,
            "rank_damage_to_players": damage_to_player_rank,
            "rank_damage_to_structures": damage_to_structure_rank,
            "rank_damage": damage_rank,
            "rank_healing": healing_rank
        })

    db.close()
    return jsonify(player_history)


@app.route('/api/players', methods=['GET'])
def api_players():
    """
    获取所有玩家及其最近 3 个昵称
    """
    db = get_db()
    # 获取所有玩家的 player_id
    player_rows = db.execute("SELECT player_id FROM players WHERE player_id > 1").fetchall()

    # 结果字典，用于存储每个玩家的昵称
    players = []

    # 对每个玩家查询其最新的 3 个昵称
    for row in player_rows:
        pid = row['player_id']

        # 查询该玩家的最新 3 个昵称
        nick_rows = db.execute("""
            SELECT nickname
            FROM nickname_history
            WHERE player_id = ?
            ORDER BY valid_from DESC
        """, (pid,)).fetchall()
        # 只保留最新的 3 个昵称
        nicknames = [r['nickname'] for r in nick_rows[:3]]
        # 将玩家ID和昵称保存到字典中
        players.append({
            'player_id': pid,
            'nicknames': nicknames
        })

    db.close()
    return jsonify(players)


@app.route('/api/player_history', methods=['POST'])
def api_history():
    """
    接收 JSON { "names": ["玩家A", "玩家B", ...] }
    返回每个玩家最近 3 场联赛的历史战绩及排名
    """
    payload = request.get_json(force=True)
    names = payload.get('names', [])

    # 允许前端指定要回溯的场次数
    default_count = 3
    try:
        count = max(1, int(payload.get('count', default_count)))  # 防止负数或非整数
    except (TypeError, ValueError):
        count = default_count

    db = get_db()
    result = {}

    for name in names:
        # 1. 先查当前有效的 player_id
        pid_row = db.execute("""
                    SELECT player_id
                    FROM nickname_history
                    WHERE nickname = ?
                      AND valid_from <= datetime('now', '+8 hours')
                      AND (valid_to IS NULL OR valid_to > datetime('now', '+8 hours'))
                    ORDER BY valid_from DESC
                    LIMIT 1
                """, (name,)).fetchone()

        if not pid_row:
            # 没找到这个名字对应的 player_id，返回空列表或标记错误
            result[name] = []
            continue

        player_id = pid_row['player_id']

        rows = db.execute("""
            SELECT
              mp.match_id,
              m.match_name,
              mp.recorded_nick,
              pr.profession_name,
              mp.equipment_score,
              mp.skill_score,
              mp.cultivation_score,
              mp.total_combat_power,
              m.match_time,
              mp.leader_id,
              nhl.nickname AS leader,
              mp.kills,
              mp.assists,
              mp.war_resources,
              mp.damage_to_players,
              mp.damage_to_structures,
              mp.healing_amount,
              mp.damage_taken,
              mp.serious_injuries,
              mp.skill_qingdeng,
              mp.skill_huayu,
              mp.control_count
            FROM match_performance mp
            JOIN matches m ON mp.match_id = m.match_id
            LEFT JOIN professions pr ON mp.profession_id = pr.profession_id
            LEFT JOIN nickname_history nhl
              ON nhl.player_id = mp.leader_id
             AND nhl.valid_from <= m.match_time
             AND (nhl.valid_to IS NULL OR nhl.valid_to > m.match_time)
            WHERE mp.player_id  = ?
            ORDER BY m.match_time DESC
            LIMIT ?
        """, (player_id, count)).fetchall()

        recs = []
        for r in rows:
            total_dmg = r['damage_to_players'] + r['damage_to_structures']
            kd = r['kills'] / max(r['serious_injuries'], 1)

            # 计算当场排名
            kills_rank = db.execute("""
                SELECT COUNT(*) + 1
                  FROM match_performance
                 WHERE match_id = ?
                 AND leader_id = ?    
                 AND kills > ?
            """, (r['match_id'], r['leader_id'], r['kills'])).fetchone()[0]

            damage_rank = db.execute("""
                SELECT COUNT(*) + 1 FROM (
                  SELECT (damage_to_players + damage_to_structures) AS td
                    FROM match_performance
                   WHERE match_id = ?
                   AND leader_id = ?    
                ) WHERE td > ?
            """, (r['match_id'], r['leader_id'], total_dmg)).fetchone()[0]

            healing_rank = db.execute("""
                SELECT COUNT(*) + 1
                  FROM match_performance
                 WHERE match_id = ? 
                 AND leader_id = ?  
                 AND healing_amount > ?
            """, (r['match_id'], r['leader_id'], r['healing_amount'])).fetchone()[0]

            recs.append({
                "match":                r['match_name'],
                "nickname":             r['recorded_nick'],
                "profession":           r['profession_name'],
                "equipment_score":      r['equipment_score'],
                "skill_score":          r['skill_score'],
                "cultivation_score":    r['cultivation_score'],
                "total_combat_power":   r['total_combat_power'],
                "leader":               r['leader'],
                "kills":                r['kills'],
                "assists":              r['assists'],
                "war_resources":        r['war_resources'],
                "damage_to_players":    r['damage_to_players'],
                "damage_to_structures": r['damage_to_structures'],
                "healing":              r['healing_amount'],
                "damage_taken":         r['damage_taken'],
                "serious_injuries":     r['serious_injuries'],
                "skill_qingdeng":       r['skill_qingdeng'],
                "skill_huayu":          r['skill_huayu'],
                "control_count":        r['control_count'],
                "KD":                   round(kd, 2),
                "total_damage":         total_dmg,
                "rank_kills":           kills_rank,
                "rank_damage":          damage_rank,
                "rank_healing":         healing_rank
            })
        result[name] = recs

    db.close()
    return jsonify(result)


@app.route('/api/matches')
def api_matches():
    """
    获取联赛列表
    """
    db = get_db()
    rows = db.execute('SELECT match_id, match_name FROM matches ORDER BY match_id desc').fetchall()
    db.close()
    return jsonify([dict(r) for r in rows])


@app.route('/api/match-results/<int:match_id>', methods=['GET'])
def api_match_result(match_id):
    """
    获取指定联赛id的整场本帮联赛数据
    """
    db = get_db()
    row = db.execute(
        """
        SELECT home_outcome, note
        FROM match_results
        WHERE match_id = ?
        """,
        (match_id,),
    ).fetchone()
    db.close()
    return jsonify({
        'match_id': match_id,
        'home_outcome': row['home_outcome'] if row else None,
        'note': row['note'] if row else None,
    })


@app.route('/api/opponent-performances/<int:match_id>', methods=['GET'])
def api_opponent_performances(match_id):
    """
    获取指定联赛id的整场对手联赛数据
    """
    db = get_db()
    rows = db.execute(
        """
        SELECT
          omp.match_id,
          NULL AS player_id,
          omp.recorded_nick,
          omp.level,
          pr.profession_name,
          omp.leader_nick,
          NULL AS equipment_score,
          NULL AS skill_score,
          NULL AS cultivation_score,
          NULL AS total_combat_power,
          omp.kills,
          omp.assists,
          omp.war_resources,
          omp.damage_to_players,
          omp.damage_to_structures,
          omp.healing_amount,
          omp.damage_taken,
          omp.serious_injuries,
          omp.skill_qingdeng,
          omp.skill_huayu,
          omp.control_count
        FROM opponent_match_performance omp
        LEFT JOIN professions pr
          ON omp.profession_id = pr.profession_id
        WHERE omp.match_id = ?
        ORDER BY omp.recorded_nick
        """,
        (match_id,),
    ).fetchall()
    db.close()
    return jsonify([dict(r) for r in rows])


@app.route('/api/performances/<int:match_id>')
def api_performances(match_id):
    """
    获取指定联赛id的联赛对阵双方、结果与备注
    """
    db = get_db()
    rows = db.execute("""
        SELECT
          mp.match_id,
          mp.player_id,
          mp.recorded_nick,
          mp.level,
          pr.profession_name,
          nhl.nickname     AS leader_nick,
          mp.equipment_score,
          mp.skill_score,
          mp.cultivation_score,
          mp.total_combat_power,
          mp.kills,
          mp.assists,
          mp.war_resources,
          mp.damage_to_players,
          mp.damage_to_structures,
          mp.healing_amount,
          mp.damage_taken,
          mp.serious_injuries,
          mp.skill_qingdeng,
          mp.skill_huayu,
          mp.control_count
        FROM match_performance mp
        JOIN matches m ON mp.match_id = m.match_id
        LEFT JOIN professions pr
          ON mp.profession_id = pr.profession_id
        LEFT JOIN nickname_history nhl
          ON nhl.player_id = mp.leader_id
         AND nhl.valid_from <= m.match_time
         AND (nhl.valid_to IS NULL OR nhl.valid_to > m.match_time)
        WHERE mp.match_id = ?
        ORDER BY mp.player_id
    """, (match_id,)).fetchall()
    db.close()
    return jsonify([dict(r) for r in rows])


@app.route('/api/matches/earliest', methods=['GET'])
def api_earliest_match():
    """
    返回 matches 表中最早一场比赛的日期（YYYY-MM-DD 格式）
    """
    db  = get_db()
    row = db.execute("SELECT MIN(date(match_time)) AS earliest FROM matches").fetchone()
    db.close()

    return jsonify({'earliest': row['earliest']}) 


@app.route('/api/attendance', methods=['GET'])
def api_attendance():
    """
    GET /api/attendance?start=YYYY-MM-DD&end=YYYY-MM-DD

    返回区间内所有玩家的出勤概览：
        player_id
        nicknames           旧→新（换行分隔）
        total_combat_power  该玩家最近一次出场的战力（全库范围）
        attended            a：区间内出勤场数
        total_matches       b：区间内总比赛数
        attendance_rate     a/b，四舍五入到 4 位小数
        first_match_time    该玩家首次出现在任意联赛的时间（全库范围）
        last_match_time     该玩家最近一次出现在任意联赛的时间（全库范围）
        total_damage_to_players
        total_damage_to_structures
        total_kills
        total_kd
        total_healing
        total_control
        total_qingdeng
    """
    start = request.args.get('start')
    end = request.args.get('end')

    # —— 参数校验 ——
    try:
        datetime.fromisoformat(start)
        datetime.fromisoformat(end)
    except Exception:
        return jsonify({'error': 'start 与 end 必须是有效的 YYYY-MM-DD 日期'}), 400

    db = get_db()

    # 1) 统计区间内比赛总数 b
    total_matches = db.execute(
        "SELECT COUNT(*) FROM matches "
        "WHERE date(match_time) BETWEEN ? AND ?", (start, end)
    ).fetchone()[0]

    if total_matches == 0:
        db.close()
        return jsonify([])

    # 2) 主查询（新增 stats 聚合）
    rows = db.execute("""
        WITH date_filtered_matches AS (
            SELECT match_id
              FROM matches
             WHERE date(match_time) BETWEEN :start AND :end
        ),
        attendance AS (
            SELECT mp.player_id, COUNT(*) AS attended
              FROM match_performance mp
              JOIN date_filtered_matches dfm USING (match_id)
             GROUP BY mp.player_id
        ),
        stats AS (
            SELECT
                mp.player_id,
                SUM(mp.damage_to_players)     AS total_damage_to_players,
                SUM(mp.damage_to_structures)  AS total_damage_to_structures,
                SUM(mp.kills)                 AS total_kills,
                SUM(mp.serious_injuries)      AS total_serious_injuries,
                SUM(mp.healing_amount)        AS total_healing,
                SUM(mp.control_count)         AS total_control,
                SUM(mp.skill_qingdeng)        AS total_qingdeng
            FROM match_performance mp
            JOIN date_filtered_matches dfm USING (match_id)
            GROUP BY mp.player_id
        ),
        latest_power AS (
            SELECT mp.player_id, 
                   mp.total_combat_power,
                   t.last_time AS last_match_time
              FROM match_performance mp
              JOIN matches m ON mp.match_id = m.match_id
              JOIN (
                    SELECT player_id, MAX(m2.match_time) AS last_time
                      FROM match_performance mp2
                      JOIN matches m2 ON mp2.match_id = m2.match_id
                     GROUP BY player_id
              ) t ON t.player_id = mp.player_id
               AND m.match_time   = t.last_time
        ),
        earliest_first AS (
            SELECT mp.player_id, MIN(m.match_time) AS first_match_time
              FROM match_performance mp
              JOIN matches m ON mp.match_id = m.match_id
             GROUP BY mp.player_id
        ),
        nick AS (
            SELECT player_id,
                   GROUP_CONCAT(nickname, CHAR(10)) AS nicknames
              FROM (
                    SELECT player_id, nickname
                      FROM nickname_history
                  ORDER BY valid_from
              )
             GROUP BY player_id
        )
        SELECT
            p.player_id,
            COALESCE(nick.nicknames, '')                 AS nicknames,
            COALESCE(latest_power.total_combat_power, 0) AS total_combat_power,
            COALESCE(attendance.attended, 0)             AS attended,
            :total_matches                               AS total_matches,
            ROUND(
                COALESCE(attendance.attended, 0) * 1.0 / :total_matches,
                4
            )                                            AS attendance_rate,
            earliest_first.first_match_time              AS first_match_time,
            latest_power.last_match_time                 AS last_match_time,
            COALESCE(stats.total_damage_to_players,    0) AS total_damage_to_players,
            COALESCE(stats.total_damage_to_structures, 0) AS total_damage_to_structures,
            COALESCE(stats.total_kills,                0) AS total_kills,
            CASE 
              WHEN COALESCE(stats.total_serious_injuries, 0) = 0
                THEN ROUND(COALESCE(stats.total_kills, 0) * 1.0, 4)
              ELSE ROUND(stats.total_kills * 1.0 / stats.total_serious_injuries, 4)
            END                                           AS total_kd,
            COALESCE(stats.total_healing,               0) AS total_healing,
            COALESCE(stats.total_control,               0) AS total_control,
            COALESCE(stats.total_qingdeng,              0) AS total_qingdeng

          FROM players p
     LEFT JOIN nick            ON nick.player_id          = p.player_id
     LEFT JOIN attendance      ON attendance.player_id    = p.player_id
     LEFT JOIN stats           ON stats.player_id         = p.player_id
     LEFT JOIN latest_power    ON latest_power.player_id  = p.player_id
     LEFT JOIN earliest_first  ON earliest_first.player_id= p.player_id
         WHERE p.player_id > 1
      ORDER BY p.player_id
    """, {'start': start, 'end': end,
          'total_matches': total_matches}).fetchall()

    db.close()
    return jsonify([dict(r) for r in rows])


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=10290)

