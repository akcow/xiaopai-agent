/** xiaopai-weather：4 个天气工具，数据源 open-meteo（免费、无需 key）。 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { fail, logStart, ok } from "../_shared/mcpKit.js";
import { describeGeo, geocode, type GeoResult } from "./geocode.js";
import { fetchWeather, summarizeCurrent, summarizeDaily } from "./api.js";
import { buildAdvice, type Activity } from "./advice.js";

const server = new McpServer({ name: "xiaopai-weather", version: "1.0.0" });

/** 工具内部自己解析城市名，模型不必先调 geocode_city */
async function resolveCity(city: string): Promise<{ geo: GeoResult } | { error: ReturnType<typeof fail> }> {
  const matches = await geocode(city, 3);
  if (matches.length === 0) {
    return {
      error: fail(
        "E_CITY_NOT_FOUND",
        `没找到"${city}"这个城市。可以换个说法（比如只写城市名、去掉区县），或者告诉我省份。`,
      ),
    };
  }
  return { geo: matches[0]! };
}

server.registerTool(
  "geocode_city",
  {
    title: "城市名转经纬度",
    description:
      "当用户提到的城市/地点无法确定是哪一个时调用，把中文地名解析成经纬度与行政区，用来跟用户确认。能确定城市时不要调用本工具。",
    inputSchema: {
      city: z.string().min(1).max(40).describe("用户说的城市名，例如 杭州、上海市、朝阳区"),
      count: z.number().int().min(1).max(5).optional().describe("返回候选个数，默认 3"),
    },
  },
  async ({ city, count }) => {
    try {
      const matches = await geocode(city, count ?? 3);
      if (matches.length === 0) {
        return fail("E_CITY_NOT_FOUND", `没找到"${city}"，建议只写城市名或补充省份。`);
      }
      const text = `找到 ${matches.length} 个候选：${matches.map(describeGeo).join("；")}`;
      return ok(text, { query: city, matches });
    } catch (e) {
      return fail("E_UPSTREAM", `地理编码服务不可用：${(e as Error).message}`);
    }
  },
);

server.registerTool(
  "weather_current",
  {
    title: "当前天气实况",
    description:
      "当用户问某地现在/今天的天气、温度、下不下雨、穿什么时调用。返回温度、体感、湿度、风、天气现象。",
    inputSchema: {
      city: z.string().min(1).max(40).describe("城市名，例如 杭州"),
      unit: z.enum(["celsius", "fahrenheit"]).optional().describe("温度单位，默认摄氏度"),
    },
  },
  async ({ city, unit }) => {
    try {
      const resolved = await resolveCity(city);
      if ("error" in resolved) return resolved.error;
      const { geo } = resolved;
      const bundle = await fetchWeather(geo.latitude, geo.longitude, 1);
      const label = geo.admin1 && geo.admin1 !== geo.name ? `${geo.admin1}${geo.name}` : geo.name;
      return ok(summarizeCurrent(label, bundle.current), {
        city: geo.name,
        admin1: geo.admin1,
        unit: unit ?? "celsius",
        observedAt: bundle.current.time,
        timezone: bundle.timezone,
        ...bundle.current,
      });
    } catch (e) {
      return fail("E_UPSTREAM", `天气服务不可用：${(e as Error).message}`);
    }
  },
);

server.registerTool(
  "weather_forecast",
  {
    title: "未来多日预报",
    description:
      "当用户问明天/未来几天天气、要不要带伞、周末天气如何时调用。返回逐日最高最低温、降水概率、天气现象。",
    inputSchema: {
      city: z.string().min(1).max(40).describe("城市名，例如 杭州"),
      days: z.number().int().min(1).max(7).optional().describe("预报天数 1-7，默认 3"),
    },
  },
  async ({ city, days }) => {
    try {
      const resolved = await resolveCity(city);
      if ("error" in resolved) return resolved.error;
      const { geo } = resolved;
      const wanted = days ?? 3;
      const bundle = await fetchWeather(geo.latitude, geo.longitude, wanted);
      const list = bundle.daily.slice(0, wanted);
      const text = [`${geo.name}未来 ${list.length} 天：`, ...list.map((d) => `- ${summarizeDaily(d)}`)].join("\n");
      return ok(text, { city: geo.name, timezone: bundle.timezone, days: list });
    } catch (e) {
      return fail("E_UPSTREAM", `天气服务不可用：${(e as Error).message}`);
    }
  },
);

server.registerTool(
  "travel_advice",
  {
    title: "出行建议",
    description:
      "当用户问要不要带伞、穿什么、适不适合运动/晾晒/出游、几点出门最好时调用。返回带伞判断、穿衣建议、最佳时段、风险等级。",
    inputSchema: {
      city: z.string().min(1).max(40).describe("城市名"),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("日期 YYYY-MM-DD，默认今天"),
      activity: z.enum(["通勤", "运动", "出游", "晾晒"]).optional().describe("出行场景，默认通勤"),
    },
  },
  async ({ city, date, activity }) => {
    try {
      const resolved = await resolveCity(city);
      if ("error" in resolved) return resolved.error;
      const { geo } = resolved;
      const bundle = await fetchWeather(geo.latitude, geo.longitude, 7);
      const target = date ?? bundle.daily[0]?.date;
      const day = bundle.daily.find((d) => d.date === target);
      if (!day) {
        return fail(
          "E_DATE_OUT_OF_RANGE",
          `只能查 ${bundle.daily[0]?.date} 到 ${bundle.daily.at(-1)?.date} 之间的日期，请换个日期。`,
        );
      }
      const act: Activity = activity ?? "通勤";
      const advice = buildAdvice(day, bundle.hourly, act);
      const text = [
        `${geo.name} ${day.date}（${day.weekday}）${day.weatherDesc} ${day.tempMin.toFixed(0)}~${day.tempMax.toFixed(0)}℃`,
        `${act}建议：${advice.umbrella ? "要带伞" : "不用带伞"}｜穿衣 ${advice.clothing}｜最佳时段 ${advice.bestWindow}｜风险 ${advice.riskLevel}`,
        ...advice.tips.map((t) => `- ${t}`),
      ].join("\n");
      return ok(text, { city: geo.name, date: day.date, activity: act, day, advice });
    } catch (e) {
      return fail("E_UPSTREAM", `天气服务不可用：${(e as Error).message}`);
    }
  },
);

logStart("xiaopai-weather");
await server.connect(new StdioServerTransport());
