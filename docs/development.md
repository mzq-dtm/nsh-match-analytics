# 开发与质量检查指南

本文面向项目维护者，说明前端本地开发、依赖安装、质量检查、团队战报模块边界、Python 与数据库测试边界，以及提交前验收流程。系统运行组件与数据流见[系统架构](architecture.md)，生产构建、发布和数据库维护见[部署指南](deployment.md)。

## 1. 环境要求

前端位于仓库根目录下的 `frontend/`。以下命令默认先进入项目根目录，再进入前端目录：

```bash
cd /path/to/nsh-match-analytics
cd frontend
```

Node.js 版本需要同时满足项目工具链和 Vitest 的要求：

- 项目 `package.json` 目前声明 `^20.19.0 || >=22.12.0`，但锁定的 ESLint 10 完整工具链要求 Node.js 22 至少为 22.13.0；
- 当前 Vitest 4 声明支持 Node.js 20、22 或 `>=24.0.0`，不支持 Node.js 23；
- 因此当前完整开发、lint、测试和构建流程的有效范围是 `^20.19.0`、`^22.13.0` 或 `>=24.0.0`；推荐使用与 CI 一致的 Node.js 24。

开始前确认版本：

```bash
node --version
npm --version
```

Node.js 22.12 和 Node.js 23 都会匹配 `frontend/package.json` 中较宽泛的 `>=22.12.0` 表达式，但前者不满足当前 ESLint 工具链要求，后者不受当前 Vitest 4 支持。不要只依据该项目版本表达式判断开发环境是否可用。

当前 `npm-run-all2` 工具链要求 npm 10 或更高版本；`npm run lint` 和 `npm run build` 分别通过它调用 `run-s` 与 `run-p`。

## 2. 安装依赖

首次检出代码、切换分支或 `package-lock.json` 更新后，在 `frontend/` 中执行：

```bash
npm ci --include=dev
```

`npm ci` 会删除并按 `package-lock.json` 重新创建 `node_modules`。显式保留开发依赖是必要的，因为 Vite、Vitest、TypeScript、Vue 类型检查和 lint 工具都位于 `devDependencies`。已有 `node_modules` 也不能代替锁文件同步；生产机器如果承担前端构建，同样应执行上述命令。

不要在需要开发、测试或构建的环境中使用：

```bash
npm ci --omit=dev
```

也不需要全局安装 Vite、Vitest 或 TypeScript。所有命令都通过项目脚本调用锁定版本。

## 3. 本地开发

启动 Vite 开发服务器：

```bash
npm run dev
```

默认页面地址为 `http://127.0.0.1:5173`。开发服务器会按 Vite 配置把 `/api` 转发到查询后端 `127.0.0.1:10290`，把 `/admin-api` 转发到管理员后端 `127.0.0.1:10291`。需要读取真实比赛或测试管理员导入时，应同时启动相应后端；只调整纯前端样式或运行单元测试时不必启动后端。

## 4. 前端质量检查

以下命令均在 `frontend/` 中运行：

```bash
npm run lint
npm test
npm run type-check
npm run build
```

各命令职责如下：

| 命令 | 当前行为 | 主要发现的问题 |
| --- | --- | --- |
| `npm run lint` | 依次运行 Oxlint 和 ESLint | 代码规范、可疑写法及 Vue/TypeScript 静态问题 |
| `npm test` | 以单次运行模式执行 Vitest | 已编写单元测试覆盖的行为回归 |
| `npm run type-check` | 执行 `vue-tsc --build` | Vue 模板和 TypeScript 类型错误 |
| `npm run build` | 并行执行类型检查与 Vite 生产构建 | 类型错误、模块解析错误及生产打包失败；产物写入 `frontend/dist/` |

建议保留上面的执行顺序。虽然 `npm run build` 自身也会进行类型检查，单独执行 `npm run type-check` 与 CI 保持一致，并且更容易定位失败阶段。

## 5. 团队战报模块

团队战报位于 `frontend/src/features/match-report/`，数据建模和浏览器绘图有明确分工：

| 文件 | 职责 |
| --- | --- |
| `types.ts` | 定义导出输入、报告元数据、团队、表格、固定列、Canvas 布局和图片结果等类型契约 |
| `constants.ts` | 定义四类表格、固定 18 列、列宽、颜色、字体、布局尺寸、数据条字段、Canvas 安全上限和文件名后缀 |
| `buildMatchReport.ts` | 纯数据建模：校验输入、规范化战绩、解析比赛元数据、分团、排序、过滤素问、生成四张表并计算各表数据条最大值；不访问浏览器 API，也不修改页面持有的输入数据 |
| `generateMatchReportImage.ts` | 等待浏览器字体就绪，以两遍 Canvas 流程测量布局并绘制报告，检查画布尺寸，编码 PNG `Blob`，返回文件名和图片尺寸 |
| `buildMatchReport.test.ts` | 使用 Vitest 验证 `buildMatchReport()` 的纯建模规则 |

`frontend/src/components/MatchRecords.vue` 负责页面集成：收集当前比赛的本帮战绩、胜负和备注，调用图片生成函数，再通过临时对象 URL 和下载链接触发浏览器保存。报告图片不会上传或写入后端。

修改表格字段或布局时，应同时检查类型、常量、建模逻辑、Canvas 绘制和测试，避免只改页面展示而导致导出规则漂移。

## 6. Vitest 覆盖边界

当前 Vitest 测试集中在 `buildMatchReport.test.ts`，覆盖的是不依赖 DOM 的报告建模，包括：

