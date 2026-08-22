# HTTP API 文档

本文记录当前代码实现的 9 个查询接口和 3 个管理员接口。接口尚未使用 `/v1` 等版本前缀，也没有正式的向后兼容承诺；升级客户端前应核对服务端与前端来自同一版本。

## 1. 基础约定

### 1.1 地址与认证

| 环境 | 查询 API | 管理员 API |
| --- | --- | --- |
| 本地开发 | `http://127.0.0.1:5173/api/*`，由 Vite 代理 | `http://127.0.0.1:5173/admin-api/*`，由 Vite 代理 |
| 后端直连 | `http://127.0.0.1:10290/api/*` | `http://127.0.0.1:10291/admin-api/*` |
| 生产 | 与站点同源，由 Nginx 代理 | 与站点同源，由 Nginx 代理 |

两个 Flask 应用本身都不实现登录。生产部署示例使用 Nginx HTTP Basic Auth：

- `/api/*` 需要 viewer 账号；
- `/admin/` 和 `/admin-api/*` 需要 admin 账号；
- 管理员访问前端公共静态资源时还需要同时存在于 viewer 密码文件。

直连 10290/10291 不经过 Nginx，也就没有上述认证，因此两个端口必须仅监听可信本机。公网或不可信网络必须在 Basic Auth 外层使用 HTTPS。

### 1.2 数据格式

- 成功响应均为 JSON。
- 管理员接口的预期业务错误通常返回 `{"error":"..."}`。
- 查询后端仅对部分业务错误显式返回 JSON；未处理异常、错误方法和不存在路径可能使用 Flask/Werkzeug 默认 HTML 错误页。客户端不能假设所有失败响应都是 JSON。
- 时间字段来自 SQLite 无时区时间，通常形如 `YYYY-MM-DD HH:MM:SS`。
- 当前接口没有分页。玩家、比赛和出勤接口会一次返回全部匹配记录。

### 1.3 JavaScript 大整数与 ID

服务端的玩家 ID 校验范围是 `2..9223372036854775807`，SQLite 统计字段也可能达到 64 位有符号整数范围。当前接口存在两种不同表示：

- 管理员预检中的 `existing_id` 和提交时的 `player_ids` 使用十进制**字符串**，可以无损传递 64 位 ID；
- 查询接口中的 `player_id`、`match_id` 和各类整数统计通常是 JSON **number**，当前 TypeScript 类型也使用 `number`。

JavaScript 只能精确表示 `-9007199254740991..9007199254740991`（`Number.MIN_SAFE_INTEGER..Number.MAX_SAFE_INTEGER`）内的整数。超过该范围时，浏览器解析 JSON 就可能发生不可逆的舍入，影响玩家跳转、Map 键、比较、排序和提交后的显示。

在后端统一把 64 位整数序列化为字符串之前：

- 管理员和 API 调用者应优先使用不大于 `9007199254740991` 的玩家 ID；
- 对任何可能超过该值的 ID 或统计值，非 JavaScript 客户端应使用支持无损整数的 JSON 解析器；
- JavaScript 客户端不能仅在 `JSON.parse` 后再转 `BigInt`，因为精度可能已经丢失；
- 不应改变管理员提交 ID 必须为字符串的现有契约。

## 2. 查询接口（9 个）

查询接口由 `backend/app.py` 提供。

### 2.1 获取玩家完整历史

```http
GET /api/player_history/{player_id}
```

路径参数：

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `player_id` | 十进制路径整数 | 本帮稳定玩家 ID |

成功：`200 OK`，返回按比赛时间倒序排列的数组。

```json
[
  {
    "match_name": "本帮vs对手_2026_08_18_20_30_00.csv",
    "match_time": "2026-08-18 20:30:00",
    "nickname": "玩家甲",
    "profession": "血河",
    "equipment_score": 100000,
    "skill_score": 20000,
    "cultivation_score": 30000,
    "total_combat_power": 150000,
    "leader": "团长甲",
    "kills": 5,
    "assists": 10,
    "war_resources": 100,
    "damage_to_players": 200000,
    "damage_to_structures": 30000,
    "healing": 0,
    "damage_taken": 150000,
    "serious_injuries": 2,
    "skill_qingdeng": 0,
    "skill_huayu": 0,
    "control_count": 3,
    "KD": 2.5,
    "total_damage": 230000,
    "rank_kills": 3,
    "rank_damage_to_players": 4,
    "rank_damage_to_structures": 8,
    "rank_damage": 5,
    "rank_healing": 20
  }
]
```

