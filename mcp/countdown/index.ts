/** xiaopai-countdown：倒数日。考试、截止日、纪念日都放这里。 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { fail, failFrom, logStart, ok } from "../_shared/mcpKit.js";
import { migrate } from "../../src/data/db.js";
import { isDateString } from "../../src/data/todos.js";
import { addCountdown, deleteCountdown, getCountdown, listCountdowns } from "../../src/data/countdowns.js";

migrate();
const server = new McpServer({ name: "xiaopai-countdown", version: "1.0.0" });

server.registerTool(
  "countdown_add",
  {
    title: "新增倒数日",
    description:
      "当用户说“距离考研还有多少天帮我记着”“12 月 20 号有个截止日”“记一下我们交往纪念日”时调用。",
    inputSchema: {
      title: z.string().min(1).max(60).describe("事件名，例如 考研初试、软工答辩"),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("目标日期 YYYY-MM-DD"),
      note: z.string().max(100).optional().describe("备注"),
    },
  },
  async ({ title, date, note }) => {
    if (!isDateString(date)) return fail("E_BAD_DATE", `日期格式不对：${date}`);
    try {
      const row = addCountdown({ title, targetDate: date, note });
      const when =
        row.daysLeft === 0 ? "就是今天" : row.daysLeft > 0 ? `还有 ${row.daysLeft} 天` : `已经过去 ${-row.daysLeft} 天`;
      return ok(`已记下：${row.title} · ${row.target_date}（${when}）`, row);
    } catch (e) {
      return failFrom(e);
    }
  },
);

server.registerTool(
  "countdown_list",
  {
    title: "查倒数日",
    description: "当用户问“还有多少天”“最近有什么节点”“我记了哪些日子”时调用。默认只返回未来（含今天）的。",
    inputSchema: {
      includePast: z.boolean().optional().describe("是否包含已过去的，默认 false"),
      limit: z.number().int().min(1).max(50).optional().describe("返回条数，默认 20"),
    },
  },
  async ({ includePast, limit }) => {
    try {
      const items = listCountdowns({ includePast, limit });
      if (!items.length) return ok("还没有记任何倒数日。", { count: 0, items: [] });
      const text = [
        `共 ${items.length} 个倒数日：`,
        ...items.map((it) => {
          const when = it.daysLeft === 0 ? "今天" : it.daysLeft > 0 ? `还有 ${it.daysLeft} 天` : `已过 ${-it.daysLeft} 天`;
          return `- #${it.id} ${it.title} · ${it.target_date}（${when}）${it.note ? `｜${it.note}` : ""}`;
        }),
      ].join("\n");
      return ok(text, { count: items.length, items });
    } catch (e) {
      return failFrom(e);
    }
  },
);

server.registerTool(
  "countdown_delete",
  {
    title: "删除倒数日",
    description: "当用户要删掉某个倒数日时调用。先 countdown_list 拿 id，带上 confirm=true 才真删。",
    inputSchema: {
      id: z.number().int().positive(),
      confirm: z.boolean().optional().describe("是否已确认，默认 false"),
    },
  },
  async ({ id, confirm }) => {
    try {
      const row = getCountdown(id);
      if (!row) return fail("E_NOT_FOUND", `没有 id=${id} 的倒数日。`);
      if (!confirm) return fail("E_NEED_CONFIRM", `确认删除《${row.title}》（${row.target_date}）吗？确认后带 confirm=true。`);
      deleteCountdown(id);
      return ok(`已删除 #${id}《${row.title}》`, { deleted: true, id });
    } catch (e) {
      return failFrom(e);
    }
  },
);

logStart("xiaopai-countdown");
await server.connect(new StdioServerTransport());
