/** MCP 工具的返回约定：成功给"中文摘要 + 结构化数据"，失败给"错误[E_XXX] 人话原因"。 */

export interface ToolResult {
  [key: string]: unknown;
  content: { type: "text"; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

/** 小模型先读中文摘要，需要细节时再读 JSON，所以两者都给 */
export function ok(text: string, data?: unknown): ToolResult {
  const result: ToolResult = {
    content: [
      {
        type: "text",
        text: data === undefined ? text : `${text}\n\n${JSON.stringify(data, null, 2)}`,
      },
    ],
  };
  if (data !== undefined && typeof data === "object" && data !== null) {
    result.structuredContent = data as Record<string, unknown>;
  }
  return result;
}

export function fail(code: string, message: string): ToolResult {
  return {
    isError: true,
    content: [{ type: "text", text: `错误[${code}] ${message}` }],
  };
}

/** 把任意异常转成统一的 E_DB / E_UPSTREAM 形态，避免把堆栈直接吐给模型 */
export function failFrom(e: unknown, code = "E_DB"): ToolResult {
  const message = e instanceof Error ? e.message : String(e);
  return fail(code, message);
}

export function logStart(serverName: string): void {
  // MCP 用 stdio 通信，日志只能走 stderr，否则会污染协议流
  process.stderr.write(`[${serverName}] started, pid=${process.pid}\n`);
}
