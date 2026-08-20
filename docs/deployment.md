# 生产部署指南

本文说明如何在 Ubuntu 服务器上部署 nsh-match-analytics。示例使用：

- 代码目录：`/opt/nsh-match-analytics`
- 运行用户：`nsh`
- 数据库：`/var/lib/nsh-match-analytics/game_league.db`
- 上传暂存：`/var/lib/nsh-match-analytics/admin-upload`
- 数据库备份：`/var/backups/nsh-match-analytics`
- 前端发布目录：`/var/www/nsh-match-analytics`
- 普通后端：`127.0.0.1:10290`
- 管理员后端：`127.0.0.1:10291`

请根据实际服务器调整域名和目录。数据库初始化步骤只适用于全新安装；不要在已有生产数据库上重新执行 `schema.sql` 或 `init_data.sql`。

## 架构与安全边界

```text
浏览器
  │ HTTP + Basic Auth（公网建议升级为 HTTPS）
  ▼
Nginx ── 静态文件 ──> Vue
  ├── /api/*       ──> 127.0.0.1:10290 ──> backend/app.py
  └── /admin-api/* ──> 127.0.0.1:10291 ──> backend/admin_app.py ──> SQLite
```

- 本应用对外只需要 HTTP 80；启用 HTTPS 后还需要 443。SSH、VPN 等管理端口按实际运维策略保留。
- 10290 和 10291 必须仅绑定 loopback，不能直接暴露到公网或不可信内网。
- `admin_app.py` 没有应用层登录功能，`/admin/` 与 `/admin-api/` 的认证完全依赖 Nginx。
- Basic Auth 只编码、不加密凭据。本文给出 HTTP 示例；公网、公共 Wi-Fi 或其他不可信网络强烈建议使用 HTTPS。
- 管理员后端应保持单 worker；普通查询后端可以使用多个 worker。
- 两个后端必须指向同一份 SQLite 数据库。

## 1. 系统依赖

```bash
sudo apt update
sudo apt install -y git nginx sqlite3 apache2-utils python3 python3-venv python3-pip rsync
```

版本要求：

- Python 3.9 或更高版本，推荐使用 CI 验证过的 Python 3.11
- Node.js `^20.19.0` 或 `>=22.12.0`

如果服务器负责构建前端，还需要从受支持的发行渠道安装 Node.js。开始前检查：

```bash
python3 --version
node --version
npm --version
sqlite3 --version
nginx -v
```

版本不满足要求时先停止部署并升级。也可以在可信构建环境生成 `frontend/dist/`，服务器只发布构建产物。

## 2. 服务用户与代码

创建无登录运行用户和运行数据目录：

```bash
sudo useradd --system --create-home \
  --home-dir /var/lib/nsh-match-analytics \
  --shell /usr/sbin/nologin nsh

sudo install -d -o nsh -g nsh -m 0700 /var/lib/nsh-match-analytics
sudo install -d -o nsh -g nsh -m 0700 /var/lib/nsh-match-analytics/admin-upload
sudo install -d -o nsh -g nsh -m 0700 /var/backups/nsh-match-analytics
```

代码应由部署管理员而不是运行用户持有。以下命令以当前登录用户作为部署管理员：

```bash
sudo install -d -o "$USER" -g "$(id -gn)" -m 0755 /opt/nsh-match-analytics
git clone https://github.com/mzq-dtm/nsh-match-analytics.git /opt/nsh-match-analytics
cd /opt/nsh-match-analytics
chmod -R go-w /opt/nsh-match-analytics
chmod -R a+rX /opt/nsh-match-analytics
```

不要把项目部署在 `/root`。确认 `nsh` 能读取并遍历代码，但不能写入源码和虚拟环境：

```bash
sudo -u nsh test -r /opt/nsh-match-analytics/backend/app.py
sudo -u nsh test -x /opt/nsh-match-analytics/backend
sudo -u nsh test ! -w /opt/nsh-match-analytics/backend/app.py
```

