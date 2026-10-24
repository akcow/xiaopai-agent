/**
 * 会话仓库：一份 sessionId 对应一个 SessionManager + AgentSession。
 * 记忆变了就用同一个 SessionManager 重建 session —— 历史不丢，systemPrompt 里的记忆块也更新了。
 */
import { SessionManager, type AgentSession } from "@earendil-works/pi-coding-agent";
import { ROOT, SESSION_DIR } from "../config.js";
import { memoriesVersion } from "../data/memories.js";
import { createXiaopaiSession } from "./createSession.js";

export interface SessionRecord {
  id: string;
  manager: SessionManager;
  session: AgentSession;
  factsVersion: string;
  busy: boolean;
  createdAt: number;
  lastUsed: number;
}

const records = new Map<string, SessionRecord>();
/** 同一个 sessionId 的并发请求串行化，避免两个 prompt 同时跑 */
const locks = new Map<string, Promise<unknown>>();

async function withLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(id) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  locks.set(
    id,
    next.catch(() => undefined),
  );
  return next;
}

function openManager(sessionId: string | undefined): SessionManager {
  if (sessionId) {
    const file = SessionManager.findById(ROOT, sessionId, SESSION_DIR);
    if (file) return SessionManager.open(file, SESSION_DIR, ROOT);
  }
  return SessionManager.create(ROOT, SESSION_DIR);
}

/** 新建或恢复会话；sessionId 传 null 表示开新会话 */
export async function acquireSession(sessionId?: string | null): Promise<SessionRecord> {
  const key = sessionId ?? `new:${Date.now()}`;
  return withLock(key, async () => {
    if (sessionId) {
      const existing = records.get(sessionId);
      if (existing) {
        existing.lastUsed = Date.now();
        return existing;
      }
    }
    const manager = openManager(sessionId ?? undefined);
    const session = await createXiaopaiSession({ sessionManager: manager });
    const record: SessionRecord = {
      id: session.sessionId,
      manager,
      session,
      factsVersion: memoriesVersion(),
      busy: false,
      createdAt: Date.now(),
      lastUsed: Date.now(),
    };
    records.set(record.id, record);
    return record;
  });
}

/**
 * 本轮结束后调用：如果记忆表变过，重建会话让新记忆进 systemPrompt。
 * 复用同一个 SessionManager，所以对话历史原样保留。
 */
export async function refreshIfFactsChanged(record: SessionRecord): Promise<boolean> {
  const current = memoriesVersion();
  if (current === record.factsVersion) return false;

  const old = record.session;
  const rebuilt = await createXiaopaiSession({ sessionManager: record.manager });
  record.session = rebuilt;
  record.factsVersion = current;
  record.lastUsed = Date.now();
  old.dispose();
  return true;
}

export function getRecord(sessionId: string): SessionRecord | undefined {
  return records.get(sessionId);
}

export async function disposeAll(): Promise<void> {
  for (const record of records.values()) {
    try {
      record.session.dispose();
    } catch {
      // 退出路径上不抛错，避免遮住真正的关闭原因
    }
  }
  records.clear();
}

export function totalToolCount(record: SessionRecord): number {
  return record.session.getActiveToolNames().length;
}