- 团队分组、未分团归一化、团队人数排序和稳定的昵称排序；
- 四张表的固定顺序、素问/非素问过滤、指标降序和相同指标的稳定排序；
- 每张表独立的数据条最大值、固定导出列和空表模型；
- 比赛名称、对阵、时间、胜负和备注解析；
- 无效比赛 ID、空比赛名称、空战绩、跨场战绩和非法赛果校验；
- 输入数组及行对象不被修改。

以下行为目前没有自动化测试，不能因 `npm test` 通过而省略人工验收：

- 真实浏览器中的 Canvas 文字测量、字体回退、颜色、网格、数据条和超长图片绘制；
- `canvas.toBlob()` 的 PNG 编码结果、对象 URL、下载链接和文件名；
- `MatchRecords.vue` 中选择比赛、切换本帮/对手、异步请求和快速切换比赛产生的页面状态竞态；
- 不同浏览器的 Canvas 尺寸、内存和下载限制。

涉及团队战报或联赛页状态的改动，至少人工检查：

1. 选择一场有多个团队且同时包含素问和非素问的比赛，点击“导出分团数据”。
2. 确认 PNG 能下载并正常打开，比赛双方、时间、胜负和备注与当前比赛一致。
3. 确认普通团队按参赛人数降序排列，“未分团”位于最后；每团标题仅显示团长和参赛人数。
4. 确认每团依次包含对玩家伤害、对建筑伤害、击杀数和治疗量四张表，空表也能正确显示。
5. 在本帮视图和对手视图分别导出，确认图片始终使用当前比赛的本帮数据，且不受页面排序、列显隐或高亮状态影响。
6. 快速切换不同比赛后立即导出，确认没有混入上一场的战绩、赛果或备注。
7. 选取人数最多的比赛导出一次，确认目标桌面浏览器能够完成绘图、编码和下载。

## 7. CI 流程

GitHub Actions 的前端任务使用 Ubuntu 和 Node.js 24，并缓存 npm 下载内容。工作目录固定为 `frontend/`，执行顺序为：

```text
检出代码
  → setup-node 24（缓存键来自 frontend/package-lock.json）
  → npm ci
  → npm run lint
  → npm test
  → npm run type-check
  → npm run build
```

本地使用 `npm ci --include=dev` 是为了明确避免生产环境变量意外省略开发依赖；CI 当前的普通 `npm ci` 在其环境中同样会安装开发依赖。

同一个工作流还会并行执行：

- 后端任务：Python 3.11、Ruff、Python 编译检查，以及 `app`、`admin_app` 导入检查；
- 数据库任务：Python 3.11、Ruff，并用 SQLite 执行 `schema.sql` 和 `init_data.sql` 验证初始化脚本。

这些任务属于静态检查和启动级检查：它们不会通过 Flask test client 调用查询或管理员接口，也不会执行 `database/server_merge.py`。因此，CI 通过不代表数据库写入、昵称有效期边界或查询结果排序已经经过行为测试。

CI 在推送到 `main` 和所有 pull request 上运行。前端改动也应等待整个工作流通过，因为共享的 API、数据库和部署约束可能受跨目录修改影响。

## 8. Python 与数据库行为测试

当前仓库还没有 Python 自动化测试套件。修改查询后端、管理员导入或数据库维护脚本时，应使用专门创建的临时 SQLite 数据库验证行为；不得把被 Git 忽略的 `database/game_league.db`、生产数据库或其唯一副本作为冒烟测试目标。

涉及合服边界或昵称查询时，至少应覆盖：

- 日期解析以及固定 `12:00:00` 边界；
- 合服时间不晚于最新比赛时拒绝执行；
- 存在生效时间不早于边界的开放昵称时拒绝执行；
- `player_id = 0` 的“无”哨兵保持开放；
- 正常提交、异常回滚和重复执行不产生额外修改；
- 同一玩家、同一昵称存在多个有效期时，玩家候选只返回最近三个不重复昵称；
- 出勤历史昵称去重，并按各昵称第一次出现时间排列；
- 合服边界后，按当前昵称查询与按稳定玩家 ID 查询表现出预期差异。

测试应直接调用可测试函数，或在 Flask test client 中临时覆盖数据库路径。不要为了测试交互入口而直接运行 `python3 database/server_merge.py`；该命令会按 `database/config.py` 解析默认数据库，并执行真实写入。生产操作只能遵循[部署指南的合服边界处理流程](deployment.md#合服边界处理)。

在正式增加 Python 测试套件后，应把测试命令加入本节、提交前检查和 CI，避免三处覆盖范围再次漂移。

## 9. 提交前检查

功能完成后，从项目根目录执行以下检查：

```bash
cd frontend
npm run lint
npm test
npm run type-check
npm run build
cd ..
git diff --check
git status --short
```

提交前还应确认：

- `package-lock.json` 只在依赖确实发生变化时修改；
- 没有把 `node_modules/`、临时文件或本地配置加入提交；
- 涉及浏览器交互、Canvas 或下载的变更已经完成对应人工验收；
- 文档、测试和实现描述的是同一套当前行为。

## 10. 依赖安全审计

查看完整审计结果：

```bash
npm audit
```

只查看生产依赖，或先预览 npm 建议的修改：

```bash
npm audit --omit=dev
npm audit fix --dry-run
```

需要追踪某个间接依赖时，可执行 `npm explain <包名>`。开发工具链中的漏洞和会进入浏览器产物的运行时依赖风险不同，应根据依赖链、实际暴露面和上游修复版本分别评估。

不要执行：

```bash
npm audit fix --force
```

该命令可能跨主版本升级依赖并大范围改写锁文件，导致 Vite、Vue、TypeScript 或测试工具不兼容。依赖升级应作为明确变更进行评审，并在升级后重新执行 lint、测试、类型检查、生产构建和相关人工验收。
