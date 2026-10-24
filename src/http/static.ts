/** 静态文件托管。前端是零构建的，这里只要托住 public/ 三个文件。 */
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve, sep } from "node:path";
import type { ServerResponse } from "node:http";
import { PUBLIC_DIR } from "../config.js";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8",
};

export function serveStatic(pathname: string, res: ServerResponse): boolean {
  const rel = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const normalized = normalize(rel);
  if (normalized.startsWith("..") || normalized.includes(`..${sep}`)) return false;

  const abs = resolve(join(PUBLIC_DIR, normalized));
  if (!abs.startsWith(PUBLIC_DIR) || !existsSync(abs) || !statSync(abs).isFile()) return false;

  res.writeHead(200, {
    "Content-Type": MIME[extname(abs).toLowerCase()] ?? "application/octet-stream",
    "Cache-Control": "no-cache",
  });
  createReadStream(abs).pipe(res);
  return true;
}
