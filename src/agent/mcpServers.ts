/**
 * 三个 MCP 服务器的启动描述。冒烟脚本和 Pi 的 mcpBridge 共用这一份，
 * 避免"测试通过但线上起不来"的偏差。
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { MCP_DIR, ROOT } from "../config.js";

export type Exposure = "direct" | "deferred" | "codemode" | "hidden";

export interface McpServerDef {
  name: string;
  /** 源码入口，开发期用 */
  source: string;
  /** 编译产物，构建后用 */
  dist: string;
  description: string;
  exposure: Exposure;
  /** 精简模式下隐藏的工具 */
  hiddenWhenMinimal?: string[];
  /** 该服务器提供的工具数量（用于判断是否全部连上） */
  toolCount: number;
}

/** 紧急开关：XIAOPAI_DISABLE_SERVERS=expense,web 可临时摘掉某些服务器（工具太多时救火用） */
function filterDisabled(list: McpServerDef[]): McpServerDef[] {
  const disabled = (process.env.XIAOPAI_DISABLE_SERVERS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!disabled.length) return list;
  return list.filter((def) => !disabled.some((d) => def.name.includes(d)));
}

const ALL_SERVERS: McpServerDef[] = [
  {
    name: "xiaopai-weather",
    source: join(MCP_DIR, "weather", "index.ts"),
    dist: join(ROOT, "dist", "mcp", "weather", "index.js"),
    description: "天气与出行建议：实况、多日预报、带伞穿衣建议",
    exposure: "direct",
    toolCount: 4,
    hiddenWhenMinimal: ["geocode_city"],
  },
  {
    name: "xiaopai-todo",
    source: join(MCP_DIR, "todo", "index.ts"),
    dist: join(ROOT, "dist", "mcp", "todo", "index.js"),
    description: "待办清单：新增、查询、改状态、删除（SQLite 持久化）",
    exposure: "direct",
    toolCount: 4,
  },
  {
    name: "xiaopai-memory",
    source: join(MCP_DIR, "memory", "index.ts"),
    dist: join(ROOT, "dist", "mcp", "memory", "index.js"),
    description: "长期记忆：记住/召回/忘记用户的稳定事实与偏好",
    exposure: "direct",
    toolCount: 3,
    hiddenWhenMinimal: ["memory_forget"],
  },
  {
    name: "xiaopai-expense",
    source: join(MCP_DIR, "expense", "index.ts"),
    dist: join(ROOT, "dist", "mcp", "expense", "index.js"),
    description: "记账：记一笔、查明细、按月统计、删除",
    exposure: "direct",
    toolCount: 4,
  },
  {
    name: "xiaopai-countdown",
    source: join(MCP_DIR, "countdown", "index.ts"),
    dist: join(ROOT, "dist", "mcp", "countdown", "index.js"),
    description: "倒数日：考试/截止日/纪念日还有多少天",
    exposure: "direct",
    toolCount: 3,
  },
  {
    name: "xiaopai-convert",
    source: join(MCP_DIR, "convert", "index.ts"),
    dist: join(ROOT, "dist", "mcp", "convert", "index.js"),
    description: "换算：单位换算（长度/质量/体积/面积/温度/数据量）与汇率换算",
    exposure: "direct",
    toolCount: 2,
    hiddenWhenMinimal: ["convert_unit"],
  },
  {
    name: "xiaopai-web",
    source: join(MCP_DIR, "web", "index.ts"),
    dist: join(ROOT, "dist", "mcp", "web", "index.js"),
    description: "网页速读：抓取公开网页标题与正文，供总结",
    exposure: "direct",
    toolCount: 1,
  },
];

export const MCP_SERVERS: McpServerDef[] = filterDisabled(ALL_SERVERS);

export interface LaunchSpec {
  command: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
}

/**
 * 用当前 node 的绝对路径 + 绝对脚本路径启动子进程。
 * 不用 npx、不经过 shell —— Windows 上这两点是 MCP stdio 起不来的主要原因。
 */
export function launchSpec(server: McpServerDef, extraEnv: Record<string, string> = {}): LaunchSpec {
  const useDist = existsSync(server.dist);
  const env: Record<string, string> = { ...extraEnv };
  if (process.env.XIAOPAI_DB) env.XIAOPAI_DB = process.env.XIAOPAI_DB;

  return {
    command: process.execPath,
    args: useDist ? [server.dist] : ["--import", "tsx", server.source],
    cwd: ROOT,
    env,
  };
}
