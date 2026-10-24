/** SSE 写入器。用原生 res.write，避免框架的响应缓冲把流"卡"成一次性输出。 */
import type { ServerResponse } from "node:http";
import type { FrontendEvent } from "../agent/events.js";

export class SSEWriter {
  private closed = false;
  private heartbeat: NodeJS.Timeout;

  constructor(private readonly res: ServerResponse) {
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.write(": connected\n\n");
    // 心跳：防止反向代理/浏览器把空闲连接判死
    this.heartbeat = setInterval(() => {
      if (!this.closed) this.res.write(": ping\n\n");
    }, 15000);
  }

  send(event: FrontendEvent): void {
    if (this.closed) return;
    this.res.write(`data: ${JSON.stringify(event)}\n\n`);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.heartbeat);
    this.res.end();
  }
}
