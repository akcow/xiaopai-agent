/** 长期记忆仓储层。key 唯一，重复说同一件事只更新内容，不新增行。 */
import { openDb } from "./db.js";

export type MemoryCategory = "profile" | "preference" | "event";

export interface MemoryRow {
  id: number;
  key: string | null;
  content: string;
  category: MemoryCategory;
  created_at: string;
  updated_at: string;
}

export function listMemories(limit = 30): MemoryRow[] {
  return openDb()
    .prepare(`SELECT * FROM memories ORDER BY updated_at DESC, id DESC LIMIT ?`)
    .all(limit) as unknown as MemoryRow[];
}

export function recallMemories(query: string | undefined, limit = 10): MemoryRow[] {
  const db = openDb();
  if (!query || !query.trim()) return listMemories(limit);
  const like = `%${query.trim()}%`;
  return db
    .prepare(`SELECT * FROM memories WHERE content LIKE ? OR key LIKE ? ORDER BY updated_at DESC LIMIT ?`)
    .all(like, like, limit) as unknown as MemoryRow[];
}

export function rememberMemory(input: {
  content: string;
  category?: MemoryCategory;
  key?: string;
}): { row: MemoryRow; created: boolean } {
  const db = openDb();
  const key = input.key?.trim() ? input.key.trim() : null;
  const category = input.category ?? "preference";

  if (key) {
    const existing = db.prepare(`SELECT * FROM memories WHERE key = ?`).get(key) as unknown as MemoryRow | undefined;
    if (existing) {
      db.prepare(
        `UPDATE memories SET content = ?, category = ?, updated_at = datetime('now','localtime') WHERE key = ?`,
      ).run(input.content.trim(), category, key);
      const row = db.prepare(`SELECT * FROM memories WHERE key = ?`).get(key) as unknown as MemoryRow;
      return { row, created: false };
    }
  }

  const res = db
    .prepare(`INSERT INTO memories (key, content, category) VALUES (?, ?, ?)`)
    .run(key, input.content.trim(), category);
  const row = db.prepare(`SELECT * FROM memories WHERE id = ?`).get(res.lastInsertRowid) as unknown as MemoryRow;
  return { row, created: true };
}

export function forgetMemories(input: { id?: number; query?: string }): {
  deleted: number;
  rows: MemoryRow[];
  candidates?: MemoryRow[];
} {
  const db = openDb();

  if (input.id !== undefined) {
    const row = db.prepare(`SELECT * FROM memories WHERE id = ?`).get(input.id) as unknown as MemoryRow | undefined;
    if (!row) return { deleted: 0, rows: [] };
    db.prepare(`DELETE FROM memories WHERE id = ?`).run(input.id);
    return { deleted: 1, rows: [row] };
  }

  const query = input.query?.trim();
  if (!query) return { deleted: 0, rows: [] };

  const hits = recallMemories(query, 10);
  if (hits.length === 0) return { deleted: 0, rows: [] };
  if (hits.length > 1) return { deleted: 0, rows: [], candidates: hits };

  db.prepare(`DELETE FROM memories WHERE id = ?`).run(hits[0]!.id);
  return { deleted: 1, rows: hits };
}

/** 记忆版本号：用于判断"本轮对话之后记忆有没有变过"，变了就重建会话热注入 */
export function memoriesVersion(): string {
  const row = openDb()
    .prepare(`SELECT COUNT(*) AS n, COALESCE(MAX(updated_at), '') AS v FROM memories`)
    .get() as unknown as { n: number; v: string };
  return `${row.n}:${row.v}`;
}

export function memoriesForPrompt(limit = 20): MemoryRow[] {
  return listMemories(limit);
}
