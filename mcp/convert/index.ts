/** xiaopai-convert：单位换算（纯本地）与汇率换算（open.er-api.com，免费无 key）。 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { fail, logStart, ok } from "../_shared/mcpKit.js";
import { convertUnit, isConvertError } from "./units.js";
import { convertCurrency } from "./rates.js";

const server = new McpServer({ name: "xiaopai-convert", version: "1.0.0" });

server.registerTool(
  "convert_unit",
  {
    title: "单位换算",
    description:
      "当用户要换算长度、重量、体积、面积、温度、数据量时调用，例如“5 英里是多少公里”“180 磅多少斤”“100 华氏度是多少度”“2 GB 多少 MB”。",
    inputSchema: {
      value: z.number().describe("要换算的数值"),
      from: z.string().min(1).max(12).describe("源单位，例如 米/km/斤/lb/摄氏度/MB"),
      to: z.string().min(1).max(12).describe("目标单位"),
    },
  },
  async ({ value, from, to }) => {
    const result = convertUnit(value, from, to);
    if (isConvertError(result)) return fail("E_UNSUPPORTED_UNIT", result.error);
    return ok(`${result.value}${result.from} = ${result.result}${result.to}（${result.formula}）`, result);
  },
);

server.registerTool(
  "convert_currency",
  {
    title: "汇率换算",
    description:
      "当用户问“100 美元合多少人民币”“这个月生活费还剩多少日元”时调用。货币用 ISO 代码：CNY/USD/JPY/EUR/GBP/KRW/HKD 等。",
    inputSchema: {
      amount: z.number().describe("金额"),
      from: z.string().min(2).max(4).describe("源货币 ISO 代码，例如 USD"),
      to: z.string().min(2).max(4).describe("目标货币 ISO 代码，例如 CNY"),
    },
  },
  async ({ amount, from, to }) => {
    try {
      const r = await convertCurrency(amount, from, to);
      return ok(
        `${r.amount} ${r.from} ≈ ${r.result} ${r.to}（汇率 ${r.rate}，数据更新于 ${r.updatedAt || "最近" }）`,
        r,
      );
    } catch (e) {
      return fail("E_UPSTREAM", `汇率服务不可用：${(e as Error).message}`);
    }
  },
);

logStart("xiaopai-convert");
await server.connect(new StdioServerTransport());
