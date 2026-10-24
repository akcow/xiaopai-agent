/** 入口：迁移数据库 → 起 HTTP 服务 → 收到信号时优雅收尾。 */
import { createServer } from "node:http";
import { closeDb, migrate } from "./data/db.js";
import { HOST, PORT, ensureRuntimeDirs } from "./config.js";
import { disposeAll } from "./agent/sessionStore.js";
import { assertApiKey, configHint, describeModel } from "./agent/provider.js";
import { MCP_SERVERS } from "./agent/mcpServers.js";
import { handle } from "./http/routes.js";

ensureRuntimeDirs();
migrate();

const server = createServer((req, res) => {
  void handle(req, res);
});

server.listen(PORT, HOST, () => {
  console.log(`小派已就绪  http://${HOST}:${PORT}`);
  console.log(`模型：${describeModel()}`);
  console.log(`MCP 服务器：${MCP_SERVERS.map((s) => s.name).join(", ")}`);
  try {
    assertApiKey();
  } catch {
    console.log("\n⚠️  还没配置模型 key，直接对话会报错。\n" + configHint() + "\n");
  }
});

async function shutdown(signal: string): Promise<void> {
  console.log(`\n收到 ${signal}，正在关闭…`);
  server.close();
  await disposeAll();
  closeDb();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
