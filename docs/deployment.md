# 生产部署指南

本文说明如何在 Ubuntu 服务器上部署 nsh-match-analytics。示例使用：

- 代码目录：`/opt/nsh-match-analytics`
- 运行用户：`nsh`
- 数据库：`/var/lib/nsh-match-analytics/game_league.db`
- 上传暂存：`/var/lib/nsh-match-analytics/admin-upload`
- 数据库备份：`/var/backups/nsh-match-analytics`
- 前端发布目录：`/var/www/nsh-match-analytics`
- 查询后端：`127.0.0.1:10290`
- 管理员后端：`127.0.0.1:10291`

部署前建议先阅读[系统架构](architecture.md)和[管理员导入指南](admin-import.md)。请根据实际服务器调整域名和目录。

数据库初始化步骤只适用于全新安装。已有生产数据库绝不能重新执行 `schema.sql`；`init_data.sql` 也不是通用迁移机制，只能按本文“更新部署”中的兼容性检查使用。

## 架构与安全边界

```text
浏览器
  │ HTTPS + Basic Auth
  ▼
Nginx ── 静态文件 ──> Vue
  ├── /api/*       ──> 127.0.0.1:10290 ──> backend/app.py ──────────────────┐
  └── /admin-api/* ──> 127.0.0.1:10291 ──> backend/admin_app.py ─┬──────────┴─> SQLite
                                                               ├─> 上传暂存目录
                                                               └─> 备份目录
```

- 可信内网可以只开放 HTTP 80；公网、公共 Wi-Fi 或其他不可信网络必须使用 HTTPS 443，并将 HTTP 重定向到 HTTPS。SSH、VPN 等管理端口按实际运维策略保留。
- 10290 和 10291 必须仅绑定 loopback，不能直接暴露到公网或不可信内网。
- 两个 Flask 应用都没有应用层登录功能；普通页面/API 和 `/admin/`、`/admin-api/` 的认证均依赖 Nginx。
- Basic Auth 只编码、不加密凭据。本文的 HTTP Nginx 配置仅供本机或可信内网使用，不能原样用于公网。
- 管理员后端应保持单 worker；查询后端可以使用多个 worker。
- 两个后端必须指向同一份 SQLite 数据库。

## 1. 系统依赖

```bash
sudo apt update
sudo apt install -y git nginx sqlite3 apache2-utils python3 python3-venv python3-pip rsync
```

版本要求：

- Python 3.9 或更高版本，推荐使用 CI 验证过的 Python 3.11
- Node.js `^20.19.0` 或 `>=22.12.0`

如果服务器负责构建前端，还需要从受支持的发行渠道安装 Node.js。开始前检查；使用外部前端构建产物时，可以跳过 `node` 和 `npm` 两项：

```bash
python3 --version
# 以下两项仅在服务器构建前端时需要
node --version
npm --version
sqlite3 --version
nginx -v
timedatectl show --property=Timezone --value
```

版本不满足要求时先停止部署并升级。比赛文件名和数据库时间目前按中国本地时间解释，服务器时区应设置为 `Asia/Shanghai`，避免备份名称、日志和业务时间难以对应。也可以在可信构建环境生成 `frontend/dist/`，服务器只发布构建产物。

如果使用外部构建产物，服务器不需要 Node.js；但构建机必须检出与后端相同的提交或标签，并将提交号、产物校验和一并交付。第 6 节分别给出两种构建方式。

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

### 已有生产库登记更名后的本帮名称

