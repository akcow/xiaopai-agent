/** xiaopai-web：抓一个网页的标题和正文，交给模型做摘要。只读，不允许发请求以外的副作用。 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { fail, logStart, ok } from "../_shared/mcpKit.js";
import { extractFromHtml, normalizeUrl } from "./extract.js";

const server = new McpServer({ name: "xiaopai-web", version: "1.0.0" });
const MAX_BYTES = 600 * 1024;

server.registerTool(
  "fetch_url",
  {
    title: "读取网页正文",
    description:
      "当用户发来一个链接、或说“帮我看看这篇文章讲了什么”时调用。返回网页标题和正文纯文本，由你再概括。只能读公开网页，不能登录、不能提交表单。",
    inputSchema: {
      url: z.string().min(4).max(500).describe("完整网址，没写 http(s) 会自动补 https"),
      maxChars: z.number().int().min(200).max(8000).optional().describe("最多返回多少字符，默认 3000"),
    },
  },
  async ({ url, maxChars }) => {
    const normalized = normalizeUrl(url);
    if (!normalized) return fail("E_BAD_URL", `这不是一个合法的网址：${url}`);

    try {
      const res = await fetch(normalized, {
        signal: AbortSignal.timeout(10000),
        redirect: "follow",
        headers: { "User-Agent": "Mozilla/5.0 (compatible; xiaopai-agent/1.0)", Accept: "text/html,*/*" },
      });
      if (!res.ok) return fail("E_UPSTREAM", `对方返回 ${res.status}，可能不允许抓取或页面不存在。`);

      const contentType = res.headers.get("content-type") ?? "";
      if (!/text\/html|text\/plain|application\/(xhtml|json)/i.test(contentType)) {
        return fail("E_UNSUPPORTED_TYPE", `这个链接是 ${contentType || "未知类型"}，只能读网页文本。`);
      }

      const buffer = await res.arrayBuffer();
      if (buffer.byteLength > MAX_BYTES) {
        return fail("E_TOO_LARGE", `页面太大（${Math.round(buffer.byteLength / 1024)}KB），请换一个更轻的页面。`);
      }

      const html = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
      const page = extractFromHtml(html, maxChars ?? 3000);
      if (!page.text) return fail("E_EMPTY", "这个页面没有可读正文（可能是纯前端渲染或需要登录）。");

      return ok(`《${page.title || normalized}》\n\n${page.text}`, {
        url: normalized,
        title: page.title,
        chars: page.text.length,
        truncated: page.truncated,
      });
    } catch (e) {
      const message = (e as Error).message;
      const hint = /timeout|aborted/i.test(message) ? "（请求超时，10 秒）" : "";
      return fail("E_UPSTREAM", `抓取失败${hint}：${message}`);
    }
  },
);

logStart("xiaopai-web");
await server.connect(new StdioServerTransport());
