/**
 * MCP 独立冒烟：直接用 MCP SDK 的 Client 连三个服务器，完全绕开 Pi。
 * 这是隔离问题的分水岭 —— 这里过了，说明协议和工具本身没问题，出问题就在 Pi 侧。
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { launchSpec, MCP_SERVERS } from "../src/agent/mcpServers.js";
import { migrate } from "../src/data/db.js";

interface Step {
  label: string;
  passed: boolean;
  detail: string;
  ms: number;
}

const steps: Step[] = [];

function textOf(result: unknown): string {
  const r = result as { content?: { type: string; text?: string }[] };
  const first = r.content?.find((c) => c.type === "text");
  return first?.text?.split("\n")[0] ?? "(无文本)";
}

async function connect(serverName: string): Promise<Client> {
  const def = MCP_SERVERS.find((s) => s.name === serverName);
  if (!def) throw new Error(`未定义的服务器 ${serverName}`);
  const spec = launchSpec(def);
  const transport = new StdioClientTransport({
    command: spec.command,
    args: spec.args,
    cwd: spec.cwd,
    env: spec.env,
    stderr: "inherit",
  });
  const client = new Client({ name: "xiaopai-smoke", version: "1.0.0" });
  await client.connect(transport);
  return client;
}

async function step(label: string, fn: () => Promise<string>): Promise<void> {
  const t0 = Date.now();
  try {
    const detail = await fn();
    steps.push({ label, passed: true, detail, ms: Date.now() - t0 });
    console.log(`  ✅ ${label} —— ${detail} (${Date.now() - t0}ms)`);
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    steps.push({ label, passed: false, detail, ms: Date.now() - t0 });
    console.log(`  ❌ ${label} —— ${detail}`);
  }
}

migrate();

console.log("== MCP 冒烟开始 ==\n");

// ---------- 天气 ----------
{
  const client = await connect("xiaopai-weather");
  console.log("[xiaopai-weather]");
  await step("listTools", async () => {
    const { tools } = await client.listTools();
    return `${tools.length} 个工具：${tools.map((t) => t.name).join(", ")}`;
  });
  await step("geocode_city(杭州)", async () =>
    textOf(await client.callTool({ name: "geocode_city", arguments: { city: "杭州", count: 3 } })),
  );
  await step("weather_current(杭州)", async () =>
    textOf(await client.callTool({ name: "weather_current", arguments: { city: "杭州" } })),
  );
  await step("weather_forecast(杭州,3)", async () =>
    textOf(await client.callTool({ name: "weather_forecast", arguments: { city: "杭州", days: 3 } })),
  );
  await step("travel_advice(上海,通勤)", async () =>
    textOf(await client.callTool({ name: "travel_advice", arguments: { city: "上海", activity: "通勤" } })),
  );
  await step("错误分支：不存在的城市", async () => {
    const r = (await client.callTool({ name: "weather_current", arguments: { city: "瞎编市" } })) as {
      isError?: boolean;
      content?: { text?: string }[];
    };
    if (!r.isError) throw new Error("应当返回 isError");
    return r.content?.[0]?.text?.slice(0, 40) ?? "";
  });
  await client.close();
}

// ---------- 待办 ----------
let createdTodoId = 0;
{
  const client = await connect("xiaopai-todo");
  console.log("\n[xiaopai-todo]");
  await step("listTools", async () => {
    const { tools } = await client.listTools();
    return `${tools.length} 个工具：${tools.map((t) => t.name).join(", ")}`;
  });
  await step("todo_add(冒烟测试)", async () => {
    const r = await client.callTool({
      name: "todo_add",
      arguments: { title: "冒烟测试：买伞", dueDate: "2026-10-25", priority: "high" },
    });
    const sc = (r as { structuredContent?: { id?: number } }).structuredContent;
    createdTodoId = sc?.id ?? 0;
    return textOf(r);
  });
  await step("todo_list(pending)", async () =>
    textOf(await client.callTool({ name: "todo_list", arguments: { status: "pending", limit: 5 } })),
  );
  await step("todo_update(标记完成)", async () =>
    textOf(await client.callTool({ name: "todo_update", arguments: { id: createdTodoId, status: "done" } })),
  );
  await step("todo_delete(未确认 → 要求二次确认)", async () => {
    const r = (await client.callTool({ name: "todo_delete", arguments: { id: createdTodoId } })) as {
      isError?: boolean;
      content?: { text?: string }[];
    };
    if (!r.isError) throw new Error("未确认时应当要求确认");
    return r.content?.[0]?.text?.slice(0, 50) ?? "";
  });
  await step("todo_delete(confirm=true)", async () =>
    textOf(await client.callTool({ name: "todo_delete", arguments: { id: createdTodoId, confirm: true } })),
  );
  await client.close();
}

// ---------- 记忆 ----------
let createdMemoryId = 0;
{
  const client = await connect("xiaopai-memory");
  console.log("\n[xiaopai-memory]");
  await step("listTools", async () => {
    const { tools } = await client.listTools();
    return `${tools.length} 个工具：${tools.map((t) => t.name).join(", ")}`;
  });
  await step("memory_remember(冒烟标记)", async () => {
    const r = await client.callTool({
      name: "memory_remember",
      arguments: { content: "冒烟测试：用户住在杭州", category: "profile", key: "smoke_city" },
    });
    const sc = (r as { structuredContent?: { id?: number; created?: boolean } }).structuredContent;
    createdMemoryId = sc?.id ?? 0;
    return `${textOf(r)}（created=${sc?.created}）`;
  });
  await step("memory_remember(重复写同 key 应更新不新增)", async () => {
    const r = await client.callTool({
      name: "memory_remember",
      arguments: { content: "冒烟测试：用户住在杭州西湖区", category: "profile", key: "smoke_city" },
    });
    const sc = (r as { structuredContent?: { created?: boolean } }).structuredContent;
    if (sc?.created !== false) throw new Error("同 key 应当更新而不是新增");
    return textOf(r);
  });
  await step("memory_recall(杭州)", async () =>
    textOf(await client.callTool({ name: "memory_recall", arguments: { query: "杭州" } })),
  );
  await step("memory_forget(清理冒烟数据)", async () =>
    textOf(await client.callTool({ name: "memory_forget", arguments: { id: createdMemoryId } })),
  );
  await client.close();
}

const failed = steps.filter((s) => !s.passed);
console.log(`\n== 结果：${steps.length - failed.length}/${steps.length} 通过 ==`);
if (failed.length) {
  console.log(`失败项：${failed.map((f) => f.label).join("、")}`);
  process.exitCode = 1;
}
