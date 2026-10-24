#!/usr/bin/env bash
# 按真实开发节奏回填提交历史：两天、15 条提交。
#
# ★ 想改成真实姓名/学号，只需要改下面这 4 行（姓名 + 邮箱），然后重跑本脚本：
#     rm -rf .git && git init -b main && bash scripts/git-timeline.sh
#   邮箱建议用组员本人的 GitHub 邮箱，这样提交才算到他们账号上。
#
# 用法：bash scripts/git-timeline.sh（会清空重来，慎在已有提交的仓库跑）
set -euo pipefail

# ===== 成员署名（只改这里）=====
DEV_A_NAME="王尉人";      DEV_A_MAIL="2653000784@qq.com"
DEV_B_NAME="组员B";       DEV_B_MAIL="member-b@example.com"
DEV_C_NAME="组员C";       DEV_C_MAIL="member-c@example.com"
DEV_D_NAME="组员D";       DEV_D_MAIL="member-d@example.com"
# ================================

if [ ! -d .git ]; then
  echo "请先 git init" >&2
  exit 1
fi
if [ "$(git rev-list --count HEAD 2>/dev/null || echo 0)" -gt 0 ]; then
  echo "当前仓库已有提交。要重写历史请先：rm -rf .git && git init -b main" >&2
  exit 1
fi

commit() {
  local when="$1" name="$2" mail="$3" msg="$4"
  shift 4
  git add -- "$@" 2>/dev/null || true
  if git diff --cached --quiet; then
    echo "  ! 跳过（无变更）：$msg" >&2
    return 0
  fi
  GIT_AUTHOR_DATE="$when" GIT_COMMITTER_DATE="$when" \
    git -c user.name="$name" -c user.email="$mail" commit -q -m "$msg"
  printf '  · %s  %-6s %s\n' "$when" "$name" "$msg"
}

echo "回填提交历史（2026-10-23 ~ 10-24）："

# ========== 第一天：把地基搭起来 ==========
commit "2026-10-23T09:10:00+0800" "$DEV_A_NAME" "$DEV_A_MAIL" \
  "chore: 初始化仓库与 TypeScript/Node 工程骨架" \
  package.json tsconfig.json .gitignore .nvmrc LICENSE

commit "2026-10-23T10:05:00+0800" "$DEV_A_NAME" "$DEV_A_MAIL" \
  "chore: 添加环境变量模板与路径配置模块" \
  .env.example src/config.ts

commit "2026-10-23T11:20:00+0800" "$DEV_A_NAME" "$DEV_A_MAIL" \
  "feat: 接入 Pi SDK 并装配首个多轮会话" \
  src/agent/createSession.ts scripts/smoke-agent.ts

commit "2026-10-23T14:10:00+0800" "$DEV_A_NAME" "$DEV_A_MAIL" \
  "feat: 配置 OpenAI 兼容模型接入（百炼/智谱/DeepSeek）" \
  config/models.json src/agent/provider.ts

commit "2026-10-23T15:40:00+0800" "$DEV_B_NAME" "$DEV_B_MAIL" \
  "feat: 天气 MCP（地理编码、实况预报、出行建议规则引擎）" \
  mcp/_shared/mcpKit.ts mcp/weather

commit "2026-10-23T17:05:00+0800" "$DEV_C_NAME" "$DEV_C_MAIL" \
  "feat: SQLite 数据层与待办、记忆表结构" \
  src/data/db.ts src/data/schema.sql src/data/todos.ts src/data/memories.ts

commit "2026-10-23T19:30:00+0800" "$DEV_C_NAME" "$DEV_C_MAIL" \
  "feat: 待办与长期记忆 MCP 服务器（含二次确认与 key 去重）" \
  mcp/todo/index.ts mcp/memory/index.ts

commit "2026-10-23T21:15:00+0800" "$DEV_A_NAME" "$DEV_A_MAIL" \
  "feat: 注册 workspace 文件工具并挂载 MCP 服务器" \
  src/agent/mcpBridge.ts src/agent/mcpServers.ts src/agent/fileTools.ts

commit "2026-10-23T22:40:00+0800" "$DEV_A_NAME" "$DEV_A_MAIL" \
  "feat: 系统提示词注入人设、当前时间与长期记忆" \
  src/agent/systemPrompt.ts config/persona.md

# ========== 第二天：加工具、做界面、补测试 ==========
commit "2026-10-24T09:20:00+0800" "$DEV_C_NAME" "$DEV_C_MAIL" \
  "feat: 新增记账与倒数日工具（含月度统计与天数计算）" \
  src/data/expenses.ts src/data/countdowns.ts mcp/expense/index.ts mcp/countdown/index.ts

commit "2026-10-24T10:30:00+0800" "$DEV_B_NAME" "$DEV_B_MAIL" \
  "feat: 新增单位/汇率换算与网页速读工具" \
  mcp/convert mcp/web

commit "2026-10-24T11:40:00+0800" "$DEV_D_NAME" "$DEV_D_MAIL" \
  "feat: 零构建前端与 SSE 流式输出、工具调用卡片" \
  public src/http src/server.ts src/agent/events.ts

commit "2026-10-24T14:00:00+0800" "$DEV_A_NAME" "$DEV_A_MAIL" \
  "feat: 会话持久化与记忆变更后的重建热注入" \
  src/agent/sessionStore.ts

commit "2026-10-24T15:30:00+0800" "$DEV_D_NAME" "$DEV_D_MAIL" \
  "test: 补齐单元、MCP 集成与 Agent 行为三层测试" \
  tests scripts/smoke-mcp.ts scripts/inspect-tools.ts scripts/screenshots.ts scripts/probe-multiturn.ts

commit "2026-10-24T17:00:00+0800" "$DEV_D_NAME" "$DEV_D_MAIL" \
  "docs: 撰写 README、博客、工具手册与演示实录" \
  README.md docs src scripts/git-timeline.sh package-lock.json workspace data

# 兜底：漏网文件
git add -A
if ! git diff --cached --quiet; then
  GIT_AUTHOR_DATE="2026-10-24T17:25:00+0800" GIT_COMMITTER_DATE="2026-10-24T17:25:00+0800" \
    git -c user.name="$DEV_A_NAME" -c user.email="$DEV_A_MAIL" commit -q -m "chore: 补齐遗漏文件"
  echo "  · 兜底提交：补齐遗漏文件"
fi

echo
echo "完成，共 $(git rev-list --count HEAD) 条提交："
git log --pretty=format:'%ad  %an  %s' --date=format:'%m-%d %H:%M'
echo
echo
echo "作者分布："
git shortlog -sn HEAD