Nullable 字段：

- `profession`：左连接职业表，数据库异常或旧数据下可能为 `null`；
- `leader`：比赛时间点无法匹配团长昵称历史时为 `null`；
- `equipment_score`、`skill_score`、`cultivation_score`、`total_combat_power`：schema 允许 `null`，旧数据可能为空。

排名范围是该场 `match_performance` 中的全部本帮玩家，并采用并列竞赛排名：严格大于当前值的人数加一。`KD = kills / max(serious_injuries, 1)`，`total_damage` 是对玩家伤害与对建筑伤害之和。

错误：

- `404` + `{"error":"Player not found or no match data available"}`：玩家不存在或没有战绩；
- 路径不是整数时由路由返回默认 `404`，响应可能是 HTML。

### 2.2 获取玩家选择列表

```http
GET /api/players
```

成功：`200 OK`。

```json
[
  {
    "player_id": 123456,
    "nicknames": ["当前昵称", "上一个昵称", "更早昵称"]
  }
]
```

说明：

- 只返回 `player_id > 1` 的玩家；
- `nicknames` 按新到旧排列，最多三个；没有昵称历史时可能是空数组；
- `player_id` 是 JSON number，受 JavaScript 安全整数限制影响。

### 2.3 按当前昵称批量获取近期历史

```http
POST /api/player_history
Content-Type: application/json
```

请求：

请求体必须是一个有效的 JSON 对象；完全空的请求体不等价于 `{}`。

```json
{
  "names": ["玩家甲", "玩家乙"],
  "count": 3
}
```

| 字段 | 类型 | 必需 | 说明 |
| --- | --- | --- | --- |
| `names` | `string[]` | 否 | 要查询的当前昵称列表；省略时按空数组处理并返回空对象 |
| `count` | integer | 否 | 每人返回场数；默认 3，小于 1 时按 1，无法转为整数时回退到 3；当前没有应用层上限，超出 SQLite 可绑定整数范围不属于稳定契约 |

成功：`200 OK`，返回以请求昵称为键的对象。当前时间点找不到有效昵称时，对应值为空数组。

```json
{
  "玩家甲": [
    {
      "match": "本帮vs对手_2026_08_18_20_30_00.csv",
      "nickname": "玩家甲",
      "profession": "血河",
      "equipment_score": 100000,
      "skill_score": 20000,
      "cultivation_score": 30000,
      "total_combat_power": 150000,
      "leader": "团长甲",
      "kills": 5,
      "assists": 10,
      "war_resources": 100,
      "damage_to_players": 200000,
      "damage_to_structures": 30000,
      "healing": 0,
      "damage_taken": 150000,
      "serious_injuries": 2,
      "skill_qingdeng": 0,
      "skill_huayu": 0,
      "control_count": 3,
      "KD": 2.5,
      "total_damage": 230000,
      "rank_kills": 1,
      "rank_damage": 2,
      "rank_healing": 5
    }
  ],
  "玩家乙": []
}
```

与按 ID 查询的差异：

- 本接口先按查询发生时的当前时刻查找有效昵称，当前判断使用 SQLite UTC `+8 hours`；返回历史记录中的团长昵称才按各场比赛时间匹配；
- 返回项使用 `match`，不返回 `match_time`；
- 只返回击杀、总伤和治疗三个排名；
- 排名范围是当场同一 `leader_id` 名下的本帮成员，而不是本帮全场；
- nullable 规则与按 ID 历史中的同名字段一致。

调用者应提交上述对象结构。有效的空对象 `{}` 会返回 `{}`；完全空的请求体、畸形 JSON、非对象 JSON、错误字段类型或过大的 `count` 没有稳定的业务错误契约，可能产生 Flask 默认 4xx/5xx 响应。

### 2.4 获取比赛列表

```http
GET /api/matches
```

成功：`200 OK`。按 `match_id` 降序返回全库比赛。

```json
[
  {
    "match_id": 42,
    "match_name": "本帮vs对手_2026_08_18_20_30_00.csv"
  }
]
```

`match_id` 是 JSON number。当前导入要求比赛时间全局递增，因此正常导入下 ID 降序也对应时间倒序；直接改库可能破坏这一假设。

### 2.5 获取比赛结果与备注

```http
GET /api/match-results/{match_id}
```

成功：`200 OK`。

```json
{
  "match_id": 42,
  "home_outcome": "win",
  "note": "备注文本"
}
```

Nullable 字段：

- `home_outcome`：`"win" | "lose" | null`；
- `note`：`string | null`。

