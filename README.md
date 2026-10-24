# 小派 xiaopai-agent

一个「会说，也会做」的中文生活助理：自然语言对话 + 真正执行动作（查天气、管待办、读写文件、记住你的偏好）。

技术底座是 **Pi**（[Earendil `@earendil-works/pi-coding-agent`](https://pi.dev/docs) 的 TypeScript SDK），行动能力由 **3 个自研 MCP 服务器**（stdio）提供，界面是一个零构建的网页。

> 软件工程课程小组作业 · 4 人协作 · 仓库：https://github.com/akcow/xiaopai-agent

---

## 它到底能做什么

| 用户说 | 小派做的事 |
|---|---|
| "杭州明天要带伞吗？" | 调 `travel_advice` → 拿 open-meteo 的降水概率 → 回答"要带伞，建议 09:00-11:00 出门" |
| "帮我记一下周三下午三点交作业" | 调 `todo_add` → 写进 SQLite → 右侧栏立刻多出一条待办 |
| "我住在广州，不吃香菜" | 调 `memory_remember`（带 key 去重）→ 写进长期记忆表 → **下一轮对话起自动带进系统提示词** |
| "把刚才的天气写成 workspace/notes/天气.md" | 调 `file_write` → 文件真的落在磁盘上（越界访问会被拒） |
| "我还有哪些事没做" | 调 `todo_list` → 按状态/截止日排序返回 |
| "今天午饭花了 28" / "这周花了多少" | 调 `expense_add` 落库 / `expense_summary` 出月度统计（总额、日均、分类占比） |
| "距离软工答辩还有多少天" | 调 `countdown_list` → 按目标日期算出剩余天数 |
| "5 英里是多少公里" / "100 美元多少人民币" | `convert_unit`（纯本地） / `convert_currency`（实时汇率） |
| 发来一个链接 | 调 `fetch_url` 抓标题与正文，再两三句话概括 |

---

## 界面

| 问天气（工具卡片可见参数与耗时） | 说偏好后，下一轮自动生效 |
|---|---|
| ![天气](./docs/screenshots/02-weather-chat.png) | ![记忆](./docs/screenshots/05-recall.png) |

左上角徽章显示"已连接工具 24 个"（3 个文件工具 + 21 个 MCP 工具），右侧栏的待办与记忆每轮自动刷新。更多截图在 [`docs/screenshots/`](docs/screenshots/)。

---

## 加分项对照

| 加分项 | 本项目实现 | 证据 |
|---|---|---|
| ✅ 多轮对话记忆 | 两层：会话 JSONL 持久化（`SessionManager`）+ 长期事实表（SQLite）；记忆变更后**重建会话热注入** systemPrompt | `src/agent/sessionStore.ts`、`src/data/memories.ts` |
| ✅ 外部 API / 数据库 | open-meteo 天气与地理编码、open.er-api.com 汇率（都免费无 key）+ SQLite 四张表（待办/记忆/记账/倒数日，WAL 支持多进程并发） | `mcp/weather/*`、`mcp/convert/*`、`src/data/*` |
| ✅ 前端界面 | 零构建网页：消息流、**工具调用卡片**（参数/耗时/结果可展开）、待办与记忆侧栏实时刷新 | `public/*`、`docs/screenshots/` |

---

## 架构

```
┌──────────────┐   POST /api/chat (SSE)   ┌───────────────────────────────┐
│  浏览器前端   │ ───────────────────────► │  Node HTTP 服务（node:http）  │
│ public/*     │ ◄─── text_delta/tool_* ── │  src/http/*                   │
└──────────────┘                          └───────────────┬───────────────┘
                                                          │ createAgentSession()
                                              ┌───────────▼───────────────┐
                                              │  Pi Agent 运行时          │
                                              │  模型: qwen-plus (兼容端点) │
                                              │  系统提示词 = Pi 默认     │
                                              │            + 人设/时间/记忆│
                                              └───┬───────────────┬───────┘
                                     registerTool│               │registerMcpServer (stdio)
                                      ┌──────────▼────┐   ┌──────▼────────────────────┐
                                      │ file_list     │   │ xiaopai-weather  (4 工具) │
                                      │ file_read     │   │ xiaopai-todo     (4 工具) │
                                      │ file_write    │   │ xiaopai-memory   (3 工具) │
                                      └───────────────┘   │ xiaopai-expense  (4 工具) │
                                                          │ xiaopai-countdown(3 工具) │
                                                          │ xiaopai-convert  (2 工具) │
                                                          │ xiaopai-web      (1 工具) │
                                                          └──────┬────────────────────┘
                                                                 │ node:sqlite / fetch
                                                     ┌───────────▼───────────┐
                                                     │ data/xiaopai.db (WAL) │
                                                     │ open-meteo HTTP API   │
                                                     └───────────────────────┘
```

时序图见 [`docs/architecture.md`](docs/architecture.md)，工具参数与错误码见 [`docs/mcp-tools.md`](docs/mcp-tools.md)。

---

## 快速开始

要求：**Node ≥ 22.19**（用到内置 `node:sqlite`，Node 20 跑不了）。用 `nvm use` 时仓库自带 `.nvmrc`。

```bash
npm install
cp .env.example .env          # Windows: copy .env.example .env
# 编辑 .env，填入 DASHSCOPE_API_KEY（阿里云百炼，新用户有免费额度）
npm run dev                   # → http://127.0.0.1:8787
```

其他命令：

```bash
npm run typecheck     # 类型检查
npm test              # 单测 + MCP 集成测（68 个用例，不需要模型 key）
npm run test:agent    # Agent 行为测（需要 key，5 个用例）
npm run build         # 编译到 dist/
npm start             # 跑编译产物
npm run smoke:mcp     # 不经过模型的 MCP 连通性冒烟（17 项）
npm run smoke:agent   # 终端里跑一轮真实对话，打印工具调用
npm run tools         # 检查会话挂载了哪些工具（应为 24 个）
npm run shots         # Playwright 截图到 docs/screenshots/
```

---

## 工具清单

**xiaopai-weather**（open-meteo，免费无 key）

| 工具 | 作用 |
|---|---|
| `geocode_city` | 中文城市名 → 经纬度（别名表 + 去"市/县"后缀） |
| `weather_current` | 实况：温度/体感/湿度/风/天气现象 |
| `weather_forecast` | 未来 1-7 天逐日预报（最高最低温、降水概率、最大风速） |
| `travel_advice` | 规则引擎：带伞/穿衣/最佳时段/风险等级（纯函数，可复现） |

**xiaopai-todo**（SQLite）

| 工具 | 作用 |
|---|---|
| `todo_add` | 新增待办（标题/截止日/优先级） |
| `todo_list` | 按状态与截止日查询，附未完成/过期统计 |
| `todo_update` | 改标题/截止日/优先级/状态（完成、取消） |
| `todo_delete` | 删除，未带 `confirm=true` 时要求二次确认 |

**xiaopai-memory**（SQLite）

| 工具 | 作用 |
|---|---|
| `memory_remember` | 记住稳定事实/偏好，`key` 唯一（同 key 覆盖不新增） |
| `memory_recall` | 按关键词召回 |
| `memory_forget` | 按 id 或关键词忘记，命中多条时返回候选让用户确认 |

**xiaopai-expense**（SQLite）：记账

| 工具 | 作用 |
|---|---|
| `expense_add` | 记一笔（金额/分类/备注/日期），拒绝未来日期 |
| `expense_list` | 按区间与分类查明细，倒序返回 |
| `expense_summary` | 按月或自定义区间统计：总额、笔数、日均、分类汇总 |
| `expense_delete` | 删除，同样需要 `confirm=true` |

**xiaopai-countdown**（SQLite）：倒数日

| 工具 | 作用 |
|---|---|
| `countdown_add` | 记一个节点（考试/答辩/纪念日），返回剩余天数 |
| `countdown_list` | 默认只列还没到的，按日期升序 |
| `countdown_delete` | 删除，需要确认 |

**xiaopai-convert**：换算

| 工具 | 作用 |
|---|---|
| `convert_unit` | 长度/质量/体积/面积/温度/数据量换算（纯本地、纯函数，支持 `米/公里/斤/两/摄氏度/MB` 等中英文单位） |
| `convert_currency` | 汇率换算，open.er-api.com（免费无 key），缓存 6 小时 |

**xiaopai-web**：网页速读

| 工具 | 作用 |
|---|---|
| `fetch_url` | 抓公开网页的标题与正文（去脚本/样式/注释，默认 3000 字），交给模型概括；拒绝非 http(s)、非网页类型、超大页面 |

**文件工具**（Pi 扩展注册，锁在 `workspace/` 内）：`file_list` / `file_read` / `file_write`

> 一共 7 个 MCP 服务器、21 个 MCP 工具 + 3 个文件工具 = **24 个工具**。`npm run tools` 会打印实际挂载结果，`tests/integration/mcp.test.ts` 会把注册表和真实 listTools 的数量对齐。

---

## 测试

分三层，越往下越慢、越依赖真实环境：

| 层 | 命令 | 覆盖 | 用例数 |
|---|---|---|---|
| 单元测试（纯函数/仓储层） | `npm run test:unit` | 天气码翻译、出行建议规则、单位换算、日期与倒计时、HTML 抽取、待办/记账/倒数日的 SQL | 49 |
| 集成测试（MCP 协议级） | `npm run test:integration` | 启动 7 个子进程走 stdio：工具数量与注册表一致、正常调用、错误码分支、二次确认、记忆去重 | 19 |
| 行为测试（真实模型） | `npm run test:agent` | 给一句话，断言模型调了什么工具、数据库有没有真的变、回答里有没有正确数值 | 5 |

一条命令跑完前两层：`npm test`；全跑：`npm run test:all`（行为测试需要 `.env` 里的 key，没有则自动跳过）。

测试不是摆设，写的过程里抓到两个真 bug：
1. `normalizeUrl("ftp://x")` 被拼成 `https://ftp//x`——协议判断只看了 http(s)，没考虑"已经带了别的协议"。
2. 出行建议的"最佳时段"标签把两小时窗口写成了 `10:00-11:00`，实际窗口是 `10:00-12:00`，改的是测试预期、留下的是正确行为。

行为测试的断言长这样（`tests/agent/behavior.test.ts`）：

```ts
const { tools } = await runTurn("今天午饭花了 28 块，帮我记一下。");
assert.ok(tools.some((t) => t.includes("expense_add")), `实际调用：${tools.join(",")}`);
const hit = listExpenses({ limit: 20 }).find((e) => Math.abs(e.amount - 28) < 0.01);
assert.ok(hit, "数据库里应能查到这笔 28 元的记录");
```

这条用例真的抓到过问题：`qwen-flash` 在挂 24 个工具时会**不调工具、直接回"已帮你记下"**，换成 `qwen-plus` 才稳定。所以默认模型定的是 `qwen-plus`，不是更便宜的那个。

---

## 几个设计选择

- **Pi SDK 嵌在自己进程里**，而不是当 CLI 用：这样才能把会话、系统提示词、工具集按请求装配，并把事件转成网页的流式输出。
- **工具用 `direct` 暴露，不上 codemode**：codemode 让模型写 JS 再调工具，token 省，但对小模型命中率明显下降，错误也更难解释。作业演示优先稳定。
- **关掉 Pi 内置的 bash/read/write/edit**（`noTools: "builtin"`），文件能力只走我们自己的 `file_*`，并且强制限制在 `workspace/` 内。
- **HTTP 用 `node:http` 不用 Express**：只需要 6 个路由 + SSE，原生 `res.write` 最不容易被缓冲，依赖为零。
- **数据库用 `node:sqlite` 不用 better-sqlite3**：省掉 Windows 上的原生模块编译，`npm install` 一步到位。
- **记忆热注入靠"用同一个 SessionManager 重建会话"**：Pi 的 `session.systemPrompt` 是只读的，重建既不丢历史，又能让新记忆进提示词。细节见博客的"实现说明"。

---

## 目录结构

```
src/            常驻进程：配置、数据层、agent 装配、HTTP
mcp/            7 个独立 stdio MCP 服务器（可单独启动、单独测试）
public/         零构建前端
scripts/        冒烟脚本、截图脚本、提交时间线
tests/          单测 / MCP 集成测 / Agent 行为测（73 个用例）
config/         models.json（三家 OpenAI 兼容端点）、persona.md（人设与工具规范）
docs/           架构、工具文档、演示实录、博客稿、截图
workspace/      文件工具唯一可写目录
```

## License

MIT
