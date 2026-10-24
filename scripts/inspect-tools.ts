/** 检查会话装配：不调用模型，只打印三个 MCP 服务器 + 文件工具是否都挂上了。 */
import { migrate } from "../src/data/db.js";
import { acquireSession, disposeAll } from "../src/agent/sessionStore.js";
import { expectedMcpToolCount } from "../src/agent/createSession.js";
import { MCP_SERVERS } from "../src/agent/mcpServers.js";
import { describeModel } from "../src/agent/provider.js";

migrate();
console.log(`模型：${describeModel()}`);
console.log(`MCP 服务器：${MCP_SERVERS.map((s) => s.name).join(", ")}\n`);

const record = await acquireSession(null);

// MCP 服务器是三个独立子进程，逐个连上需要一点时间，这里轮询到齐或超时
const deadline = Date.now() + 20000;
let tools: string[] = [];
while (Date.now() < deadline) {
  tools = record.session.getActiveToolNames();
  if (tools.filter((t) => t.startsWith("mcp__")).length >= expectedMcpToolCount()) break;
  await new Promise((r) => setTimeout(r, 250));
}

console.log(`会话 ${record.id} 挂载了 ${tools.length} 个工具：`);
for (const name of tools) {
  const tag = name.startsWith("mcp__") ? "MCP " : "扩展";
  console.log(`  [${tag}] ${name}`);
}

const mcpCount = tools.filter((t) => t.startsWith("mcp__")).length;
const builtin = tools.filter((t) => ["bash", "read", "write", "edit"].includes(t));

console.log(`\nMCP 工具 ${mcpCount} 个（期望 ${expectedMcpToolCount()}）`);
console.log(`内置危险工具：${builtin.length ? builtin.join(", ") + " ← 应当为空！" : "已全部关闭 ✅"}`);
console.log(`系统提示词长度：${record.session.systemPrompt.length} 字符`);

await disposeAll();
// MCP 子进程会拖住事件循环，脚本里要显式退出
process.exit(mcpCount === expectedMcpToolCount() && builtin.length === 0 ? 0 : 1);
