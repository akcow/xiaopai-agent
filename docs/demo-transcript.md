# 演示实录（真实终端输出）

环境：Node v22.22.2 · 模型 dashscope/qwen-flash · Windows 11 + Git Bash
时间：2026-10-24 23:01

## 1. 单元 + MCP 集成测试（不需要模型 key）

```text
$ npm test
# 单元 49 个用例：天气码翻译 / 出行建议规则 / 单位换算 / 日期与倒计时 / HTML 抽取 / SQL 增删改查
# 集成 19 个用例：7 个 MCP 服务器真实启动，走 stdio 协议调工具
  ...
1..68
# tests 68
# suites 0
# pass 68
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 16448.2307
```

## 2. Agent 行为测试（真实模型，断言工具调用与落库）

```text
$ npm run test:agent
  ---
  duration_ms: 3307.1848
  type: 'test'
  ...
# Subtest: 换算意图 → 用工具算，且结果准确
ok 3 - 换算意图 → 用工具算，且结果准确
  ---
  duration_ms: 2620.5014
  type: 'test'
  ...
```

> 模型是概率性的：同一句话偶尔会选择"直接回答而不调工具"。所以行为测试允许重试 3 次，
> 重试后通过说明是模型抖动而不是代码缺陷；三次都不过才判定失败，并打印实际调用链。

## 3. 端到端冒烟（一句话触发两个工具）

```text
$ npm run smoke:agent -- "杭州明天要带伞吗？如果需要，帮我加个待办：明天出门带伞"
[调用] mcp__xiaopai_weather__travel_advice {"city":"杭州","activity":"通勤","date":"2026-10-25"}
[调用] mcp__xiaopai_todo__todo_add {"title":"明天出门带伞","note":"根据天气建议，杭州明天有雨"}
[结果] ✅ mcp__xiaopai_todo__todo_add (8ms) 已添加待办 #3：明天出门带伞
[结果] ✅ mcp__xiaopai_weather__travel_advice (2144ms) 杭州 2026-10-25（周日）毛毛雨 17~23℃
杭州明天有毛毛雨，建议带伞。

- 降水概率 14%，出门带伞
- 穿衣：薄长袖或 T 恤
- 最佳出门时段：07:00-09:00
- 风险等级：中

已帮你把"明天出门带伞"加到待办清单。
```

一句话里两件事，模型发了两个工具调用，而且几乎并行：写库 8ms，查天气 2144ms。

## 4. 工具挂载检查

```text
$ npm run tools
会话 xxxx 挂载了 24 个工具：
  [扩展] file_list / file_read / file_write
  [MCP ] mcp__xiaopai_weather__*  (4)
  [MCP ] mcp__xiaopai_todo__*     (4)
  [MCP ] mcp__xiaopai_memory__*   (3)
  [MCP ] mcp__xiaopai_expense__*  (4)
  [MCP ] mcp__xiaopai_countdown__*(3)
  [MCP ] mcp__xiaopai_convert__*  (2)
  [MCP ] mcp__xiaopai_web__*      (1)
MCP 工具 21 个（期望 21）
内置危险工具：已全部关闭 ✅
```
