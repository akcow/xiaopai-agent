/** 记账仓储层。金额一律按"元"存，展示时才做格式化。 */
import { openDb } from "./db.js";

export interface ExpenseRow {
  id: number;
  amount: number;
  category: string;
  note: string;
  spent_on: string;
  created_at: string;
}

export function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

export function addExpense(input: {
  amount: number;
  category?: string;
  note?: string;
  spentOn?: string;
}): ExpenseRow {
  const db = openDb();
  const res = db
    .prepare(`INSERT INTO expenses (amount, category, note, spent_on) VALUES (?, ?, ?, ?)`)
    .run(
      Math.round(input.amount * 100) / 100,
      input.category?.trim() || "其他",
      input.note?.trim() ?? "",
      input.spentOn ?? todayString(),
    );
  return db.prepare(`SELECT * FROM expenses WHERE id = ?`).get(res.lastInsertRowid) as unknown as ExpenseRow;
}

export function listExpenses(input: {
  from?: string;
  to?: string;
  category?: string;
  limit?: number;
}): ExpenseRow[] {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (input.from) {
    where.push("spent_on >= ?");
    params.push(input.from);
  }
  if (input.to) {
    where.push("spent_on <= ?");
    params.push(input.to);
  }
  if (input.category) {
    where.push("category = ?");
    params.push(input.category);
  }
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 100);
  const sql = `SELECT * FROM expenses ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY spent_on DESC, id DESC LIMIT ?`;
  return openDb().prepare(sql).all(...params, limit) as unknown as ExpenseRow[];
}

export interface ExpenseSummary {
  total: number;
  count: number;
  days: number;
  dailyAverage: number;
  byCategory: { category: string; total: number; count: number }[];
}

export function summarizeExpenses(input: { from?: string; to?: string }): ExpenseSummary {
  const db = openDb();
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (input.from) {
    where.push("spent_on >= ?");
    params.push(input.from);
  }
  if (input.to) {
    where.push("spent_on <= ?");
    params.push(input.to);
  }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const head = db
    .prepare(`SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count, COUNT(DISTINCT spent_on) AS days FROM expenses ${clause}`)
    .get(...params) as unknown as { total: number; count: number; days: number };

  const byCategory = db
    .prepare(`SELECT category, ROUND(SUM(amount), 2) AS total, COUNT(*) AS count FROM expenses ${clause} GROUP BY category ORDER BY total DESC`)
    .all(...params) as unknown as { category: string; total: number; count: number }[];

  return {
    total: Math.round(head.total * 100) / 100,
    count: head.count,
    days: head.days,
    dailyAverage: head.days ? Math.round((head.total / head.days) * 100) / 100 : 0,
    byCategory,
  };
}

export function deleteExpense(id: number): ExpenseRow | undefined {
  const db = openDb();
  const row = db.prepare(`SELECT * FROM expenses WHERE id = ?`).get(id) as unknown as ExpenseRow | undefined;
  if (!row) return undefined;
  db.prepare(`DELETE FROM expenses WHERE id = ?`).run(id);
  return row;
}

export function getExpense(id: number): ExpenseRow | undefined {
  return openDb().prepare(`SELECT * FROM expenses WHERE id = ?`).get(id) as unknown as ExpenseRow | undefined;
}
