# MCP 工具手册

七个服务器都是 stdio 传输，工具名前缀 `mcp__<server>__<tool>`。所有工具遵守同一套返回约定：

- **成功**：`content[0].text` = 中文摘要 + `\n\n` + JSON；同时给 `structuredContent`（结构化数据，方便脚本/codemode 用）。
- **失败**：`isError: true`，`content[0].text` = `错误[E_XXX] 人话原因`。模型会被要求把原因翻译给用户，而不是静默重试。

## xiaopai-weather

数据源：[open-meteo](https://open-meteo.com)（geocoding + forecast），**免费、无需 API key、国内直连可用**。地理编码结果缓存 1 小时，预报缓存 10 分钟。

### `geocode_city`

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `city` | string(1-40) | ✅ | 用户说的地名，如 `杭州`、`上海市`、`朝阳区` |
| `count` | int(1-5) | | 候选个数，默认 3 |

返回：`{ query, matches: [{ name, admin1, country, latitude, longitude, timezone, population }] }`

错误：`E_CITY_NOT_FOUND`（无匹配，提示换说法）、`E_UPSTREAM`（接口非 200 / 8s 超时，已重试 1 次）

> 其它三个天气工具**内部会自己解析城市名**，模型不需要先调 `geocode_city`。只有地名有歧义时才用它跟用户确认。

### `weather_current`

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `city` | string(1-40) | ✅ | 城市名 |
| `unit` | `celsius` / `fahrenheit` | | 默认摄氏 |

返回：`{ city, admin1, observedAt, temperature, apparentTemperature, humidity, precipitation, weatherCode, weatherDesc, windSpeed, windDirection, windDesc, timezone }`

摘要示例：`浙江杭州 现在阴，19℃（体感 19℃），湿度 89%，北风 17 km/h`

### `weather_forecast`

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `city` | string(1-40) | ✅ | 城市名 |
| `days` | int(1-7) | | 默认 3 |

返回：`{ city, timezone, days: [{ date, weekday, weatherCode, weatherDesc, tempMax, tempMin, precipProbability, windSpeedMax, sunrise, sunset }] }`

### `travel_advice`

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `city` | string(1-40) | ✅ | 城市名 |
| `date` | `YYYY-MM-DD` | | 默认今天（按城市时区） |
| `activity` | `通勤` / `运动` / `出游` / `晾晒` | | 默认通勤 |

返回：`{ city, date, activity, day, advice: { umbrella, clothing, bestWindow, tips[], riskLevel } }`

规则引擎（`mcp/weather/advice.ts`，纯函数）：

| 判定 | 规则 |
|---|---|
| 带伞 | `precipProbability ≥ 50` 或 WMO 代码属于雨/雪集合 |
| 穿衣 | tempMax ≥30 短袖+防晒；22-29 薄长袖；12-21 外套；5-11 厚外套；<5 羽绒服 |
| 风险 | 雨且阵风 ≥40km/h → 高；有雨/≥35℃/≤0℃/大风 → 中；否则低 |
| 最佳时段 | 07:00-21:00 内连续两小时"降水概率 <30 且温度在 10-28℃"，找不到则回退 `09:00-11:00` |

错误：`E_DATE_OUT_OF_RANGE`（超出 7 天预报窗口）、`E_CITY_NOT_FOUND`、`E_UPSTREAM`

## xiaopai-todo

存储：`data/xiaopai.db` 的 `todos` 表（`node:sqlite`，WAL）。

### `todo_add`

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `title` | string(1-120) | ✅ | 待办内容 |
| `dueDate` | `YYYY-MM-DD` | | 截止日期 |
| `priority` | `low` / `normal` / `high` | | 默认 normal |
| `note` | string(≤500) | | 补充说明 |

返回：完整行 + `id`（后续改状态要用）。错误：`E_VALIDATION`、`E_BAD_DATE`

### `todo_list`

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `status` | `all` / `pending` / `done` / `cancelled` | | 默认 pending |
| `dueBefore` | `YYYY-MM-DD` | | 只看这天之前到期的 |
| `limit` | int(1-50) | | 默认 20 |

返回：`{ count, items: [{ id, title, status, priority, dueDate, overdue }], stats: { pending, done, overdue } }`

排序：未完成优先 → 按截止日升序（无截止日排最后）→ id 降序。

### `todo_update`

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `id` | int | ✅ | 待办 id |
| `title` / `dueDate` / `priority` / `status` / `note` | | 至少一个 | `status=done` 会同时写 `done_at` |

返回：更新后的行 + `changed: ["status","done_at"]`。错误：`E_NOT_FOUND`、`E_NO_FIELDS`、`E_BAD_DATE`

### `todo_delete`

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `id` | int | ✅ | 待办 id |
| `confirm` | boolean | | 默认 false |

`confirm=false` 时**不删**，返回 `错误[E_NEED_CONFIRM] 确认要删除 #3《…》吗？`，并带上标题让用户核对。这个"二次确认"是故意设计的：既是安全边界，也制造了一次多轮交互的演示素材。

## xiaopai-memory

存储：`memories` 表，`key` 唯一约束 + `ON CONFLICT DO UPDATE` 去重。

### `memory_remember`

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `content` | string(1-200) | ✅ | 一句话中文事实，如 `用户住在杭州` |
| `category` | `profile` / `preference` / `event` | | 默认 preference |
| `key` | string(≤40) | | 去重键，如 `city`、`diet_cilantro` |

返回：`{ id, content, category, created }`。`created=false` 表示命中了同 key，做了覆盖更新。

> 去重是为了对抗"用户每次都说一遍同一条信息"导致的记忆膨胀。实测：连说三次"我住在杭州"，表里只有一行。

### `memory_recall`

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `query` | string(≤50) | | 关键词模糊匹配；不传返回最近 10 条 |
| `limit` | int(1-30) | | 默认 10 |

### `memory_forget`

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `id` | int | 二选一 | 精确删除 |
| `query` | string(≤50) | 二选一 | 命中**恰好一条**才删；命中多条返回 `E_AMBIGUOUS` + 候选清单 |

## 文件工具（Pi 扩展注册，非 MCP）

| 工具 | 参数 | 说明 |
|---|---|---|
| `file_list` | `dir?` | 列 `workspace/` 下的文件与大小 |
| `file_read` | `path`, `maxLines?`(默认 200) | 读文本文件 |
| `file_write` | `path`, `content`, `mode?`(overwrite/append) | 写/追加 |

三个工具都会把相对路径 `resolve` 到 `workspace/`，越界直接返回 `错误[E_OUT_OF_SCOPE]`。Pi 内置的 `read`/`write`/`edit`/`bash` 被 `noTools: "builtin"` 关掉了，所以模型没有别的途径碰文件系统。

## xiaopai-expense

存储：`expenses` 表（金额 REAL，单位元；`spent_on` 记"哪天花的"）。

| 工具 | 参数 | 说明 |
|---|---|---|
| `expense_add` | `amount`(>0)、`category`(餐饮/交通/购物/学习/娱乐/住房/医疗/其他)、`note?`、`date?` | 记账；金额四舍五入到两位小数；**拒绝未来日期** |
| `expense_list` | `from?`、`to?`、`category?`、`limit?` | 明细，按日期倒序 |
| `expense_summary` | `month?`(YYYY-MM)、`from?`、`to?` | 总额、笔数、有消费天数、日均、分类汇总 |
| `expense_delete` | `id`、`confirm?` | 未确认时返回 `E_NEED_CONFIRM` |

统计口径：`dailyAverage = total / 该区间内有消费的天数`（不是自然天数，避免"没花钱的日子"拉低均值到无意义）。

## xiaopai-countdown

存储：`countdowns` 表。

| 工具 | 参数 | 说明 |
|---|---|---|
| `countdown_add` | `title`、`date`(YYYY-MM-DD)、`note?` | 返回 `daysLeft`（今天=0，过去为负） |
| `countdown_list` | `includePast?`、`limit?` | 默认只返回未到来的，按日期升序 |
| `countdown_delete` | `id`、`confirm?` | 未确认时返回 `E_NEED_CONFIRM` |

天数用 `daysBetween()` 纯函数计算（`Date.parse` + UTC 零点，避免时区把结果差一天），跨月跨年有单测。

## xiaopai-convert

| 工具 | 参数 | 说明 |
|---|---|---|
| `convert_unit` | `value`、`from`、`to` | 支持长度/质量/体积/面积/温度/数据量；中英文单位都认（`米/公里/斤/两/摄氏度/℃/MB`）；**跨类别换算直接报错**，不会偷偷按长度算 |
| `convert_currency` | `amount`、`from`、`to` | 用 open.er-api.com（免费无 key），缓存 6 小时；货币用 ISO 代码 |

温度走公式（不是乘系数）：`100℉ → (100-32)/1.8 = 37.78℃`。

## xiaopai-web

| 工具 | 参数 | 说明 |
|---|---|---|
| `fetch_url` | `url`、`maxChars?`(默认 3000) | 抓公开网页，去 `script/style/注释` 后返回标题与正文；拒绝非 http(s)、非网页类型、超过 600KB 的页面 |

`normalizeUrl()` 只接受 http/https——这条是单元测试逼出来的：早期实现把 `ftp://x` 拼成了 `https://ftp//x`。

## 错误码总表

| 错误码 | 含义 | 模型应该怎么做 |
|---|---|---|
| `E_CITY_NOT_FOUND` | 地名解析失败 | 反问用户换说法或补充省份 |
| `E_UPSTREAM` | 外部接口不可用 | 告诉用户"天气服务暂时连不上"，不要编数据 |
| `E_BAD_DATE` / `E_DATE_OUT_OF_RANGE` | 日期格式或范围不对 | 说明可用范围，请用户重选 |
| `E_VALIDATION` / `E_NO_FIELDS` | 参数缺失或为空 | 指出缺什么 |
| `E_NOT_FOUND` | id 不存在 | 先调 `todo_list` 确认 id |
| `E_NEED_CONFIRM` | 删除未确认 | 复述标题，等用户同意后再带 `confirm=true` |
| `E_AMBIGUOUS` | 记忆删除命中多条 | 列出候选让用户选 |
| `E_OUT_OF_SCOPE` | 文件路径越界 | 说明只能操作 `workspace/` |
| `E_MODEL_CONFIG` | 模型 key 未配置 | 这是服务层错误，前端直接展示配置引导 |
| `E_UNSUPPORTED_UNIT` | 单位不认识或跨类别 | 说明支持哪些类别，请用户换单位 |
| `E_BAD_URL` | 链接非法或非 http(s) | 请用户给完整网址 |
| `E_UNSUPPORTED_TYPE` / `E_TOO_LARGE` / `E_EMPTY` | 网页类型不支持 / 太大 / 无正文 | 如实说明抓不到，**不要凭标题猜内容** |