一份数据库仍只表示一个逻辑本帮；本节仅用于同一帮会更名，不能用来把另一个独立帮会加入同库。新名称必须满足[管理员导入指南的文本约束](admin-import.md#文本字段)，并与后续联赛 CSV 完全一致。保留旧名称，才能继续解释历史比赛。

在已经运行的生产环境中，先停止两个后端并创建手工备份，再让初始化脚本明确指向生产库：

```bash
(
  set -eu
  cd /opt/nsh-match-analytics/database
  database="/var/lib/nsh-match-analytics/game_league.db"
  backup_path="/var/backups/nsh-match-analytics/manual-before-guild-rename-$(date +%Y-%m-%d_%H-%M-%S).db"

  sudo -u nsh test -f "$database"
  sudo -u nsh test ! -e "$backup_path"
  sudo systemctl stop nsh-admin nsh-backend
  if sudo systemctl is-active --quiet nsh-admin || \
     sudo systemctl is-active --quiet nsh-backend; then
    echo "后端服务仍在运行，终止本帮名称登记" >&2
    exit 1
  fi

  sudo -u nsh sqlite3 "$database" ".backup '$backup_path'"
  test "$(sudo -u nsh sqlite3 "$backup_path" 'PRAGMA integrity_check;')" = "ok"
  test -z "$(sudo -u nsh sqlite3 "$backup_path" 'PRAGMA foreign_key_check;')"

  sudo -u nsh python3 -c 'from config import Config; Config.DATABASE="/var/lib/nsh-match-analytics/game_league.db"; from insert_home_guild import main; main()'

  test "$(sudo -u nsh sqlite3 "$database" 'PRAGMA integrity_check;')" = "ok"
  test -z "$(sudo -u nsh sqlite3 "$database" 'PRAGMA foreign_key_check;')"
  sudo systemctl start nsh-backend nsh-admin
)
```

脚本会交互询问新名称，并在名称已存在时保持数据库不变。任一步失败时服务会保持停止；先检查原因和刚创建的备份，不要跳过完整性检查直接启动。完成后使用新名称做下一场导入预检，并确认旧比赛仍可查询。

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

### 6.1 构建前定制

当前站点名称和默认本帮尚未集中到环境配置。首次部署以及前端相关更新后，应检查以下构建期内容：

| 文件 | 需要核对的内容 |
| --- | --- |
| `frontend/src/components/AdminImport.vue` | 管理员导入页的默认本帮名称 |
| `frontend/src/components/AppFooter.vue` | Footer 左侧文字、ICP备案文字和 GitHub 链接 |
| `frontend/index.html` | 页面标题和 favicon |

这些值会写入前端构建产物，修改后必须重新构建。它们目前属于 Git 跟踪内容；部署方应在自己的受控分支或 fork 中提交定制，使 `git rev-parse HEAD` 能唯一对应实际构建源码。不要把未提交的前端定制长期留在生产工作树，也不要在更新时用旧文件整体覆盖新版本。

### 6.2 选择构建方式

方式一是在服务器构建：

```bash
cd /opt/nsh-match-analytics/frontend
npm ci
npm run build
```

构建结果位于：

```text
/opt/nsh-match-analytics/frontend/dist
```

方式二是在可信构建机生成产物：

```bash
git checkout 要部署的提交或标签
cd frontend
npm ci
npm run build
tar -C dist -czf nsh-match-analytics-frontend.tar.gz .
sha256sum nsh-match-analytics-frontend.tar.gz
git rev-parse HEAD
```

通过可信通道把压缩包、SHA-256 和提交号传到服务器。核对提交号与后端版本一致、校验和无误后，解压到仅供本次发布使用的新目录，例如 `/var/tmp/nsh-match-analytics-dist-提交号`。不要接收来源不明的构建产物，也不要把旧 `dist/` 与新产物混合。

### 6.3 发布

使用版本目录发布，避免更新过程中先删除旧的哈希资源。先明确导出本次构建产物目录；服务器构建和外部构建分别选择一条：

```bash
# 服务器构建
export NSH_FRONTEND_DIST=/opt/nsh-match-analytics/frontend/dist

# 外部构建：改为本次新解压且已核验的绝对路径
# export NSH_FRONTEND_DIST=/var/tmp/nsh-match-analytics-dist-提交号
```

发布代码块未取得该变量时会立即退出，避免误发仓库里残留的旧 `dist/`。以下代码块应整体执行：

```bash
(
  set -eu
  dist_dir="${NSH_FRONTEND_DIST:?请先设置本次前端构建产物目录}"
  release_id="$(date +%Y%m%d-%H%M%S)"
  release_dir="/var/www/nsh-match-analytics/releases/$release_id"

  test -f "$dist_dir/index.html"
  test -d "$dist_dir/assets"
  sudo test ! -e "$release_dir"
  sudo install -d -o root -g www-data -m 0755 /var/www/nsh-match-analytics
  sudo install -d -o root -g www-data -m 0755 "$release_dir"
  sudo rsync -a "$dist_dir/" "$release_dir/"
  sudo chown -R root:www-data "$release_dir"
  sudo find "$release_dir" -type d -exec chmod 0755 {} +
  sudo find "$release_dir" -type f -exec chmod 0644 {} +

  sudo test ! -e /var/www/nsh-match-analytics/current.next
  sudo ln -s "$release_dir" /var/www/nsh-match-analytics/current.next
  sudo mv -Tf /var/www/nsh-match-analytics/current.next \
    /var/www/nsh-match-analytics/current
)
```

Nginx 只读取静态文件，不需要写权限。记录本次 `release_dir`、Git 提交号和数据库备份文件。旧 release 可在确认新版本稳定后按保留策略清理；至少保留一个已验证版本，以便前端快速回切。

## 7. 访问账号

普通用户使用 viewer 密码文件，管理员使用 admin 密码文件。管理员还必须加入 viewer 文件，因为公共静态资源和返回普通页面的请求仍受 viewer 认证保护。

首次创建：

```bash
sudo htpasswd -cB /etc/nginx/.htpasswd-viewer 普通用户名
sudo htpasswd -B /etc/nginx/.htpasswd-viewer 管理员用户名
sudo htpasswd -cB /etc/nginx/.htpasswd-admin 管理员用户名
sudo chown root:www-data /etc/nginx/.htpasswd-viewer /etc/nginx/.htpasswd-admin
sudo chmod 0640 /etc/nginx/.htpasswd-viewer /etc/nginx/.htpasswd-admin
```

示例使用 `-B` 创建 bcrypt 密码摘要。建议为管理员在两个文件中设置相同密码。`-c` 只用于首次创建文件；以后新增或修改用户时不要使用 `-c`，否则会覆盖已有账号。

## 8. Nginx（仅限可信网络的 HTTP 示例）

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
  new_link="/etc/nginx/sites-enabled/nsh-match-analytics"
  default_link="/etc/nginx/sites-enabled/default"
  default_backup="/etc/nginx/default-site.disabled"
  new_created=0
  default_moved=0

  rollback_nginx_files() {
    if [ "$new_created" -eq 1 ]; then
      sudo rm -f -- "$new_link"
    fi
    if [ "$default_moved" -eq 1 ]; then
      sudo mv "$default_backup" "$default_link"
    fi
  }
  trap rollback_nginx_files EXIT

  sudo test ! -e "$new_link"
  sudo test ! -e "$default_backup"
  sudo ln -s /etc/nginx/sites-available/nsh-match-analytics "$new_link"
  new_created=1
  if sudo test -e "$default_link"; then
    sudo mv "$default_link" "$default_backup"
    default_moved=1
  fi

  sudo nginx -t
  sudo systemctl reload nginx
  trap - EXIT
)
```

站点已经启用时不要重复创建链接；修改配置后只需执行 `nginx -t` 和 reload。首次启用失败时，上述 trap 会移除新链接并恢复默认站点；成功后，如果原默认链接存在，它会保留在 `/etc/nginx/default-site.disabled`，确认新站点稳定后再按运维策略处理。

> **公网部署要求：** Basic Auth 在 HTTP 中不会加密密码。公网或不可信网络必须使用 Certbot、云平台证书或组织内部 CA 配置 443 TLS server，并将 80 请求重定向到固定 HTTPS 域名；在 HTTPS 完整链路验证通过前，不要输入 viewer 或管理员凭据。部署完成后还要验证证书自动续期。管理员入口宜进一步限制在 VPN 或 IP allowlist 内。

### 公网 HTTPS 配置骨架

先通过受信任的证书服务取得证书和私钥，并把下面的域名与证书路径改成实际值。公网配置应以两个 server 块替换上一节的 HTTP server：80 只做固定域名重定向，页面和 API 只在 443 提供。

```nginx
server {
    listen 80;
    server_name league.example.com;
    return 301 https://league.example.com$request_uri;
}

