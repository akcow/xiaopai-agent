/**
 * Agent 行为测试（需要真实模型）。
 *
 * 这一层不测函数，测的是"模型有没有按我们的期望去用工具"：
 * 给它一句话，断言它调了哪个工具、有没有真的写进数据库、回答里有没有该有的信息。
 * 没有 key 时整组自动跳过，所以 CI 里不会因为缺密钥而红。
 *
 * 运行：npm run test:agent
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "xiaopai-agent-test-"));
process.env.XIAOPAI_DB = join(dir, "test.db");

// 触发 .env 加载后再判断有没有密钥
await import("../../src/config.js");
const hasKey = Boolean(process.env.DASHSCOPE_API_KEY);

const { migrate, closeDb } = await import("../../src/data/db.js");
const { acquireSession, disposeAll, refreshIfFactsChanged } = await import("../../src/agent/sessionStore.js");
const { listTodos } = await import("../../src/data/todos.js");

migrate();
test.after(async () => {
  await disposeAll();
  closeDb();
});

interface TurnResult {
  tools: string[];
  reply: string;
}

/** 跑一轮真实对话，记录调用了哪些工具、最终回答是什么 */
async function runTurn(prompt: string): Promise<TurnResult> {
  const record = await acquireSession(null);
  const tools: string[] = [];
  const detach = record.session.subscribe((event) => {
    const e = event as unknown as { type: string; toolName?: string };
    if (e.type === "tool_execution_start" && e.toolName) tools.push(e.toolName);
  });
  try {
    await record.session.prompt(prompt);
    await refreshIfFactsChanged(record);
    return { tools, reply: record.session.getLastAssistantText() ?? "" };
  } finally {
    detach();
  }
}

const skip = hasKey ? false : "未配置 DASHSCOPE_API_KEY，跳过真实模型测试";

/**
 * 模型是概率性的：同一句话偶尔会选择"直接回答而不调工具"。
 * 这不是代码 bug，所以行为测试允许重试（最多 3 次），失败时才报错并带出实际调用。
 */
async function withRetry<T>(label: string, fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      console.log(`    · ${label} 第 ${i}/${attempts} 次未通过，重试`);
    }
  }
  throw lastError;
}

test("天气意图 → 调用天气工具，而不是凭记忆作答", { skip, timeout: 240000 }, async () => {
  await withRetry("天气", async () => {
    const { tools, reply } = await runTurn("杭州明天要带伞吗？");
    assert.ok(
      tools.some((t) => t.includes("weather") || t.includes("travel_advice")),
      `期望调用天气工具，实际：${tools.join(",") || "无"}`,
    );
    assert.match(reply, /伞|雨|晴|℃/, "回答里应包含具体的天气结论");
  });
});

test("待办意图 → 真的写进了数据库", { skip, timeout: 240000 }, async () => {
  const title = `交软件工程作业-${Date.now()}`;
  await withRetry("待办", async () => {
    const { tools } = await runTurn(`帮我记个待办：${title}`);
    assert.ok(tools.includes("mcp__xiaopai_todo__todo_add"), `实际调用：${tools.join(",")}`);
    const hit = listTodos({ status: "pending", limit: 50 }).find((t) => t.title.includes(title));
    assert.ok(hit, "数据库里应能查到这条待办");
  });
});

test("换算意图 → 用工具算，且结果准确", { skip, timeout: 240000 }, async () => {
  await withRetry("换算", async () => {
    const { tools, reply } = await runTurn("100 华氏度是多少摄氏度？");
    assert.ok(tools.some((t) => t.includes("convert_unit")), `实际调用：${tools.join(",")}`);
    assert.match(reply, /37\.7/, "100℉ 应换算为 37.78℃ 左右");
  });
});


