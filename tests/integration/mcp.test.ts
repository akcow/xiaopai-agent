/**
 * MCP 协议级集成测试：真的把每个服务器作为子进程启动，走 stdio 协议调工具。
 * 工具数量断言直接从 src/agent/mcpServers.ts 的注册表读，避免"代码加了工具、文档没更新"。
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "xiaopai-mcp-"));
process.env.XIAOPAI_DB = join(dir, "test.db");

const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = await import("@modelcontextprotocol/sdk/client/stdio.js");
const { launchSpec, MCP_SERVERS } = await import("../../src/agent/mcpServers.js");
const { migrate, closeDb } = await import("../../src/data/db.js");

migrate();
test.after(() => closeDb());

type AnyResult = { isError?: boolean; content?: { text?: string }[]; structuredContent?: Record<string, unknown> };

async function withClient<T>(serverName: string, fn: (client: unknown) => Promise<T>): Promise<T> {
  const def = MCP_SERVERS.find((s) => s.name === serverName);
  assert.ok(def, `未注册的服务器 ${serverName}`);
  const spec = launchSpec(def);
  const transport = new StdioClientTransport({
    command: spec.command,
    args: spec.args,
    cwd: spec.cwd,
    env: spec.env,
    stderr: "ignore",
  });
  const client = new Client({ name: "xiaopai-test", version: "1.0.0" });
  await client.connect(transport);
  try {
    return await fn(client);
  } finally {
    await client.close();
  }
}

function text(result: AnyResult): string {
  return result.content?.find((c) => c.text)?.text ?? "";
}

test("注册表里有 7 个 MCP 服务器，工具总数 21", () => {
  assert.equal(MCP_SERVERS.length, 7);
  const total = MCP_SERVERS.reduce((sum, s) => sum + s.toolCount, 0);
  assert.equal(total, 21);
});

for (const def of MCP_SERVERS) {
  test(`${def.name}：listTools 数量和注册表一致`, async () => {
    await withClient(def.name, async (client) => {
      const { tools } = await (client as Client).listTools();
      assert.equal(tools.length, def.toolCount, `实际返回 ${tools.map((t) => t.name).join(",")}`);
    });
  });
}

test("weather：查不到的城市返回 E_CITY_NOT_FOUND 而不是抛异常", { timeout: 30000 }, async () => {
  await withClient("xiaopai-weather", async (client) => {
    const r = (await (client as Client).callTool({
      name: "weather_current",
      arguments: { city: "瞎编市" },
    })) as AnyResult;
    assert.equal(r.isError, true);
    assert.match(text(r), /E_CITY_NOT_FOUND/);
  });
});

test("todo：未确认删除会被拦下，确认后才真删", { timeout: 30000 }, async () => {
  await withClient("xiaopai-todo", async (client) => {
    const added = (await (client as Client).callTool({
      name: "todo_add",
      arguments: { title: "集成测试待办" },
    })) as AnyResult;
    const id = (added.structuredContent as { id?: number } | undefined)?.id;
    assert.ok(id, "新增应返回 id");

    const blocked = (await (client as Client).callTool({
      name: "todo_delete",
      arguments: { id },
    })) as AnyResult;
    assert.equal(blocked.isError, true);
    assert.match(text(blocked), /E_NEED_CONFIRM/);

    const done = (await (client as Client).callTool({
      name: "todo_delete",
      arguments: { id, confirm: true },
    })) as AnyResult;
    assert.equal(done.isError ?? false, false);
  });
});

test("memory：同一 key 重复写只更新不新增", { timeout: 30000 }, async () => {
  await withClient("xiaopai-memory", async (client) => {
    const first = (await (client as Client).callTool({
      name: "memory_remember",
      arguments: { content: "用户住在广州", key: "it_city", category: "profile" },
    })) as AnyResult;
    assert.equal((first.structuredContent as { created?: boolean }).created, true);

    const second = (await (client as Client).callTool({
      name: "memory_remember",
      arguments: { content: "用户住在广州天河区", key: "it_city", category: "profile" },
    })) as AnyResult;
    assert.equal((second.structuredContent as { created?: boolean }).created, false, "同 key 应该更新");

    const recalled = (await (client as Client).callTool({
      name: "memory_recall",
      arguments: { query: "天河" },
    })) as AnyResult;
    assert.match(text(recalled), /天河区/);
  });
});

test("expense：记账后统计能看到", { timeout: 30000 }, async () => {
  await withClient("xiaopai-expense", async (client) => {
    await (client as Client).callTool({
      name: "expense_add",
      arguments: { amount: 42.5, category: "餐饮", note: "集成测试" },
    });
    const summary = (await (client as Client).callTool({
      name: "expense_summary",
      arguments: {},
    })) as AnyResult;
    assert.equal(summary.isError ?? false, false);
    assert.match(text(summary), /¥42\.50/);
  });
});

test("expense：金额为 0 在协议层就被拒绝", { timeout: 30000 }, async () => {
  await withClient("xiaopai-expense", async (client) => {
    const r = (await (client as Client).callTool({
      name: "expense_add",
      arguments: { amount: 0 },
    })) as AnyResult;
    assert.equal(r.isError, true);
    // schema 的 positive() 会先拦住，业务层 E_VALIDATION 是第二道兜底
    assert.match(text(r), /E_VALIDATION|Input validation error/i);
  });
});

test("countdown：新增后能算出剩余天数", { timeout: 30000 }, async () => {
  await withClient("xiaopai-countdown", async (client) => {
    const target = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    const added = (await (client as Client).callTool({
      name: "countdown_add",
      arguments: { title: "集成测试倒数日", date: target },
    })) as AnyResult;
    assert.equal((added.structuredContent as { daysLeft?: number }).daysLeft, 30);
  });
});

test("convert：单位换算结果精确", { timeout: 30000 }, async () => {
  await withClient("xiaopai-convert", async (client) => {
    const r = (await (client as Client).callTool({
      name: "convert_unit",
      arguments: { value: 5, from: "mi", to: "km" },
    })) as AnyResult;
    assert.match(text(r), /8\.04672/);
  });
});

test("convert：跨类别换算给出 E_UNSUPPORTED_UNIT", { timeout: 30000 }, async () => {
  await withClient("xiaopai-convert", async (client) => {
    const r = (await (client as Client).callTool({
      name: "convert_unit",
      arguments: { value: 1, from: "米", to: "斤" },
    })) as AnyResult;
    assert.equal(r.isError, true);
    assert.match(text(r), /E_UNSUPPORTED_UNIT/);
  });
});

test("convert：汇率换算走真实接口（离线时跳过）", { timeout: 30000, skip: process.env.XIAOPAI_OFFLINE === "1" }, async () => {
  await withClient("xiaopai-convert", async (client) => {
    const r = (await (client as Client).callTool({
      name: "convert_currency",
      arguments: { amount: 100, from: "USD", to: "CNY" },
    })) as AnyResult;
    assert.equal(r.isError ?? false, false, text(r));
    assert.match(text(r), /CNY/);
  });
});

test("web：拒绝非网页类型与非法地址", { timeout: 30000 }, async () => {
  await withClient("xiaopai-web", async (client) => {
    const bad = (await (client as Client).callTool({
      name: "fetch_url",
      arguments: { url: "ftp://example.com/a" },
    })) as AnyResult;
    assert.equal(bad.isError, true);
    assert.match(text(bad), /E_BAD_URL/);
  });
});

test("web：能抓到 example.com 的标题", { timeout: 30000, skip: process.env.XIAOPAI_OFFLINE === "1" }, async () => {
  await withClient("xiaopai-web", async (client) => {
    const r = (await (client as Client).callTool({
      name: "fetch_url",
      arguments: { url: "example.com", maxChars: 500 },
    })) as AnyResult;
    assert.equal(r.isError ?? false, false, text(r));
    assert.match(text(r), /Example Domain/i);
  });
});