server {
    listen 443 ssl;
    server_name league.example.com;

    ssl_certificate /etc/ssl/nsh-match-analytics/fullchain.pem;
    ssl_certificate_key /etc/ssl/nsh-match-analytics/privkey.pem;

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

如果证书服务提供受维护的 TLS 参数片段，应按其说明在 443 server 中引用。不要在证书和续期链路尚未稳定前启用长期 HSTS。应用配置后执行：

```bash
sudo nginx -t
sudo systemctl reload nginx
curl -fsSI http://league.example.com/
curl -fsS -u 普通用户名 https://league.example.com/api/matches
curl -fsS -u 管理员用户名 https://league.example.com/admin-api/health
```

第一条 HTTP 请求应只重定向到固定 HTTPS 域名；后两条命令会交互询问密码。还必须按证书服务商提供的方式执行一次续期 dry-run，并确认续期计时器或任务处于启用状态。任何 TLS 验证失败都应先修复，不能回退为通过公网传输 Basic Auth。

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

以上地址只适用于本机或可信内网。公网部署必须改用 `https://`，并额外确认访问 HTTP 地址会重定向到固定 HTTPS 域名、证书有效且管理员页面不会通过 HTTP 返回内容。

## 10. 更新部署

更新会修改源码、虚拟环境和前端发布版本，数据库种子也可能变化。开始前运行 `git status --short`；除生产配置和被忽略的构建产物外，如果还有未确认修改，应先停止更新并查明来源。

先记录当前代码和前端发布版本，发生问题时不要凭记忆选择回退目标：

```bash
cd /opt/nsh-match-analytics
git rev-parse HEAD
readlink -f /var/www/nsh-match-analytics/current
```

把两项输出保存到本次变更记录，然后再停止两个后端。

如果站点使用自有分支或 fork 保存前端定制，应先在代码托管或测试环境完成上游合并、构建检查和冲突处理，再让生产仓库快进到已经验证的部署提交。下文的 `git pull --ff-only` 不负责临时重放未提交定制。

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

### 10.1 检查数据库兼容性

本仓库当前没有通用的 schema 迁移工具。拉取代码后，先把 `更新前提交` 替换为刚才记录的提交号，检查数据库文件变化：

```bash
cd /opt/nsh-match-analytics
git diff 更新前提交..HEAD -- database/schema.sql database/init_data.sql
```

处理原则：

- 如果 `schema.sql` 有变化，不得对生产库执行它，也不得直接启动新代码；必须先取得目标版本明确提供的迁移和回滚步骤。
- `init_data.sql` 不是通用迁移脚本。当前文件只包含 `INSERT OR IGNORE` 的基础记录，可在已经完成手工备份且服务保持停止的前提下，用来补齐当前版本所需的职业种子；未来更新仍必须先检查差异。

确认当前 `init_data.sql` 没有删除或更新语句后，执行并验证当前种子：

```bash
(
  set -eu
  cd /opt/nsh-match-analytics
  database="/var/lib/nsh-match-analytics/game_league.db"

  sudo -u nsh sqlite3 "$database" < database/init_data.sql
  required_professions="$(sudo -u nsh sqlite3 "$database" "SELECT COUNT(DISTINCT profession_name) FROM professions WHERE profession_name IN ('血河','铁衣','素问','九灵','神相','碎梦','龙吟','玄机','鸿音','荒羽','潮光','沧澜','云瑶','瑶光','修罗');")"
  test "$required_professions" -eq 15
  required_sentinels="$(sudo -u nsh sqlite3 "$database" "SELECT COUNT(*) FROM players p JOIN nickname_history n ON n.player_id = p.player_id JOIN guilds g ON g.guild_id = 10000 WHERE p.player_id = 0 AND n.nickname = '无' AND n.valid_from = '2016-01-01 00:00:00' AND n.valid_to IS NULL AND g.guild_name = '无';")"
  test "$required_sentinels" -ge 1
  test "$(sudo -u nsh sqlite3 "$database" 'PRAGMA integrity_check;')" = "ok"
  test -z "$(sudo -u nsh sqlite3 "$database" 'PRAGMA foreign_key_check;')"
)
```

这一步解决从较早数据库升级时缺少新职业的问题，但不替代将来的版本化 schema migration。任何检查失败都应停止更新，并保留更新前备份。

### 10.2 恢复配置、依赖和前端

对照 `/etc/nsh-match-analytics/backend-config.py.reference` 和新版本配置结构，在 `backend/config.py` 中重新填写 `DATABASE`、`ADMIN_UPLOAD_DIR`、`DB_BACKUP_DIR`。不能直接用旧文件覆盖新文件，因为新版本可能增加配置项。确认三个路径正确后再继续：

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
)
```

按第 6 节选择服务器构建或外部构建，并使用版本目录发布新的前端产物。随后执行：

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

以下代码块必须整体执行。先把 `restore_source` 改成要恢复的明确文件，并确认当前 `database/init_data.sql` 仍只包含事务和 `INSERT OR IGNORE` 基础数据。流程会在停服务前验证源文件，使用 SQLite Online Backup API 保存当前生产库，将目标备份复制到数据库同目录的暂存文件，补齐当前基础种子，检查完整性、8 张必需业务表和当前必需职业，最后才原子替换生产库：

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

  sudo -u nsh sqlite3 "$database" ".backup '$safety_copy'"
  test "$(sudo -u nsh sqlite3 "$safety_copy" 'PRAGMA integrity_check;')" = "ok"
  test -z "$(sudo -u nsh sqlite3 "$safety_copy" 'PRAGMA foreign_key_check;')"
  echo "恢复前安全副本：$safety_copy"

  sudo -u nsh cp "$restore_source" "$staged_database"
  trap 'sudo -u nsh rm -f -- "$staged_database"' 0
  sudo -u nsh chmod 0640 "$staged_database"
  sudo -u nsh sqlite3 "$staged_database" < /opt/nsh-match-analytics/database/init_data.sql

  test "$(sudo -u nsh sqlite3 "$staged_database" 'PRAGMA integrity_check;')" = "ok"
  test -z "$(sudo -u nsh sqlite3 "$staged_database" 'PRAGMA foreign_key_check;')"
  required_tables="$(sudo -u nsh sqlite3 "$staged_database" \
    "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN \
    ('guilds','players','nickname_history','professions','matches', \
     'match_performance','match_results','opponent_match_performance');")"
  test "$required_tables" -eq 8
  required_professions="$(sudo -u nsh sqlite3 "$staged_database" "SELECT COUNT(DISTINCT profession_name) FROM professions WHERE profession_name IN ('血河','铁衣','素问','九灵','神相','碎梦','龙吟','玄机','鸿音','荒羽','潮光','沧澜','云瑶','瑶光','修罗');")"
  test "$required_professions" -eq 15
  required_sentinels="$(sudo -u nsh sqlite3 "$staged_database" "SELECT COUNT(*) FROM players p JOIN nickname_history n ON n.player_id = p.player_id JOIN guilds g ON g.guild_id = 10000 WHERE p.player_id = 0 AND n.nickname = '无' AND n.valid_from = '2016-01-01 00:00:00' AND n.valid_to IS NULL AND g.guild_name = '无';")"
  test "$required_sentinels" -ge 1

  sudo -u nsh mv -f "$staged_database" "$database"
  trap - 0
  sudo systemctl start nsh-backend nsh-admin
)
```

