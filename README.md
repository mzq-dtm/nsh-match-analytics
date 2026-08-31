# nsh-match-analytics

《逆水寒》端游帮会联赛数据管理与分析系统，支持经典服联赛数据和黄金畅玩服联赛数据。

系统将游戏导出的 CSV 写入 SQLite，提供本帮与对手战绩、敌我统计对比、出勤统计、玩家历史、团队配置，以及带预检、备份和玩家身份确认的管理员网页导入流程。

## 主要功能

- **联赛数据**：查看本帮或对手的单场战绩、胜负和备注，按团或职业汇总，进行敌我统计对比和本帮表现自动分析，并将本帮分团数据导出为团队战报 PNG 长图。
- **帮众出勤分析**：按日期范围统计出勤率、近期战力、首次/最后参赛时间及累计战斗数据。
- **帮众数据查询**：按昵称、拼音、拼音首字母或玩家 ID 查找玩家，查看历史表现和单场排名。
- **联赛团队配置**：读取成员 CSV，筛选和拖放成员、修改职业，并生成分团图片预览或导出电子表格。
- **管理员网页导入**：识别经典服联赛数据或黄金畅玩服联赛数据，完成玩家身份预检，并在备份后通过事务写入数据库。

## 文档

- [用户指南](docs/user-guide.md)：页面操作、统计口径和团队配置。
- [开发与测试指南](docs/development.md)：开发环境、质量检查命令、测试范围和贡献流程。
- [管理员导入指南](docs/admin-import.md)：CSV 格式、两种导入模式、合服后首次导入、玩家 ID 和故障处理。
- [系统架构](docs/architecture.md)：组件边界、数据流、数据模型和核心约束。
- [API 文档](docs/api.md)：查询 API 与管理员 API 契约。
- [生产部署指南](docs/deployment.md)：Ubuntu、Gunicorn、Nginx、权限、升级、合服边界处理、备份和恢复。

## 系统组成

| 服务 | 本地默认地址 | 用途 |
| --- | --- | --- |
| Vite 开发服务器 | `http://127.0.0.1:5173` | 前端页面，并代理两个后端 |
| 查询后端 | `http://127.0.0.1:10290` | 只提供查询接口 `/api/*` |
| 管理员后端 | `http://127.0.0.1:10291` | 提供健康检查及写入接口 `/admin-api/*` |

生产环境由 Nginx 提供静态文件并代理两个后端。两个 Flask 应用都没有应用层登录功能，10290 和 10291 必须只监听 loopback，不能绕过 Nginx 直接暴露。

当前数据库面向一个逻辑上的本帮及一条全局递增的比赛时间线，不是多租户数据库。不要在同一数据库中混放互不相关的多个本帮数据。详细边界见[系统架构](docs/architecture.md)。

## 环境要求

- Linux、macOS 或 WSL；生产部署指南以 Ubuntu 为例。
- Python 3.9 或更高版本；CI 使用 Python 3.11。
- Node.js `^20.19.0`、`^22.13.0` 或 `>=24.0.0`；推荐使用与 CI 一致的 Node.js 24。
- npm 10 或更高版本。
- SQLite 3 命令行工具。

## 本地启动

以下命令均从仓库根目录开始执行。需要一个全新的本地数据库；已有数据库不能执行本节的初始化命令。

### 1. 初始化数据库

下面的代码块必须整体执行。它会拒绝覆盖已有的 `database/game_league.db`，并在初始化结束后检查数据库完整性。

```bash
(
  set -eu
  umask 077
  cd database

  test ! -e game_league.db
  sqlite3 game_league.db < schema.sql
  sqlite3 game_league.db < init_data.sql
  python3 insert_home_guild.py

  test "$(sqlite3 game_league.db 'PRAGMA quick_check;')" = "ok"
  test -z "$(sqlite3 game_league.db 'PRAGMA foreign_key_check;')"
)
```

`insert_home_guild.py` 会提示输入本帮名称。这个名称必须与管理员页面填写的名称及 CSV 中的帮会名完全一致。导入格式和名称约束见[管理员导入指南](docs/admin-import.md)。

如果初始化中途失败，先确认 `database/game_league.db` 是本次创建且不包含需要保留的数据，再处理该不完整文件并重新执行；不要对已有数据库反复运行初始化 SQL。

已有数据库遇到游戏服务器合服时同样不能重新初始化。合服需要在保留既有比赛和玩家历史的前提下结束旧昵称映射，并在后续首次导入中重新确认玩家身份；本地或生产操作均应遵循[生产部署指南的合服边界处理流程](docs/deployment.md#合服边界处理)。

### 2. 安装后端依赖

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
cd ..
```

默认配置位于 `backend/config.py`：

```python
class Config:
    DATABASE = "../database/game_league.db"
    ADMIN_UPLOAD_DIR = "./tmpfile/"
    DB_BACKUP_DIR = "./backup/"
```

当前项目不读取 `.env`。查询后端会相对于进程工作目录解释数据库相对路径，管理员后端会相对于 `backend/` 解释路径，因此请严格按下文从 `backend/` 启动两个进程。生产环境应使用绝对路径。

### 3. 启动两个后端

终端一：

```bash
cd backend
venv/bin/gunicorn --workers 1 --bind 127.0.0.1:10290 app:app
```

终端二：

```bash
cd backend
venv/bin/gunicorn --workers 1 --bind 127.0.0.1:10291 admin_app:app
```

本地检查：

```bash
curl -fsS http://127.0.0.1:10290/api/matches
curl -fsS http://127.0.0.1:10291/admin-api/health
```

查询接口应返回 JSON 数组；管理员健康接口应返回 `{"status":"ok"}`。健康接口只证明进程能够响应，不检查数据库、上传目录或备份目录。

### 4. 启动前端

终端三：

```bash
cd frontend
npm ci --include=dev
npm run dev
```

访问 `http://127.0.0.1:5173`。Vite 会将 `/api` 代理到 10290，将 `/admin-api` 代理到 10291。

管理员导入页位于 `http://127.0.0.1:5173/admin/import`。本地开发服务器不提供管理员认证，不要将本地服务暴露到不可信网络。

## 开发与质量检查

安装前端依赖时需要保留开发依赖；Vitest、Vite、TypeScript 和 ESLint 都不需要全局安装。提交前可在 `frontend/` 目录依次执行：

```bash
npm ci --include=dev
npm run lint
npm test
npm run type-check
npm run build
```

详细的开发环境、命令说明和当前自动化测试边界见[开发与测试指南](docs/development.md)。

## 项目目录

```text
backend/                 Flask 查询后端、管理员后端和运行配置
database/                SQLite schema、初始化数据、本帮初始化和合服维护脚本
frontend/                Vue 3 单页前端
docs/user-guide.md       普通用户操作与统计口径
docs/development.md      开发环境、质量检查与测试边界
docs/admin-import.md     管理员导入流程与 CSV 契约
docs/architecture.md     架构、数据流和数据模型
docs/api.md              HTTP API 契约
docs/deployment.md       生产部署、升级、备份、恢复和排障
```

## License

本项目采用 [MIT License](LICENSE)。
