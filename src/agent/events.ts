/** AgentSession 事件 → 前端 SSE 事件。前端只认这一套，Pi 的事件字段变了只改这里。 */
import type { AgentSession } from "@earendil-works/pi-coding-agent";

export type FrontendEvent =
  | { type: "session"; sessionId: string }
  | { type: "turn_start"; turnId: string }
  | { type: "text_delta"; text: string }
  | { type: "tool_start"; id: string; name: string; args: unknown }
  | { type: "tool_end"; id: string; name: string; isError: boolean; durationMs?: number; summary: string }
  | { type: "message_end"; text: string }
  | { type: "turn_end"; toolCalls: number; durationMs: number }
  | { type: "error"; code: string; message: string };

type LooseEvent = { type: string; [key: string]: any };

/** 工具结果里的第一段文本，截断到 300 字，前端工具卡片直接展示 */
function summarizeResult(result: unknown): string {
  const content = (result as { content?: { type?: string; text?: string }[] } | undefined)?.content;
  const text = content?.find((c) => c.type === "text")?.text ?? "";
  const firstLine = text.split("\n").find((line) => line.trim()) ?? "";
  return firstLine.length > 300 ? `${firstLine.slice(0, 300)}…` : firstLine;
}

function textOfMessage(message: unknown): string {
  const content = (message as { content?: unknown })?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((c): c is { type: string; text: string } => !!c && (c as { type?: string }).type === "text")
      .map((c) => c.text)
      .join("");
  }
  return "";
}

export function attachForwarder(
  session: AgentSession,
  emit: (event: FrontendEvent) => void,
): () => void {
  const startedAt = Date.now();
  let toolCalls = 0;

  return session.subscribe((raw) => {
    const event = raw as unknown as LooseEvent;

    switch (event.type) {
      case "agent_start":
        emit({ type: "turn_start", turnId: `${Date.now()}` });
        break;

      case "message_update": {
        const inner = event.assistantMessageEvent as LooseEvent | undefined;
        if (inner?.type === "text_delta" && typeof inner.delta === "string") {
          emit({ type: "text_delta", text: inner.delta });
        }
        break;
      }

      case "tool_execution_start":
        toolCalls += 1;
        emit({
          type: "tool_start",
          id: String(event.toolCallId ?? event.id ?? ""),
          name: String(event.toolName ?? event.name ?? "unknown"),
          args: event.args ?? event.arguments ?? {},
        });
        break;

      case "tool_execution_end":
        emit({
          type: "tool_end",
          id: String(event.toolCallId ?? event.id ?? ""),
          name: String(event.toolName ?? event.name ?? "unknown"),
          isError: Boolean(event.isError),
          durationMs: typeof event.durationMs === "number" ? event.durationMs : undefined,
          summary: summarizeResult(event.result),
        });
        break;

      case "message_end": {
        const message = event.message as { role?: string } | undefined;
        if (message?.role === "assistant") {
          emit({ type: "message_end", text: textOfMessage(message) });
        }
        break;
      }

      case "agent_end":
        emit({ type: "turn_end", toolCalls, durationMs: Date.now() - startedAt });
        break;

      case "auto_retry_start":
        emit({
          type: "error",
          code: "E_RETRY",
          message: `模型繁忙，${Math.round((event.delayMs ?? 0) / 1000)} 秒后重试（第 ${event.attempt} 次）`,
        });
        break;

      default:
        break;
    }
  });
}