## 3. 初始化数据库

下面的子 shell 使用 `set -eu`：任一步失败都会停止，避免继续操作半初始化数据库。它先在代码目录临时初始化并录入本帮名称，再把完成的数据库安装到运行数据目录。

```bash
(
  set -eu
  umask 077
  cd /opt/nsh-match-analytics/database

  test ! -e game_league.db
  sudo test ! -e /var/lib/nsh-match-analytics/game_league.db

  sqlite3 game_league.db < schema.sql
  sqlite3 game_league.db < init_data.sql
  python3 insert_home_guild.py

  sudo install -o nsh -g nsh -m 0640 game_league.db \
    /var/lib/nsh-match-analytics/game_league.db
  rm game_league.db
)
```

如果初始化中途失败，生产数据库不会被覆盖；检查错误后删除代码目录中未完成的 `database/game_league.db`，再重新执行。

检查数据库：

```bash
sudo -u nsh sqlite3 /var/lib/nsh-match-analytics/game_league.db \
  'PRAGMA quick_check; PRAGMA foreign_key_check;'
```

`quick_check` 应输出 `ok`，`foreign_key_check` 应不输出任何记录。

## 4. 后端依赖和配置

```bash
cd /opt/nsh-match-analytics
python3 -m venv backend/venv
backend/venv/bin/python -m pip install --upgrade pip
backend/venv/bin/pip install -r backend/requirements.txt
chmod -R go-w backend
chmod -R a+rX backend
```

编辑 `backend/config.py`，生产环境建议全部使用绝对路径：

```python
class Config:
    DATABASE = "/var/lib/nsh-match-analytics/game_league.db"
    ADMIN_UPLOAD_DIR = "/var/lib/nsh-match-analytics/admin-upload"
    DB_BACKUP_DIR = "/var/backups/nsh-match-analytics"
```

保存一份生产配置参考，用于后续更新时重新核对：

```bash
sudo install -d -o root -g root -m 0755 /etc/nsh-match-analytics
sudo install -o root -g root -m 0644 backend/config.py \
  /etc/nsh-match-analytics/backend-config.py.reference
```

确认运行用户权限和路径：

```bash
sudo -u nsh test -r /var/lib/nsh-match-analytics/game_league.db
sudo -u nsh test -w /var/lib/nsh-match-analytics/game_league.db
sudo -u nsh test -w /var/lib/nsh-match-analytics
sudo -u nsh test -w /var/lib/nsh-match-analytics/admin-upload
sudo -u nsh test -w /var/backups/nsh-match-analytics
(cd backend && sudo -u nsh venv/bin/python -c "import app")
(cd backend && sudo -u nsh venv/bin/python -c "import admin_app")
```

SQLite 写入时需要在数据库旁创建 journal 文件，因此数据库文件及其父目录都必须允许 `nsh` 写入。

## 5. systemd 服务

创建 `/etc/systemd/system/nsh-backend.service`：

```ini
[Unit]
Description=NSH Match Analytics read API
After=network.target

[Service]
Type=simple
User=nsh
Group=nsh
WorkingDirectory=/opt/nsh-match-analytics/backend
Environment=PYTHONUNBUFFERED=1
UMask=0077
ExecStart=/opt/nsh-match-analytics/backend/venv/bin/gunicorn --workers 4 --bind 127.0.0.1:10290 --access-logfile - --error-logfile - app:app
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

创建 `/etc/systemd/system/nsh-admin.service`：

```ini
[Unit]
Description=NSH Match Analytics admin import API
After=network.target

[Service]
Type=simple
User=nsh
Group=nsh
WorkingDirectory=/opt/nsh-match-analytics/backend
Environment=PYTHONUNBUFFERED=1
UMask=0077
ExecStart=/opt/nsh-match-analytics/backend/venv/bin/gunicorn --workers 1 --bind 127.0.0.1:10291 --access-logfile - --error-logfile - admin_app:app
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

