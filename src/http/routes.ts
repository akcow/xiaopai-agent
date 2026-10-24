/** 路由层。只用 node:http + 手写 JSON 解析，依赖为零。 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { attachForwarder } from "../agent/events.js";
import { assertApiKey, configHint, describeModel } from "../agent/provider.js";
import { acquireSession, getRecord, refreshIfFactsChanged } from "../agent/sessionStore.js";
import { MCP_SERVERS } from "../agent/mcpServers.js";
import { listMemories } from "../data/memories.js";
import { listTodos, todoStats } from "../data/todos.js";
import { MODEL_ID, MODEL_PROVIDER, PORT } from "../config.js";
import { SSEWriter } from "./sse.js";
import { serveStatic } from "./static.js";

const startedAt = Date.now();

function json(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(text);
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > 1024 * 1024) throw new Error("请求体过大");
    chunks.push(chunk as Buffer);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}

/** 从会话条目里投影出前端要的对话历史 */
function projectHistory(sessionId: string): { role: string; text: string }[] {
  const record = getRecord(sessionId);
  if (!record) return [];
  const messages: { role: string; text: string }[] = [];
  for (const entry of record.manager.getEntries()) {
    const e = entry as unknown as { type?: string; message?: { role?: string; content?: unknown } };
    if (e.type !== "message" || !e.message) continue;
    const role = e.message.role;
    if (role !== "user" && role !== "assistant") continue;
    const content = e.message.content;
    const text =
      typeof content === "string"
        ? content
        : Array.isArray(content)
          ? content
              .filter((c) => (c as { type?: string }).type === "text")
              .map((c) => (c as { text?: string }).text ?? "")
              .join("")
          : "";
    if (text.trim()) messages.push({ role, text });
  }
  return messages;
}

export async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const path = url.pathname;

  try {
    if (path === "/api/health") {
      return json(res, 200, {
        ok: true,
        model: `${MODEL_PROVIDER}/${MODEL_ID}`,
        modelDetail: describeModel(),
        node: process.version,
        port: PORT,
        uptimeSec: Math.round((Date.now() - startedAt) / 1000),
        mcpServers: MCP_SERVERS.map((s) => s.name),
      });
    }

    if (path === "/api/tools") {
      const sessionId = url.searchParams.get("sessionId");
      const record = sessionId ? getRecord(sessionId) : undefined;
      const tools = record?.session.getActiveToolNames() ?? [];
      return json(res, 200, { count: tools.length, tools, linked: Boolean(record) });
    }

    if (path === "/api/todos") {
      const status = (url.searchParams.get("status") ?? "pending") as "pending" | "done" | "all";
      return json(res, 200, {
        stats: todoStats(),
        items: listTodos({ status, limit: 30 }),
      });
    }

    if (path === "/api/memories") {
      const items = listMemories(30);
      return json(res, 200, { count: items.length, items });
    }

    if (path === "/api/history") {
      const sessionId = url.searchParams.get("sessionId") ?? "";
      return json(res, 200, { sessionId, messages: sessionId ? projectHistory(sessionId) : [] });
    }

    if (path === "/api/chat" && req.method === "POST") {
      const body = await readJson(req);
      const text = String(body.text ?? "").trim();
      if (!text) return json(res, 400, { error: "text 不能为空" });
      const sessionId = typeof body.sessionId === "string" && body.sessionId ? body.sessionId : null;

      const sse = new SSEWriter(res);
      let record;
      try {
        // 先检查 key，缺了就给出能照做的提示，而不是把 Pi 的英文报错直接甩给用户
        assertApiKey();
        record = await acquireSession(sessionId);
      } catch (e) {
        sse.send({ type: "error", code: "E_MODEL_CONFIG", message: (e as Error).message });
        sse.close();
        return;
      }

      sse.send({ type: "session", sessionId: record.id });
      const detach = attachForwarder(record.session, (event) => sse.send(event));

      try {
        record.busy = true;
        await record.session.prompt(text);
        // 本轮可能写入了新记忆 → 重建会话，让下一轮 systemPrompt 带上它
        const rebuilt = await refreshIfFactsChanged(record);
        if (rebuilt) sse.send({ type: "session", sessionId: record.id });
      } catch (e) {
        const message = (e as Error).message;
        const friendly = /api key/i.test(message) ? configHint() : message;
        sse.send({
          type: "error",
          code: /api key/i.test(message) ? "E_MODEL_CONFIG" : "E_AGENT",
          message: friendly,
        });
      } finally {
        record.busy = false;
        detach();
        sse.close();
      }
      return;
    }

    if (path === "/api/abort" && req.method === "POST") {
      const body = await readJson(req);
      const sessionId = String(body.sessionId ?? "");
      const record = getRecord(sessionId);
      if (record) await record.session.abort();
      return json(res, 200, { ok: true, aborted: Boolean(record) });
    }

    if (serveStatic(path, res)) return;
    json(res, 404, { error: "not found", path });
  } catch (e) {
    if (!res.headersSent) json(res, 500, { error: (e as Error).message });
    else res.end();
  }
}