即使 `match_id` 不存在或没有对应 `match_results`，当前实现也返回 `200`，并把 `home_outcome`、`note` 都设为 `null`，不会返回 `404`。

### 2.6 获取对手单场战绩

```http
GET /api/opponent-performances/{match_id}
```

成功：`200 OK`，按对手当场昵称排序；无记录或比赛不存在时返回空数组。

```json
[
  {
    "match_id": 42,
    "player_id": null,
    "recorded_nick": "对手玩家",
    "level": 80,
    "profession_name": "铁衣",
    "leader_nick": "对手团长",
    "equipment_score": null,
    "skill_score": null,
    "cultivation_score": null,
    "total_combat_power": null,
    "kills": 2,
    "assists": 8,
    "war_resources": 90,
    "damage_to_players": 120000,
    "damage_to_structures": 20000,
    "healing_amount": 0,
    "damage_taken": 210000,
    "serious_injuries": 4,
    "skill_qingdeng": 0,
    "skill_huayu": 0,
    "control_count": 5
  }
]
```

对手是按场快照，不建立稳定玩家身份：

- `player_id`、四项成员属性始终为 `null`；
- `level`、`profession_name`、`leader_nick` 和战斗字段在 schema 中允许 `null`，网页导入的新数据通常都有值；
- 对手记录不能用于玩家历史跳转。

### 2.7 获取本帮单场战绩

```http
GET /api/performances/{match_id}
```

成功：`200 OK`，按本帮 `player_id` 排序；无记录或比赛不存在时返回空数组。

```json
[
  {
    "match_id": 42,
    "player_id": 123456,
    "recorded_nick": "玩家甲",
    "level": 80,
    "profession_name": "血河",
    "leader_nick": "团长甲",
    "equipment_score": 100000,
    "skill_score": 20000,
    "cultivation_score": 30000,
    "total_combat_power": 150000,
    "kills": 5,
    "assists": 10,
    "war_resources": 100,
    "damage_to_players": 200000,
    "damage_to_structures": 30000,
    "healing_amount": 0,
    "damage_taken": 150000,
    "serious_injuries": 2,
    "skill_qingdeng": 0,
    "skill_huayu": 0,
    "control_count": 3
  }
]
```

Nullable 字段：

- `profession_name`、`leader_nick` 由左连接得到，异常或不完整旧数据下可能为 `null`；
- 四项成员属性在 schema 中允许 `null`；
- `kills`、`assists`、`war_resources` 及伤害、治疗、承伤、重伤、技能和控制等战斗列在 schema 中只有默认值，没有 `NOT NULL`，因此手工写入或旧数据也可能返回 `null`；
- 当前网页导入会为所有战斗列及缺失成员属性写入整数，所以通过受支持导入流程产生的新记录通常不会出现这些 `null`。当前 TypeScript 类型把本帮战斗列视为 `number`，调用者处理历史或手工数据时仍应防御空值。

本接口只返回本帮战绩，不包含对手战绩、胜负或备注；调用者需要分别请求对手和比赛结果接口。

### 2.8 获取最早比赛日期

```http
GET /api/matches/earliest
```

成功：`200 OK`。

有比赛时：

```json
{"earliest":"2026-03-01"}
```

空数据库时：

```json
{"earliest":null}
```

`earliest` 的实际类型是 `string | null`。日期来自 SQLite `date(match_time)`，没有时区转换。

### 2.9 获取区间出勤与累计数据

```http
GET /api/attendance?start=YYYY-MM-DD&end=YYYY-MM-DD
```

查询参数：

| 参数 | 必需 | 说明 |
| --- | --- | --- |
| `start` | 是 | 开始日期，界面使用 `YYYY-MM-DD` |
| `end` | 是 | 结束日期，界面使用 `YYYY-MM-DD` |

成功：`200 OK`。区间内没有比赛时返回空数组；有比赛时，后端会返回所有 `player_id > 1` 的玩家，包括区间内零出勤玩家。

```json
[
  {
    "player_id": 123456,
    "nicknames": "旧昵称\n当前昵称",
    "total_combat_power": 150000,
    "attended": 8,
    "total_matches": 10,
    "attendance_rate": 0.8,
    "first_match_time": "2026-03-01 20:30:00",
    "last_match_time": "2026-08-18 20:30:00",
    "total_damage_to_players": 1600000,
    "total_damage_to_structures": 240000,
    "total_kills": 40,
    "total_kd": 2.0,
    "total_healing": 0,
    "total_control": 24,
    "total_qingdeng": 0
  }
]
```