任一步失败时不要手工删除生产数据库，也不要在原因不明时启动服务。如果需要回滚，把上面代码中的 `restore_source` 改成终端输出的 `manual-before-restore-*.db` 安全副本，再重新执行同一套恢复流程。确认恢复结果之前不要删除安全副本。

恢复过程会在暂存副本中补齐并校验当前基础种子，因此旧备份缺少后来新增的职业时不会提前开放管理员导入。如果未来版本需要表结构迁移，不能用本流程代替目标版本专用的迁移步骤。

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
(
  set -eu
  sudo systemctl stop nsh-admin
  if sudo systemctl is-active --quiet nsh-admin; then
    echo "管理员服务仍在运行，终止暂存清理" >&2
    exit 1
  fi

  sudo -u nsh find /var/lib/nsh-match-analytics/admin-upload \
    -mindepth 1 -maxdepth 1 -type d -mmin +120 -exec rm -rf -- {} +
  sudo systemctl start nsh-admin
)
```

该命令只针对 `admin-upload` 的一级令牌目录，绝不能把备份目录作为清理目标。清理或重启失败时服务会保持停止；检查日志和目录状态后再手工恢复，不要在原因不明时反复执行删除。

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

## 相关文档

- [README](../README.md)
- [管理员导入指南](admin-import.md)
- [系统架构](architecture.md)
- [API 文档](api.md)
