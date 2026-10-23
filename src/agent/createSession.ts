/**
 * 会话工厂：把模型、系统提示词、文件工具、三个 MCP 服务器装配成一个 AgentSession。
 * 每次调用都会新建一个 session，历史由传入的 SessionManager 负责（这样重建会话不丢上下文）。
 */
import {
  createAgentSession,
  createMcpExtension,
  DefaultResourceLoader,
  SettingsManager,
  type AgentSession,
  type SessionManager,
} from "@earendil-works/pi-coding-agent";
import { AGENT_DIR, MINIMAL_TOOLS, ROOT } from "../config.js";
import { createFileToolsExtension } from "./fileTools.js";
import { createMcpBridgeExtension } from "./mcpBridge.js";
import { MCP_SERVERS } from "./mcpServers.js";
import { loadModel } from "./provider.js";
import { buildPersonaAppend } from "./systemPrompt.js";

export interface CreateSessionParams {
  sessionManager: SessionManager;
  /** 首个 prompt 等待 direct 型 MCP 工具连上的上限 */
  startupWaitMs?: number;
}

export async function createXiaopaiSession({
  sessionManager,
  startupWaitMs = 15000,
}: CreateSessionParams): Promise<AgentSession> {
  const { runtime, model } = await loadModel();

  const resourceLoader = new DefaultResourceLoader({
    cwd: ROOT,
    agentDir: AGENT_DIR,
    extensionFactories: [
      createFileToolsExtension(),
      createMcpBridgeExtension(),
      createMcpExtension({ startupWaitMs }),
      // 排查用：把每次发给模型的请求摘要打到 stderr（XIAOPAI_DEBUG_REQUESTS=1）
      (pi) => {
        if (process.env.XIAOPAI_DEBUG_REQUESTS !== "1") return;
        pi.on("before_provider_request", (event) => {
          const payload = event.payload as {
            tools?: { name?: string; function?: { name?: string } }[];
            messages?: unknown[];
          };
          const names = (payload?.tools ?? []).map((t) => t.function?.name ?? t.name ?? "?");
          const msgs = (payload?.messages ?? []) as { role?: string; tool_call_id?: string; content?: unknown }[];
          const shape = msgs.map((m) => (m.role === "tool" ? `tool${m.tool_call_id ? "" : "(no-id)"}` : m.role)).join(">");
          const anyPayload = payload as { tool_choice?: unknown; parallel_tool_calls?: unknown };
          process.stderr.write(
            `[req] tools=${names.length} mcp=${names.filter((n) => n.startsWith("mcp__")).length} choice=${JSON.stringify(anyPayload.tool_choice)} shape=${shape}\n`,
          );
        });
      },
    ],
    // 只追加，不替换：Pi 默认提示词里有工具调用协议说明，小模型很依赖它
    appendSystemPromptOverride: (base) => [...base, "", buildPersonaAppend()],
  });
  await resourceLoader.reload();

  const settingsManager = SettingsManager.create(ROOT);

  const { session } = await createAgentSession({
    cwd: ROOT,
    agentDir: AGENT_DIR,
    model,
    modelRuntime: runtime,
    resourceLoader,
    settingsManager,
    sessionManager,
    thinkingLevel: "off",
    // 关掉内置 read/write/edit/bash，文件能力只走 workspace 内的自定义工具
    noTools: "builtin",
  });

  // 触发 session_start，MCP 服务器在这一步连上
  await session.bindExtensions({});
  await waitForMcpTools(session);
  return session;
}

/**
 * MCP 是三个独立子进程，连接是异步的。如果不等它们到齐就发问，
 * 模型看不到待办/记忆工具，会把"记下了"直接编出来（我们实测踩过）。
 */
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function expectedMcpToolCount(): number {
  return MCP_SERVERS.reduce(
    (sum, def) => sum + def.toolCount - (MINIMAL_TOOLS ? (def.hiddenWhenMinimal?.length ?? 0) : 0),
    0,
  );
}

async function waitForMcpTools(session: AgentSession, timeoutMs = 15000): Promise<void> {
  const expected = expectedMcpToolCount();
  const startedAt = Date.now();
  let got = 0;
  while (Date.now() - startedAt < timeoutMs) {
    got = session.getActiveToolNames().filter((n) => n.startsWith("mcp__")).length;
    if (got >= expected) return;
    await sleep(200);
  }
  throw new Error(
    `MCP 工具只连上 ${got}/${expected} 个。先跑 npm run smoke:mcp 确认服务器能单独启动，再检查 dist/mcp/*/index.js 是否已构建。`,
  );
}

export function toolNamesOf(session: AgentSession): string[] {
  return session.getActiveToolNames();
}
