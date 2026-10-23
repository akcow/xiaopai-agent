/** xiaopai-memory：长期事实的记住/召回/忘记。和小派 systemPrompt 注入共用一张表。 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { fail, failFrom, logStart, ok } from "../_shared/mcpKit.js";
import { migrate } from "../../src/data/db.js";
import { forgetMemories, recallMemories, rememberMemory } from "../../src/data/memories.js";

migrate();
const server = new McpServer({ name: "xiaopai-memory", version: "1.0.0" });

server.registerTool(
  "memory_remember",
  {
    title: "记住用户的长期事实",
    description:
      "当用户主动说出稳定的个人信息或偏好（住在哪、不吃什么、上什么班、作息、称呼）时调用。同一件事重复说只更新不新增，用 key 去重。",
    inputSchema: {
      content: z.string().min(1).max(200).describe("要记住的事实，用一句完整的中文，例如“用户住在杭州”"),
      category: z.enum(["profile", "preference", "event"]).optional().describe("profile=基本信息，preference=偏好，event=一次性事件"),
      key: z.string().max(40).optional().describe("去重键，例如 city、diet_cilantro；同一 key 再写会覆盖"),
    },
  },
  async ({ content, category, key }) => {
    if (!content.trim()) return fail("E_VALIDATION", "要记住的内容不能为空。");
    try {
      const { row, created } = rememberMemory({ content, category, key });
      return ok(created ? `已记住：${row.content}` : `已更新记忆：${row.content}`, {
        id: row.id,
        content: row.content,
        category: row.category,
        created,
      });
    } catch (e) {
      return failFrom(e);
    }
  },
);

server.registerTool(
  "memory_recall",
  {
    title: "召回记忆",
    description:
      "当需要确认用户之前说过的信息（住哪、喜好、习惯）时调用。不传 query 返回最近的记忆，传 query 按关键词模糊匹配。",
    inputSchema: {
      query: z.string().max(50).optional().describe("关键词，例如 城市、口味"),
      limit: z.number().int().min(1).max(30).optional().describe("返回条数，默认 10"),
    },
  },
  async ({ query, limit }) => {
    try {
      const items = recallMemories(query, limit ?? 10);
      if (items.length === 0) return ok("没有相关的记忆。", { count: 0, items: [] });
      return ok(
        [`找到 ${items.length} 条记忆：`, ...items.map((m) => `- #${m.id} [${m.category}] ${m.content}`)].join("\n"),
        { count: items.length, items },
      );
    } catch (e) {
      return failFrom(e);
    }
  },
);

server.registerTool(
  "memory_forget",
  {
    title: "忘记某条记忆",
    description:
      "当用户说“忘掉这件事”“以后别再提”时调用。按 id 删最准；按 query 删除时如果命中多条会返回候选，要先让用户确认。",
    inputSchema: {
      id: z.number().int().positive().optional().describe("记忆 id"),
      query: z.string().max(50).optional().describe("关键词，命中多条时不会删，会返回候选"),
    },
  },
  async ({ id, query }) => {
    if (id === undefined && !query) return fail("E_VALIDATION", "要么给 id，要么给 query。");
    try {
      const result = forgetMemories({ id, query });
      if (result.candidates) {
        return fail(
          "E_AMBIGUOUS",
          `“${query}”命中 ${result.candidates.length} 条：${result.candidates
            .map((c) => `#${c.id} ${c.content}`)
            .join("；")}。请确认要删哪一条。`,
        );
      }
      if (result.deleted === 0) return fail("E_NOT_FOUND", "没有匹配到可删除的记忆。");
      return ok(`已忘记：${result.rows.map((r) => r.content).join("；")}`, {
        deleted: result.deleted,
        ids: result.rows.map((r) => r.id),
      });
    } catch (e) {
      return failFrom(e);
    }
  },
);

logStart("xiaopai-memory");
await server.connect(new StdioServerTransport());
