/** 倒数日仓储层。daysLeft 用本地日期算整天差，避免时区把结果差一天。 */
import { openDb } from "./db.js";
import { todayString } from "./expenses.js";

export interface CountdownRow {
  id: number;
  title: string;
  target_date: string;
  note: string;
  created_at: string;
}

export interface CountdownView extends CountdownRow {
  daysLeft: number;
  passed: boolean;
}

/** 两个 YYYY-MM-DD 之间相差的整天数（b - a） */
export function daysBetween(a: string, b: string): number {
  const start = Date.parse(`${a}T00:00:00Z`);
  const end = Date.parse(`${b}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) return Number.NaN;
  return Math.round((end - start) / 86400000);
}

function toView(row: CountdownRow, today = todayString()): CountdownView {
  const daysLeft = daysBetween(today, row.target_date);
  return { ...row, daysLeft, passed: daysLeft < 0 };
}

export function addCountdown(input: { title: string; targetDate: string; note?: string }): CountdownView {
  const db = openDb();
  const res = db
    .prepare(`INSERT INTO countdowns (title, target_date, note) VALUES (?, ?, ?)`)
    .run(input.title.trim(), input.targetDate, input.note?.trim() ?? "");
  const row = db.prepare(`SELECT * FROM countdowns WHERE id = ?`).get(res.lastInsertRowid) as unknown as CountdownRow;
  return toView(row);
}

export function listCountdowns(input: { includePast?: boolean; limit?: number } = {}): CountdownView[] {
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 50);
  const rows = openDb()
    .prepare(`SELECT * FROM countdowns ORDER BY target_date ASC LIMIT ?`)
    .all(limit) as unknown as CountdownRow[];
  const today = todayString();
  const views = rows.map((r) => toView(r, today));
  return input.includePast ? views : views.filter((v) => !v.passed);
}

export function deleteCountdown(id: number): CountdownRow | undefined {
  const db = openDb();
  const row = db.prepare(`SELECT * FROM countdowns WHERE id = ?`).get(id) as unknown as CountdownRow | undefined;
  if (!row) return undefined;
  db.prepare(`DELETE FROM countdowns WHERE id = ?`).run(id);
  return row;
}

export function getCountdown(id: number): CountdownRow | undefined {
  return openDb().prepare(`SELECT * FROM countdowns WHERE id = ?`).get(id) as unknown as CountdownRow | undefined;
}
