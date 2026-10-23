/**
 * 全局路径与运行参数。所有路径基于仓库根目录（= 启动进程的 cwd），
 * 这样 tsx 直跑源码和 node 跑 dist 都能定位到同一批文件。
 */
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

function loadDotEnv(): void {
  const file = resolve(process.cwd(), ".env");
  if (!existsSync(file)) return;
  for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadDotEnv();

export const ROOT = resolve(process.cwd());
export const WORKSPACE_DIR = join(ROOT, "workspace");
export const AGENT_DIR = join(ROOT, ".pi-agent");
export const DATA_DIR = join(ROOT, "data");
export const SESSION_DIR = join(DATA_DIR, "sessions");
// MCP 子进程的 cwd 可能不同，库路径统一由父进程用环境变量透传
export const DB_PATH = process.env.XIAOPAI_DB ? resolve(process.env.XIAOPAI_DB) : join(DATA_DIR, "xiaopai.db");
export const DB_SCHEMA_PATH = join(ROOT, "src", "data", "schema.sql");
export const PUBLIC_DIR = join(ROOT, "public");
export const CONFIG_DIR = join(ROOT, "config");
export const MODELS_SRC = join(CONFIG_DIR, "models.json");
export const PERSONA_PATH = join(CONFIG_DIR, "persona.md");
export const MCP_DIR = join(ROOT, "mcp");

export const PORT = Number(process.env.XIAOPAI_PORT ?? 8787);
export const HOST = process.env.XIAOPAI_HOST ?? "127.0.0.1";
export const MODEL_PROVIDER = process.env.XIAOPAI_MODEL_PROVIDER ?? "dashscope";
export const MODEL_ID = process.env.XIAOPAI_MODEL_ID ?? "qwen-flash";
export const MINIMAL_TOOLS = process.env.XIAOPAI_MINIMAL_TOOLS === "1";

export function ensureRuntimeDirs(): void {
  for (const dir of [WORKSPACE_DIR, AGENT_DIR, DATA_DIR, SESSION_DIR]) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }
}

/** 启动时打一行打码后的 key，方便确认"到底读到了没有"又不泄漏 */
export function maskedKey(name: string): string {
  const v = process.env[name];
  if (!v) return "(未配置)";
  return v.length <= 8 ? "****" : `${v.slice(0, 4)}****${v.slice(-4)}`;
}