加载并启动：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now nsh-backend nsh-admin
sudo systemctl status nsh-backend nsh-admin --no-pager
```

确认端口只监听本机：

```bash
ss -ltn | grep -E '127\.0\.0\.1:(10290|10291)'
```

Gunicorn 默认请求超时为 30 秒。数据库较大时，导入前备份可能超过该时间；应根据实际数据量压测，并同时调整 Gunicorn `--timeout` 与 Nginx `proxy_read_timeout`，不要只改其中一处。

## 6. 构建和发布前端

构建：

```bash
cd /opt/nsh-match-analytics/frontend
npm ci
npm run build
```

使用版本目录发布，避免更新过程中先删除旧的哈希资源。以下代码块应整体执行：

```bash
(
  set -eu
  release_id="$(date +%Y%m%d-%H%M%S)"
  release_dir="/var/www/nsh-match-analytics/releases/$release_id"

  sudo test ! -e "$release_dir"
  sudo install -d -o root -g www-data -m 0755 /var/www/nsh-match-analytics
  sudo install -d -o root -g www-data -m 0755 "$release_dir"
  sudo rsync -a dist/ "$release_dir/"
  sudo chown -R root:www-data "$release_dir"
  sudo find "$release_dir" -type d -exec chmod 0755 {} +
  sudo find "$release_dir" -type f -exec chmod 0644 {} +

  sudo test ! -e /var/www/nsh-match-analytics/current.next
  sudo ln -s "$release_dir" /var/www/nsh-match-analytics/current.next
  sudo mv -Tf /var/www/nsh-match-analytics/current.next \
    /var/www/nsh-match-analytics/current
)
```

Nginx 只读取静态文件，不需要写权限。旧 release 可在确认新版本稳定后按保留策略清理。

## 7. 访问账号

普通用户使用 viewer 密码文件，管理员使用 admin 密码文件。管理员还必须加入 viewer 文件，因为公共静态资源和返回普通页面的请求仍受 viewer 认证保护。

首次创建：

```bash
sudo htpasswd -c /etc/nginx/.htpasswd-viewer 普通用户名
sudo htpasswd /etc/nginx/.htpasswd-viewer 管理员用户名
sudo htpasswd -c /etc/nginx/.htpasswd-admin 管理员用户名
sudo chown root:www-data /etc/nginx/.htpasswd-viewer /etc/nginx/.htpasswd-admin
sudo chmod 0640 /etc/nginx/.htpasswd-viewer /etc/nginx/.htpasswd-admin
```

建议为管理员在两个文件中设置相同密码。`-c` 只用于首次创建文件；以后新增或修改用户时不要使用 `-c`，否则会覆盖已有账号。

## 8. Nginx（HTTP 示例）

以下配置使用 HTTP，可直接用于本机测试或可信内网。请根据实际域名修改 `server_name`；没有域名时可以保留 `_`。

创建 `/etc/nginx/sites-available/nsh-match-analytics`：

```nginx
server {
    listen 80;
    server_name _;

    root /var/www/nsh-match-analytics/current;
    index index.html;

    auth_basic "NSH Viewer";
    auth_basic_user_file /etc/nginx/.htpasswd-viewer;

    location /api/ {
        proxy_pass http://127.0.0.1:10290;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location = /admin {
        return 301 /admin/;
    }

    location ^~ /admin/ {
        auth_basic "NSH Admin";
        auth_basic_user_file /etc/nginx/.htpasswd-admin;
        try_files $uri $uri/ /index.html;
    }

    location ^~ /admin-api/ {
        auth_basic "NSH Admin";
        auth_basic_user_file /etc/nginx/.htpasswd-admin;

        client_max_body_size 16m;
        proxy_pass http://127.0.0.1:10291;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

启用配置：

```bash
(
  set -eu
  sudo test ! -e /etc/nginx/sites-enabled/nsh-match-analytics
  sudo ln -s /etc/nginx/sites-available/nsh-match-analytics \
    /etc/nginx/sites-enabled/nsh-match-analytics
  sudo rm -f /etc/nginx/sites-enabled/default
  sudo nginx -t
  sudo systemctl reload nginx
)
```

站点已经启用时不要重复创建链接；修改配置后只需执行 `nginx -t` 和 reload。

> **HTTPS 建议：** Basic Auth 在 HTTP 中不会加密密码。公网或不可信网络部署时，建议使用 Certbot、云平台证书或组织内部 CA 增加 443 TLS server，并将 80 请求重定向到固定 HTTPS 域名。还应配置证书自动续期并定期验证续期任务。

## 9. 部署验证

先绕过 Nginx 检查本机进程：

```bash
curl -fsS http://127.0.0.1:10290/api/matches
curl -fsS http://127.0.0.1:10291/admin-api/health
```

管理员健康接口只证明进程正在响应，不检查数据库、上传目录或备份目录。继续检查数据库：

```bash
sudo -u nsh sqlite3 /var/lib/nsh-match-analytics/game_league.db \
  'PRAGMA quick_check; PRAGMA foreign_key_check;'
```

最后通过 Nginx 和 Basic Auth 检查完整链路。`curl -u 用户名` 会交互询问密码，避免把密码写进 shell 历史。以下 HTTP 检查只应在服务器本机或可信内网执行：

```bash
curl -fsS -u 普通用户名 http://服务器地址/api/matches
curl -fsS -u 管理员用户名 http://服务器地址/admin-api/health
```

浏览器检查：

- `http://服务器地址/`
- `http://服务器地址/admin/import`

## 10. 更新部署

更新会修改源码和虚拟环境，因此先停止两个后端。开始前运行 `git status --short`；除生产配置和被忽略的构建产物外，如果还有未确认修改，应先停止更新并查明来源。

配置文件属于 Git 跟踪文件，必须先保存参考副本，再恢复仓库版本以便快进更新：

```bash
(
  set -eu
  cd /opt/nsh-match-analytics
  sudo systemctl stop nsh-admin nsh-backend
  if sudo systemctl is-active --quiet nsh-admin || \
     sudo systemctl is-active --quiet nsh-backend; then
    echo "后端服务仍在运行，终止更新" >&2
    exit 1
  fi

  backup_path="/var/backups/nsh-match-analytics/manual-before-update-$(date +%Y-%m-%d_%H-%M-%S).db"
  sudo -u nsh test ! -e "$backup_path"
  sudo -u nsh sqlite3 /var/lib/nsh-match-analytics/game_league.db \
    ".backup '$backup_path'"
  test "$(sudo -u nsh sqlite3 "$backup_path" 'PRAGMA integrity_check;')" = "ok"
  test -z "$(sudo -u nsh sqlite3 "$backup_path" 'PRAGMA foreign_key_check;')"

  sudo install -o root -g root -m 0644 backend/config.py \
    /etc/nsh-match-analytics/backend-config.py.reference

  git restore backend/config.py
  git pull --ff-only
)
```

此时先停下来，对照 `/etc/nsh-match-analytics/backend-config.py.reference` 和新版本配置结构，在 `backend/config.py` 中重新填写 `DATABASE`、`ADMIN_UPLOAD_DIR`、`DB_BACKUP_DIR`。不能直接用旧文件覆盖新文件，因为新版本可能增加配置项。确认三个路径正确后再继续：

```bash
(
  set -eu
  cd /opt/nsh-match-analytics

  grep -Fq 'DATABASE = "/var/lib/nsh-match-analytics/game_league.db"' backend/config.py
  grep -Fq 'ADMIN_UPLOAD_DIR = "/var/lib/nsh-match-analytics/admin-upload"' backend/config.py
  grep -Fq 'DB_BACKUP_DIR = "/var/backups/nsh-match-analytics"' backend/config.py

  sudo install -o root -g root -m 0644 backend/config.py \
    /etc/nsh-match-analytics/backend-config.py.reference

  backend/venv/bin/pip install -r backend/requirements.txt
  chmod -R go-w backend
  chmod -R a+rX backend
  (cd backend && sudo -u nsh venv/bin/python -c "import app")
  (cd backend && sudo -u nsh venv/bin/python -c "import admin_app")

  cd frontend
  npm ci
  npm run build
)
```

重新按“构建和发布前端”的版本目录命令发布 `dist/`，然后执行：

```bash
sudo systemctl restart nsh-backend nsh-admin
sudo systemctl reload nginx
```

任一步失败时不要直接启动不完整的新版本。先查看错误，必要时将代码回退到更新前提交、恢复配置参考和数据库手工备份，再启动服务。完成后重新执行全部部署验证。

## 备份与恢复

### 自动备份行为

每次最终导入在写数据库前，管理员服务使用 SQLite Online Backup API 创建：

```text
DB_BACKUP_DIR/YYYY-MM-DD_HH-MM-SS.db
```

- 时间使用服务器本地时间，精确到秒。
- 备份失败会终止并回滚本次导入。
- 如果备份成功但后续写入失败，备份文件可能仍会保留。
- 系统不会自动删除旧备份，目录会持续增长。
- 同一磁盘上的自动备份不能替代异机或对象存储备份。

应监控容量并定期复制到其他存储。删除前先列出候选文件：

```bash
sudo -u nsh find /var/backups/nsh-match-analytics \
  -maxdepth 1 -type f -name '*.db' -mtime +90 -print
```

确认异地副本和保留策略后，才执行：

```bash
sudo -u nsh find /var/backups/nsh-match-analytics \
  -maxdepth 1 -type f -name '*.db' -mtime +90 -delete
```

### 恢复数据库

不要在后端运行时覆盖 SQLite 文件。假设要恢复：

```text
/var/backups/nsh-match-analytics/2026-08-18_20-30-00.db
```

以下代码块必须整体执行。先把 `restore_source` 改成要恢复的明确文件；流程会在停服务前验证源文件，复制当前生产库作为唯一安全副本，将目标备份复制到数据库同目录的暂存文件，检查完整性和 8 张必需业务表，最后才原子替换生产库：

```bash
(
  set -eu

  database="/var/lib/nsh-match-analytics/game_league.db"
  restore_source="/var/backups/nsh-match-analytics/2026-08-18_20-30-00.db"
  timestamp="$(date +%Y-%m-%d_%H-%M-%S)"
  safety_copy="/var/backups/nsh-match-analytics/manual-before-restore-$timestamp.db"
  staged_database="/var/lib/nsh-match-analytics/.restore-$timestamp.db"

  sudo -u nsh test -f "$database"
  sudo -u nsh test -f "$restore_source"
  sudo -u nsh test ! -e "$safety_copy"
  sudo -u nsh test ! -e "$staged_database"
  test "$(sudo -u nsh sqlite3 "$restore_source" 'PRAGMA integrity_check;')" = "ok"
  test -z "$(sudo -u nsh sqlite3 "$restore_source" 'PRAGMA foreign_key_check;')"

  sudo systemctl stop nsh-admin nsh-backend
  if sudo systemctl is-active --quiet nsh-admin || \
     sudo systemctl is-active --quiet nsh-backend; then
    echo "后端服务仍在运行，终止恢复" >&2
    exit 1
  fi

  sudo -u nsh cp "$database" "$safety_copy"
  echo "恢复前安全副本：$safety_copy"

  sudo -u nsh cp "$restore_source" "$staged_database"
  trap 'sudo -u nsh rm -f -- "$staged_database"' 0
  sudo -u nsh chmod 0640 "$staged_database"

  test "$(sudo -u nsh sqlite3 "$staged_database" 'PRAGMA integrity_check;')" = "ok"
  test -z "$(sudo -u nsh sqlite3 "$staged_database" 'PRAGMA foreign_key_check;')"
  required_tables="$(sudo -u nsh sqlite3 "$staged_database" \
    "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN \
    ('guilds','players','nickname_history','professions','matches', \
     'match_performance','match_results','opponent_match_performance');")"
  test "$required_tables" -eq 8

  sudo -u nsh mv -f "$staged_database" "$database"
  trap - 0
  sudo systemctl start nsh-backend nsh-admin
)
```

任一步失败时不要手工删除生产数据库，也不要在原因不明时启动服务。如果需要回滚，把上面代码中的 `restore_source` 改成终端输出的 `manual-before-restore-*.db` 安全副本，再重新执行同一套恢复流程。确认恢复结果之前不要删除安全副本。

## 暂存文件

管理员预检会把两份 CSV 和元数据保存到：

```text
ADMIN_UPLOAD_DIR/<随机令牌>/
```

- 预检有效期为 1 小时。
- 预检失败或提交成功时立即删除对应目录。
- 放弃或过期的预检只会在下一次 preview/commit 请求开始时惰性清理；长时间没有管理请求时仍可能占用磁盘。
- CSV 可能包含帮会成员信息，上传目录应保持 `0700`，不能由 Nginx 提供静态访问。
- 手动清理会令所有尚未提交的预检失效，必须先停止 `nsh-admin`。

检查超过 2 小时的暂存目录：

```bash
sudo -u nsh find /var/lib/nsh-match-analytics/admin-upload \
  -mindepth 1 -maxdepth 1 -type d -mmin +120 -print
```

确认没有需要提交的预检后，可在停止管理员服务期间清理：

```bash
sudo systemctl stop nsh-admin
sudo -u nsh find /var/lib/nsh-match-analytics/admin-upload \
  -mindepth 1 -maxdepth 1 -type d -mmin +120 -exec rm -rf -- {} +
sudo systemctl start nsh-admin
```

该命令只针对 `admin-upload` 的一级令牌目录，绝不能把备份目录作为清理目标。

## 日志与排障

```bash
sudo systemctl status nsh-backend nsh-admin --no-pager
sudo journalctl -u nsh-admin -n 200 --no-pager
sudo journalctl -u nsh-backend -n 200 --no-pager
sudo journalctl -u nsh-admin -f
sudo nginx -t
sudo tail -n 200 /var/log/nginx/access.log
sudo tail -n 200 /var/log/nginx/error.log
ss -ltn | grep -E ':(80|10290|10291)'
df -h
df -i
sudo -u nsh du -sh /var/backups/nsh-match-analytics \
  /var/lib/nsh-match-analytics/admin-upload
```

| 现象 | 优先检查 |
| --- | --- |
| `401 Unauthorized` | 用户是否写入正确密码文件；管理员是否同时存在于 viewer/admin 文件；密码文件是否可被 Nginx 读取 |
| `403 Forbidden` | Nginx 静态目录、符号链接目标和密码文件权限；父目录是否可遍历 |
| 刷新 `/admin/import` 得到 404 | `/admin/` 是否使用 `try_files ... /index.html` |
| `413 Request Entity Too Large` | 两份文件与 multipart 合计是否超过 16 MiB；Nginx 和 Flask 限制是否一致 |
| `502 Bad Gateway` | 对应 Gunicorn 服务状态、监听地址和端口 |
| 数据库只读或无法打开 | `Config.DATABASE` 是否正确；数据库文件及父目录是否允许 `nsh` 写入 |
| `no such table` | 两个后端是否打开了错误或新建的空数据库；优先检查绝对路径和 `WorkingDirectory` |
| 创建备份失败 | 备份目录权限、数据库读取权限、磁盘空间和 inode |
| 数据库被锁定 | 是否有其他写入进程；等待后重试，不要绕过事务保护 |
| 预检失效或数据库已变化 | 其他导入在预检后完成；重新上传并预检 |

返回 [README](../README.md)。
