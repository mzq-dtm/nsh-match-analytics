#
# insert_home_guild.py
# database
#
# Created by mzq on 2025/5/26
#
from config import Config

import sqlite3
import sys


def get_db():
    conn = sqlite3.connect(Config.DATABASE)
    conn.row_factory = sqlite3.Row
    return conn


def main():
    try:
        conn = get_db()
        cur = conn.cursor()

        # 1. 检查 guild_id < 10000 的空间是否还能放下
        cur.execute("""
            SELECT MAX(guild_id) AS max_id
            FROM guilds
            WHERE guild_id < 10000
        """)
        row = cur.fetchone()
        max_id = row["max_id"]

        # 如果已经有 9999，则不能再插入小于10000的新ID
        if max_id is not None and max_id >= 9999:
            print("帮会数据表空间不足：本帮帮会数量超过9999！")
            sys.exit(1)

        # 2. 输入帮会名
        guild_name = input("请输入帮会名：").strip()

        if not guild_name:
            print("帮会名不能为空！")
            sys.exit(1)

        # 3. 检查该帮会名是否已存在
        cur.execute("""
            SELECT guild_id, guild_name
            FROM guilds
            WHERE guild_name = ?
        """, (guild_name,))
        existing = cur.fetchone()

        if existing is not None:
            print(f"已存在名为{existing['guild_name']}的帮会，guild_id为：{existing['guild_id']}")
            sys.exit(0)

        # 4. 不存在则插入：取 guild_id < 10000 中最大的 id，再 +1
        # 如果表中一个都没有，则从 1 开始
        if max_id is None:
            new_id = 1
        else:
            new_id = max_id + 1

        if new_id >= 10000:
            print("帮会数据表空间不足：本帮帮会数量超过9999！")
            sys.exit(1)

        cur.execute("""
            INSERT INTO guilds (guild_id, guild_name)
            VALUES (?, ?)
        """, (new_id, guild_name))
        conn.commit()

        print(f"已新增帮会：{guild_name}，guild_id为：{new_id}")

    except sqlite3.Error as e:
        print(f"数据库错误：{e}")
        sys.exit(1)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