字段口径：

- `nicknames`：该玩家全部昵称，按旧到新用换行连接；
- `total_matches`：所选日期区间内全库 `matches` 数量；
- `attended`：该玩家在区间内的本帮战绩条数；
- `attendance_rate`：`attended / total_matches`，四舍五入到四位小数；
- `total_damage_*`、`total_kills`、`total_healing`、`total_control`、`total_qingdeng`：区间内累计；
- `total_kd`：区间总击杀除以区间总重伤；总重伤为零时直接使用总击杀；
- `total_combat_power`：该玩家全库最近一次参赛时的总战力，不受日期区间限制，缺失时为 0；
- `first_match_time`、`last_match_time`：全库首次/最后参赛时间，不受日期区间限制，没有战绩时为 `null`。

当前前端会再过滤 `attendance_rate <= 0` 的行；直接 API 调用者会看到这些零出勤玩家。

错误：

- `400` + `{"error":"start 与 end 必须是有效的 YYYY-MM-DD 日期"}`：参数缺失或无法由 Python `datetime.fromisoformat` 解析。

虽然错误文本要求 `YYYY-MM-DD`，当前后端解析器可能接受更宽的 ISO 格式。调用者应坚持提交界面契约中的日期格式；当前实现没有显式校验 `start <= end`。

## 3. 管理员接口（3 个）

管理员接口由 `backend/admin_app.py` 提供。生产环境必须通过受保护的 `/admin-api/*` 反向代理访问。

### 3.1 健康检查

```http
GET /admin-api/health
```

成功：`200 OK`。

```json
{"status":"ok"}
```

该接口只证明 Flask 进程能够处理请求，**不是 readiness 检查**。它不会打开数据库，也不会检查数据库 schema、上传目录、备份目录、磁盘空间或写权限。

### 3.2 预检联赛导入

```http
POST /admin-api/import/preview
Content-Type: multipart/form-data
```

表单字段：

| 字段 | 类型 | 必需 | 说明 |
| --- | --- | --- | --- |
| `target_guild` | text | 是 | 本帮名称，去除首尾空格后必须与 CSV 和数据库精确一致 |
| `match_file` | file | 是 | 联赛数据 CSV；原文件名必须包含 `YYYY_MM_DD_HH_MM_SS` |
| `personal_file` | file | 是 | 帮会成员 CSV |

两份文件扩展名必须为 `.csv`，大小与 multipart 开销合计不能超过 16 MiB。

成功：`200 OK`。

```json
{
  "token": "随机预检令牌",
  "expires_in": 3600,
  "match_name": "本帮vs对手_2026_08_18_20_30_00.csv",
  "match_time": "2026-08-18 20:30:00",
  "home_guild": "本帮",
  "opponent_guild": "对手",
  "home_count": 60,
  "opponent_count": 58,
  "prompt_items": [
    {
      "nickname": "玩家甲",
      "reason": "inactive",
      "existing_id": "123456",
      "last_time": "2026-07-01 20:30:00",
      "days_diff": 48
    },
    {
      "nickname": "新玩家",
      "reason": "not_found",
      "existing_id": null,
      "last_time": null,
      "days_diff": null
    }
  ]
}
```

Nullable 与枚举：

- `reason`：`"not_found" | "inactive"`；
- `existing_id`：已有玩家时为十进制字符串，否则为 `null`；
- `last_time`、`days_diff`：仅长期未参赛项有值；
- `prompt_items` 可以为空数组。

预检令牌对应的 CSV 和元数据存放在服务器暂存目录，有效期一小时。预检不会写业务表，也不会创建数据库备份。

经典服联赛/黄金畅玩服联赛说明：此接口不接收模式字段，不会识别或执行黄金畅玩服联赛的团长/小队推断。官方前端会在调用本接口前完成识别；黄金畅玩服联赛会先生成只改写本帮“所在团长”的 CSV，再把该文件作为 `match_file` 上传。

### 3.3 提交联赛导入

```http
POST /admin-api/import/commit
Content-Type: application/json
```

请求：

```json
{
  "token": "预检返回的令牌",
  "player_ids": {
    "玩家甲": "123456",
    "新玩家": "789012"
  },
  "home_outcome": "win",
  "note": "可选备注"
}
```

