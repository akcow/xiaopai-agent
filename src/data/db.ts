/**
 * SQLite 数据层。用 Node 22 内置的 node:sqlite，避免 better-sqlite3 在 Windows 上的原生编译。
 * WAL + busy_timeout 是为了让 HTTP 主进程和三个 MCP 子进程能并发读写同一个库。
 */
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { DB_PATH, DB_SCHEMA_PATH, ensureRuntimeDirs } from "../config.js";

let db: DatabaseSync | undefined;

export function openDb(): DatabaseSync {
  if (db) return db;
  ensureRuntimeDirs();
  db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA busy_timeout = 5000");
  db.exec("PRAGMA foreign_keys = ON");
  return db;
}

/** 幂等迁移：每次启动都跑一遍，DDL 全是 IF NOT EXISTS */
export function migrate(): void {
  const ddl = readFileSync(DB_SCHEMA_PATH, "utf8");
  openDb().exec(ddl);
}

export function closeDb(): void {
  db?.close();
  db = undefined;
}
