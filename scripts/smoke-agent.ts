/**
 * Agent 端到端冒烟（无界面）：跑一轮真实对话，把工具调用和最终回答打出来。
 * 这段输出会直接进 docs/demo-transcript.md，所以格式要能看懂。
 */
import { migrate } from "../src/data/db.js";
import { disposeAll, acquireSession, refreshIfFactsChanged } from "../src/agent/sessionStore.js";
import { attachForwarder } from "../src/agent/events.js";
import { assertApiKey, describeModel } from "../src/agent/provider.js";

const PROMPT = process.argv[2] ?? "杭州明天要带伞吗？如果需要，帮我加个待办：明天出门带伞";

migrate();
assertApiKey();

console.log("== 小派 Agent 端到端冒烟 ==");
console.log(`模型：${describeModel()}`);
console.log(`输入：${PROMPT}\n`);

const record = await acquireSession(null);
console.log(`会话：${record.id}`);

// MCP 是子进程，逐个连上需要时间；等 11 个 MCP 工具到齐再说，否则模型看不到工具就会瞎编
const deadline = Date.now() + 20000;
while (Date.now() < deadline) {
  const names = record.session.getActiveToolNames();
  if (names.filter((n) => n.startsWith("mcp__")).length >= 11) break;
  await new Promise((r) => setTimeout(r, 250));
}

const activeTools = record.session.getActiveToolNames();
console.log(`已连接工具 ${activeTools.length} 个：`);
for (const name of activeTools) console.log(`  - ${name}`);
console.log("");

const t0 = Date.now();
const detach = attachForwarder(record.session, (event) => {
  if (event.type === "tool_start") {
    console.log(`[调用] ${event.name} ${JSON.stringify(event.args)}`);
  } else if (event.type === "tool_end") {
    console.log(`[结果] ${event.isError ? "❌" : "✅"} ${event.name} (${event.durationMs ?? "?"}ms) ${event.summary}`);
  } else if (event.type === "text_delta") {
    process.stdout.write(event.text);
  } else if (event.type === "error") {
    console.log(`\n[错误] ${event.message}`);
  }
});

try {
  await record.session.prompt(PROMPT);
  console.log(`\n\n== 本轮结束，耗时 ${Date.now() - t0}ms ==`);
  const rebuilt = await refreshIfFactsChanged(record);
  if (rebuilt) console.log("（本轮写入了新记忆，已重建会话热注入）");
} catch (e) {
  console.error(`\n运行失败：${(e as Error).message}`);
  process.exitCode = 1;
} finally {
  detach();
  await disposeAll();
  // MCP 子进程会拖住事件循环
  process.exit(process.exitCode ?? 0);
}
