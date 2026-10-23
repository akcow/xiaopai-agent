/**
 * 自研文件工具，锁死在 workspace/ 目录内。
 * 关掉 Pi 内置的 bash/read/write/edit，就是为了不让模型有机会碰到 workspace 以外的文件。
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import type { ExtensionFactory } from "@earendil-works/pi-coding-agent";
import { Type } from "@earendil-works/pi-ai";
import { WORKSPACE_DIR } from "../config.js";

function insideWorkspace(input: string): { abs: string } | { error: string } {
  const abs = resolve(WORKSPACE_DIR, input || ".");
  const root = WORKSPACE_DIR.endsWith(sep) ? WORKSPACE_DIR : WORKSPACE_DIR + sep;
  if (abs !== WORKSPACE_DIR && !abs.startsWith(root)) {
    return { error: `错误[E_OUT_OF_SCOPE] 只允许操作 workspace/ 里的文件，收到：${input}` };
  }
  return { abs };
}

function ok(text: string, details: Record<string, unknown> = {}) {
  return { content: [{ type: "text" as const, text }], details };
}

export function createFileToolsExtension(): ExtensionFactory {
  return (pi) => {
    pi.registerTool({
      name: "file_list",
      label: "列出工作区文件",
      description: "当用户想看 workspace 里有什么文件、或者不确定文件名时调用。返回目录下的文件名与大小。",
      parameters: Type.Object({
        dir: Type.Optional(Type.String({ description: "相对 workspace 的子目录，默认根目录" })),
      }),
      execute: async (_id, params) => {
        const target = insideWorkspace(params.dir ?? ".");
        if ("error" in target) return ok(target.error, { error: true });
        if (!existsSync(target.abs)) return ok(`目录不存在：${params.dir ?? "."}`, { error: true });
        const entries = readdirSync(target.abs).map((name) => {
          const st = statSync(join(target.abs, name));
          return { name, isDir: st.isDirectory(), size: st.size };
        });
        const text = entries.length
          ? entries.map((e) => `${e.isDir ? "📁" : "📄"} ${e.name}${e.isDir ? "/" : ` (${e.size}B)`}`).join("\n")
          : "（空目录）";
        return ok(text, { dir: relative(WORKSPACE_DIR, target.abs) || ".", count: entries.length });
      },
    });

    pi.registerTool({
      name: "file_read",
      label: "读取工作区文件",
      description: "当用户要你看 workspace 里某个文件的内容、或者要总结/翻译文件时调用。",
      parameters: Type.Object({
        path: Type.String({ description: "相对 workspace 的文件路径，例如 notes/today.md" }),
        maxLines: Type.Optional(Type.Number({ description: "最多读多少行，默认 200" })),
      }),
      execute: async (_id, params) => {
        const target = insideWorkspace(params.path);
        if ("error" in target) return ok(target.error, { error: true });
        if (!existsSync(target.abs)) return ok(`文件不存在：${params.path}`, { error: true });
        const max = Math.min(Math.max(params.maxLines ?? 200, 1), 2000);
        const lines = readFileSync(target.abs, "utf8").split(/\r?\n/);
        const shown = lines.slice(0, max);
        return ok(shown.join("\n"), {
          path: params.path,
          totalLines: lines.length,
          truncated: lines.length > max,
        });
      },
    });

    pi.registerTool({
      name: "file_write",
      label: "写入工作区文件",
      description:
        "当用户让你把内容保存成文件、追加笔记到文件时调用。mode 默认 overwrite，追加用 append。只能在 workspace 内写。",
      parameters: Type.Object({
        path: Type.String({ description: "相对 workspace 的文件路径" }),
        content: Type.String({ description: "要写入的完整内容" }),
        mode: Type.Optional(Type.Union([Type.Literal("overwrite"), Type.Literal("append")])),
      }),
      execute: async (_id, params) => {
        const target = insideWorkspace(params.path);
        if ("error" in target) return ok(target.error, { error: true });
        mkdirSync(dirname(target.abs), { recursive: true });
        const mode = params.mode ?? "overwrite";
        if (mode === "append" && existsSync(target.abs)) {
          writeFileSync(target.abs, `${readFileSync(target.abs, "utf8")}\n${params.content}`, "utf8");
        } else {
          writeFileSync(target.abs, params.content, "utf8");
        }
        const bytes = Buffer.byteLength(params.content, "utf8");
        return ok(`已${mode === "append" ? "追加" : "写入"} ${params.path}（${bytes} 字节）`, {
          path: params.path,
          bytes,
          mode,
        });
      },
    });
  };
}
