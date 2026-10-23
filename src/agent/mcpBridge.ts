/**
 * 把三个 MCP 服务器注册进 Pi。
 * 用 registerMcpServer 而不是 mcp.json 文件：路径在 TS 里算，绝对可靠，也不依赖 project trust。
 */
import type { ExtensionFactory } from "@earendil-works/pi-coding-agent";
import { MINIMAL_TOOLS } from "../config.js";
import { launchSpec, MCP_SERVERS } from "./mcpServers.js";

export function createMcpBridgeExtension(): ExtensionFactory {
  return (pi) => {
    for (const def of MCP_SERVERS) {
      const spec = launchSpec(def);
      pi.registerMcpServer(def.name, {
        type: "stdio",
        command: spec.command,
        args: spec.args,
        cwd: spec.cwd,
        env: spec.env,
        exposure: def.exposure,
        description: def.description,
        timeout: 30,
        toolExposure: MINIMAL_TOOLS
          ? Object.fromEntries((def.hiddenWhenMinimal ?? []).map((tool) => [tool, "hidden" as const]))
          : undefined,
      });
    }
  };
}
