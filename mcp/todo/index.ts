/** xiaopai-todo：待办的增删改查，数据落 SQLite。 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { fail, failFrom, logStart, ok } from "../_shared/mcpKit.js";
import { migrate } from "../../src/data/db.js";
import {
  addTodo,
  deleteTodo,
  isDateString,
  listTodos,
  todoStats,
  updateTodo,
} from "../../src/data/todos.js";

migrate();
const server = new McpServer({ name: "xiaopai-todo", version: "1.0.0" });

server.registerTool(
  "todo_add",
  {
    title: "新增待办",
    description:
      "当用户说“提醒我…”“帮我记一下要做…”“别忘了…”时调用，把一件事记进待办列表。返回新待办的 id，后面改状态要用。",
    inputSchema: {
      title: z.string().min(1).max(120).describe("待办内容，保留用户原话的关键信息"),
      dueDate: z.string().optional().describe("截止日期 YYYY-MM-DD，用户没说就别传"),
      priority: z.enum(["low", "normal", "high"]).optional().describe("优先级，默认 normal"),
      note: z.string().max(500).optional().describe("补充说明"),
    },
  },
  async ({ title, dueDate, priority, note }) => {
    if (!title.trim()) return fail("E_VALIDATION", "待办内容不能为空。");
    if (dueDate && !isDateString(dueDate)) return fail("E_BAD_DATE", `日期格式不对：${dueDate}，要 YYYY-MM-DD。`);
    try {
      const row = addTodo({ title, dueDate, priority, note });
      return ok(`已添加待办 #${row.id}：${row.title}${row.dueDate ? `（截止 ${row.dueDate}）` : ""}`, row);
    } catch (e) {
      return failFrom(e);
    }
  },
);

server.registerTool(
  "todo_list",
  {
    title: "查询待办",
    description:
      "当用户问“我还有什么要做”“列出今天的待办”“哪些过期了”时调用。默认只返回未完成的待办。",
    inputSchema: {
      status: z.enum(["all", "pending", "done", "cancelled"]).optional().describe("状态筛选，默认 pending"),
      dueBefore: z.string().optional().describe("只看这个日期之前到期的，YYYY-MM-DD"),
      limit: z.number().int().min(1).max(50).optional().describe("返回条数上限，默认 20"),
    },
  },
  async ({ status, dueBefore, limit }) => {
    if (dueBefore && !isDateString(dueBefore)) return fail("E_BAD_DATE", `日期格式不对：${dueBefore}。`);
    try {
      const items = listTodos({ status, dueBefore, limit });
      const stats = todoStats();
      const head =
        items.length === 0
          ? "目前没有符合条件的待办。"
          : `共 ${items.length} 条待办（未完成 ${stats.pending} 条，已过期 ${stats.overdue} 条）：`;
      const text =
        items.length === 0
          ? head
          : [
              head,
              ...items.map(
                (t) =>
                  `- #${t.id} ${t.title}${t.dueDate ? `｜截止 ${t.dueDate}` : ""}${t.overdue ? "｜已过期" : ""}${t.status !== "pending" ? `｜${t.status}` : ""}`,
              ),
            ].join("\n");
      return ok(text, { count: items.length, items, stats });
    } catch (e) {
      return failFrom(e);
    }
  },
);

server.registerTool(
  "todo_update",
  {
    title: "修改待办",
    description:
      "当用户说“这件事做完了”“把那条改到明天”“设成高优先级”时调用。改状态时 status 传 done，取消传 cancelled。",
    inputSchema: {
      id: z.number().int().positive().describe("待办 id，从 todo_list 或 todo_add 的返回里取"),
      title: z.string().min(1).max(120).optional(),
      dueDate: z.string().optional().describe("新截止日期 YYYY-MM-DD"),
      priority: z.enum(["low", "normal", "high"]).optional(),
      status: z.enum(["pending", "done", "cancelled"]).optional(),
      note: z.string().max(500).optional(),
    },
  },
  async (input) => {
    if (input.dueDate !== undefined && input.dueDate !== "" && !isDateString(input.dueDate)) {
      return fail("E_BAD_DATE", `日期格式不对：${input.dueDate}。`);
    }
    const hasField = ["title", "dueDate", "priority", "status", "note"].some(
      (k) => (input as Record<string, unknown>)[k] !== undefined,
    );
    if (!hasField) return fail("E_NO_FIELDS", "没有要改的字段，请说明改成什么。");

    try {
      const result = updateTodo({
        id: input.id,
        title: input.title,
        note: input.note,
        dueDate: input.dueDate === "" ? null : input.dueDate,
        priority: input.priority,
        status: input.status,
      });
      if (!result) return fail("E_NOT_FOUND", `没有 id=${input.id} 的待办。先调 todo_list 确认 id。`);
      if (result.changed.length === 0) {
        return ok(`#${input.id} 没有变化。`, result.after);
      }
      return ok(`已更新 #${input.id}《${result.after.title}》：${result.changed.join("、")}`, result.after);
    } catch (e) {
      return failFrom(e);
    }
  },
);

server.registerTool(
  "todo_delete",
  {
    title: "删除待办",
    description:
      "当用户明确要删掉某条待办时调用。必须先调 todo_list 拿到 id；第一次调用 confirm 传 false 与用户确认，用户同意后再传 true 真正删除。",
    inputSchema: {
      id: z.number().int().positive().describe("待办 id"),
      confirm: z.boolean().optional().describe("是否已确认删除，默认 false"),
    },
  },
  async ({ id, confirm }) => {
    try {
      if (!confirm) {
        const target = listTodos({ status: "all", limit: 50 }).find((t) => t.id === id);
        return fail(
          "E_NEED_CONFIRM",
          target
            ? `确认要删除 #${id}《${target.title}》吗？确认后请带 confirm=true 再调一次。`
            : `没找到 id=${id} 的待办，先调 todo_list 确认。`,
        );
      }
      const row = deleteTodo(id);
      if (!row) return fail("E_NOT_FOUND", `没有 id=${id} 的待办。`);
      return ok(`已删除 #${id}《${row.title}》`, { deleted: true, id, title: row.title });
    } catch (e) {
      return failFrom(e);
    }
  },
);

logStart("xiaopai-todo");
await server.connect(new StdioServerTransport());
