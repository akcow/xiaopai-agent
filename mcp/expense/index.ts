/** xiaopai-expense：记账。金额落 SQLite，按月/按分类统计。 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { fail, failFrom, logStart, ok } from "../_shared/mcpKit.js";
import { migrate } from "../../src/data/db.js";
import { isDateString } from "../../src/data/todos.js";
import {
  addExpense,
  deleteExpense,
  getExpense,
  listExpenses,
  summarizeExpenses,
  todayString,
} from "../../src/data/expenses.js";

migrate();
const server = new McpServer({ name: "xiaopai-expense", version: "1.0.0" });

const CATEGORIES = ["餐饮", "交通", "购物", "学习", "娱乐", "住房", "医疗", "其他"] as const;

server.registerTool(
  "expense_add",
  {
    title: "记一笔开销",
    description:
      "当用户说“今天吃饭花了 35”“打车 20 块”“买了本书 89”时调用。金额单位是元，日期默认今天。",
    inputSchema: {
      amount: z.number().positive().describe("金额，单位元，最多两位小数"),
      category: z.enum(CATEGORIES).optional().describe("分类，默认“其他”"),
      note: z.string().max(100).optional().describe("备注，例如“和室友吃火锅”"),
      date: z.string().optional().describe("消费日期 YYYY-MM-DD，默认今天"),
    },
  },
  async ({ amount, category, note, date }) => {
    if (!(amount > 0)) return fail("E_VALIDATION", "金额必须大于 0。");
    if (date && !isDateString(date)) return fail("E_BAD_DATE", `日期格式不对：${date}，要 YYYY-MM-DD。`);
    if (date && date > todayString()) return fail("E_BAD_DATE", "记账日期不能是未来。");
    try {
      const row = addExpense({ amount, category, note, spentOn: date });
      return ok(`已记账：${row.category} ¥${row.amount.toFixed(2)}（${row.spent_on}）${row.note ? `｜${row.note}` : ""}`, row);
    } catch (e) {
      return failFrom(e);
    }
  },
);

server.registerTool(
  "expense_list",
  {
    title: "查开销明细",
    description: "当用户问“这个月都花哪了”“上周的账”“学习花了多少”时调用，返回逐笔明细。",
    inputSchema: {
      from: z.string().optional().describe("起始日期 YYYY-MM-DD（含）"),
      to: z.string().optional().describe("结束日期 YYYY-MM-DD（含）"),
      category: z.enum(CATEGORIES).optional(),
      limit: z.number().int().min(1).max(100).optional().describe("返回条数，默认 20"),
    },
  },
  async ({ from, to, category, limit }) => {
    if (from && !isDateString(from)) return fail("E_BAD_DATE", `起始日期不对：${from}`);
    if (to && !isDateString(to)) return fail("E_BAD_DATE", `结束日期不对：${to}`);
    try {
      const items = listExpenses({ from, to, category, limit });
      if (!items.length) return ok("这段时间没有记账记录。", { count: 0, items: [] });
      const sum = items.reduce((acc, it) => acc + it.amount, 0);
      const text = [
        `共 ${items.length} 笔，合计 ¥${sum.toFixed(2)}：`,
        ...items.map((it) => `- ${it.spent_on} ${it.category} ¥${it.amount.toFixed(2)}${it.note ? `｜${it.note}` : ""}`),
      ].join("\n");
      return ok(text, { count: items.length, total: Math.round(sum * 100) / 100, items });
    } catch (e) {
      return failFrom(e);
    }
  },
);

server.registerTool(
  "expense_summary",
  {
    title: "开销统计",
    description:
      "当用户问“这个月花了多少”“哪类花得最多”“日均多少”时调用。month 传 YYYY-MM，或用 from/to 指定区间。",
    inputSchema: {
      month: z.string().regex(/^\d{4}-\d{2}$/).optional().describe("月份 YYYY-MM，默认本月"),
      from: z.string().optional().describe("起始日期 YYYY-MM-DD，给了就忽略 month"),
      to: z.string().optional().describe("结束日期 YYYY-MM-DD"),
    },
  },
  async ({ month, from, to }) => {
    try {
      let start = from;
      let end = to;
      if (!start && !end) {
        const m = month ?? todayString().slice(0, 7);
        const [y, mo] = m.split("-").map(Number) as [number, number];
        start = `${m}-01`;
        end = new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10);
      }
      const s = summarizeExpenses({ from: start, to: end });
      if (s.count === 0) return ok(`${start} ~ ${end} 没有记账记录。`, s);
      const text = [
        `${start} ~ ${end}：合计 ¥${s.total.toFixed(2)}，共 ${s.count} 笔，${s.days} 天有消费，日均 ¥${s.dailyAverage.toFixed(2)}`,
        ...s.byCategory.map((c) => `- ${c.category} ¥${c.total.toFixed(2)}（${c.count} 笔）`),
      ].join("\n");
      return ok(text, { range: { from: start, to: end }, ...s });
    } catch (e) {
      return failFrom(e);
    }
  },
);

server.registerTool(
  "expense_delete",
  {
    title: "删除一笔记账",
    description: "当用户说“这笔记错了，删掉”时调用。必须先用 expense_list 拿到 id，再带 confirm=true 删。",
    inputSchema: {
      id: z.number().int().positive().describe("记录 id"),
      confirm: z.boolean().optional().describe("是否已确认，默认 false"),
    },
  },
  async ({ id, confirm }) => {
    try {
      const row = getExpense(id);
      if (!row) return fail("E_NOT_FOUND", `没有 id=${id} 的记账记录，先调 expense_list 确认。`);
      if (!confirm) {
        return fail("E_NEED_CONFIRM", `确认删除 ${row.spent_on} 的 ${row.category} ¥${row.amount.toFixed(2)} 吗？确认后带 confirm=true 再调一次。`);
      }
      deleteExpense(id);
      return ok(`已删除 #${id}：${row.category} ¥${row.amount.toFixed(2)}`, { deleted: true, id });
    } catch (e) {
      return failFrom(e);
    }
  },
);

logStart("xiaopai-expense");
await server.connect(new StdioServerTransport());