| 字段 | 类型 | 必需 | 说明 |
| --- | --- | --- | --- |
| `token` | string | 是 | 未过期的预检令牌 |
| `player_ids` | object of string | 有确认项时是 | 必须为提交时重新计算出的每个确认昵称提供十进制字符串 ID；无确认项时可省略或传空对象 |
| `home_outcome` | `"win" \| "lose"` | 是 | 本帮结果 |
| `note` | string | 否 | 去除首尾空格后写入；空字符串按 `null` 保存 |

玩家 ID 必须只包含 ASCII `0-9`，并位于 `2..9223372036854775807`。尽管服务端接受完整 SQLite 整数范围，当前 JavaScript 查询链路存在安全整数风险，建议不超过 `9007199254740991`。

成功：`200 OK`。

```json
{
  "match_id": 42,
  "match_name": "本帮vs对手_2026_08_18_20_30_00.csv",
  "home_count": 60,
  "opponent_count": 58
}
```

提交过程会获取 SQLite 写锁、核对预检修订摘要、重新读取并校验文件、创建导入前备份，然后在一个事务中写入比赛、胜负/备注、本帮身份与战绩、对手快照。成功后令牌目录会被删除，不能重复提交同一令牌。

如果失败，业务事务会回滚，暂存目录通常保留到令牌过期，以便修正可重试的问题。若预检后比赛集合已变化，旧令牌无法重新同步，必须重新预检。已经成功创建、但在后续写入失败前留下的备份文件不会自动删除。

## 4. 管理员接口状态码

| 状态码 | 当前语义 | 典型情况 |
| --- | --- | --- |
| `200` | 成功 | 健康检查、预检成功、提交成功 |
| `400` | 可展示的输入或预检状态错误 | 缺文件/列、文本或整数非法、比赛时间不递增、token 无效或过期、缺玩家 ID、预检后数据库比赛集合变化 |
| `409` | SQLite 完整性或锁冲突 | 玩家 ID/比赛记录违反唯一性或关联约束；数据库被其他写事务锁定 |
| `413` | 请求体过大 | 两份文件和 multipart 合计超过 Flask 的 16 MiB 限制；Nginx 也应配置一致限制 |
| `500` | 服务器或备份错误 | 数据库备份失败、非锁类数据库操作失败、未预期异常 |

管理员业务错误响应示例：

```json
{"error":"预检后数据库已经发生变化，请重新上传并预检"}
```

注意：数据库修订冲突当前由 `ImportValidationError` 表示，因此实际返回 `400`，不是 `409`。客户端应按当前状态码处理，不要仅凭概念推断。

上表只描述管理员应用主动产生的主要响应。通过生产反向代理访问时还可能收到接入层或通用 HTTP 错误：认证失败的 `401`、权限或路径策略导致的 `403`、错误路径/方法的 `404/405`、Nginx 在 Flask 之前拒绝请求的 `413`，以及上游不可用的 `502`。这些响应不保证使用 `{"error":...}` JSON 格式。

## 5. 查询接口与管理员接口差异

| 维度 | 查询接口 | 管理员接口 |
| --- | --- | --- |
| Flask 应用 | `backend/app.py` | `backend/admin_app.py` |
| 主要用途 | 读取与展示 | CSV 预检和事务写入 |
| 生产认证 | Nginx viewer | Nginx admin |
| CORS | 应用层启用宽松 CORS | 未启用应用层 CORS，预期同源代理 |
| 错误 JSON | 仅部分接口保证 | 业务与主要数据库错误统一为 `{"error":...}` |
| ID 表示 | 多数为 JSON number | 预检/提交玩家 ID 使用 string；成功结果的 `match_id` 仍是 number |
| 数据库连接 | 普通读取连接 | 开启外键、15 秒 busy timeout；提交使用 `BEGIN IMMEDIATE` |
| 并发保护 | 无写入 | 预检修订摘要、写锁、重新校验、备份、事务 |

## 6. 最小调用示例

查询比赛：

```bash
curl -fsS -u 普通用户名 https://服务器地址/api/matches
```

检查管理员进程：

```bash
curl -fsS -u 管理员用户名 https://服务器地址/admin-api/health
```

预检：

```bash
curl -fsS -u 管理员用户名 \
  -F 'target_guild=本帮名称' \
  -F 'match_file=@联赛数据_2026_08_18_20_30_00.csv;type=text/csv' \
  -F 'personal_file=@帮会成员.csv;type=text/csv' \
  https://服务器地址/admin-api/import/preview
```

提交时应从预检响应读取 token 和确认项，不要在 shell 历史中长期保存真实玩家数据。生产环境的完整权限与 HTTPS 注意事项见 [部署指南](deployment.md)。
