/** 待办仓储层：MCP 子进程和 HTTP 路由都走这里，保证只有一套 SQL。 */
import { openDb } from "./db.js";

export type TodoStatus = "pending" | "done" | "cancelled";
export type TodoPriority = "low" | "normal" | "high";

export interface TodoRow {
  id: number;
  title: string;
  note: string;
  status: TodoStatus;
  priority: TodoPriority;
  due_date: string | null;
  created_at: string;
  updated_at: string;
  done_at: string | null;
}

export interface TodoView extends Omit<TodoRow, "due_date"> {
  dueDate: string | null;
  overdue: boolean;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDateString(value: string): boolean {
  return DATE_RE.test(value) && !Number.isNaN(Date.parse(value));
}

function toView(row: TodoRow): TodoView {
  const today = new Date().toISOString().slice(0, 10);
  const { due_date, ...rest } = row;
  return {
    ...rest,
    dueDate: due_date,
    overdue: row.status === "pending" && !!due_date && due_date < today,
  };
}

export function addTodo(input: {
  title: string;
  note?: string;
  dueDate?: string;
  priority?: TodoPriority;
}): TodoView {
  const db = openDb();
  const stmt = db.prepare(
    `INSERT INTO todos (title, note, due_date, priority) VALUES (?, ?, ?, ?)`,
  );
  const res = stmt.run(
    input.title.trim(),
    input.note?.trim() ?? "",
    input.dueDate ?? null,
    input.priority ?? "normal",
  );
  const row = db.prepare(`SELECT * FROM todos WHERE id = ?`).get(res.lastInsertRowid) as unknown as TodoRow;
  return toView(row);
}

export function listTodos(input: {
  status?: TodoStatus | "all";
  dueBefore?: string;
  limit?: number;
}): TodoView[] {
  const db = openDb();
  const where: string[] = [];
  const params: (string | number)[] = [];

  const status = input.status ?? "pending";
  if (status !== "all") {
    where.push("status = ?");
    params.push(status);
  }
  if (input.dueBefore) {
    where.push("due_date IS NOT NULL AND due_date <= ?");
    params.push(input.dueBefore);
  }

  const limit = Math.min(Math.max(input.limit ?? 20, 1), 50);
  const sql = `SELECT * FROM todos ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'done' THEN 1 ELSE 2 END,
             COALESCE(due_date, '9999-12-31'), id DESC
    LIMIT ?`;
  const rows = db.prepare(sql).all(...params, limit) as unknown as TodoRow[];
  return rows.map(toView);
}

export function getTodo(id: number): TodoRow | undefined {
  return openDb().prepare(`SELECT * FROM todos WHERE id = ?`).get(id) as unknown as TodoRow | undefined;
}

export function updateTodo(input: {
  id: number;
  title?: string;
  note?: string;
  dueDate?: string | null;
  priority?: TodoPriority;
  status?: TodoStatus;
}): { before: TodoRow; after: TodoView; changed: string[] } | undefined {
  const before = getTodo(input.id);
  if (!before) return undefined;

  const sets: string[] = [];
  const params: (string | number | null)[] = [];
  const changed: string[] = [];

  const push = (column: string, value: string | null) => {
    sets.push(`${column} = ?`);
    params.push(value);
    changed.push(column);
  };

  if (input.title !== undefined) push("title", input.title.trim());
  if (input.note !== undefined) push("note", input.note);
  if (input.dueDate !== undefined) push("due_date", input.dueDate);
  if (input.priority !== undefined) push("priority", input.priority);
  if (input.status !== undefined) {
    push("status", input.status);
    push("done_at", input.status === "done" ? new Date().toISOString() : null);
  }

  if (!sets.length) return { before, after: toView(before), changed: [] };

  sets.push(`updated_at = datetime('now', 'localtime')`);
  openDb()
    .prepare(`UPDATE todos SET ${sets.join(", ")} WHERE id = ?`)
    .run(...params, input.id);

  const after = getTodo(input.id)!;
  return { before, after: toView(after), changed };
}

export function deleteTodo(id: number): TodoRow | undefined {
  const row = getTodo(id);
  if (!row) return undefined;
  openDb().prepare(`DELETE FROM todos WHERE id = ?`).run(id);
  return row;
}

export function todoStats(): { pending: number; done: number; overdue: number } {
  const db = openDb();
  const pending = db.prepare(`SELECT COUNT(*) AS n FROM todos WHERE status = 'pending'`).get() as unknown as { n: number };
  const done = db.prepare(`SELECT COUNT(*) AS n FROM todos WHERE status = 'done'`).get() as unknown as { n: number };
  const overdue = db
    .prepare(`SELECT COUNT(*) AS n FROM todos WHERE status = 'pending' AND due_date IS NOT NULL AND due_date < date('now','localtime')`)
    .get() as unknown as { n: number };
  return { pending: pending.n, done: done.n, overdue: overdue.n };
}
