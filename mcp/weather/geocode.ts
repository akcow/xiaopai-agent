/** 城市名 → 经纬度。open-meteo 的地理编码接口免费无 key，国内直连可用。 */
import { weatherText } from "./wmo.js";

export interface GeoResult {
  name: string;
  admin1?: string;
  country?: string;
  latitude: number;
  longitude: number;
  timezone?: string;
  population?: number;
}

/** 常见简称，省得用户说"沪""帝都"时查不到 */
const ALIAS: Record<string, string> = {
  帝都: "北京",
  魔都: "上海",
  羊城: "广州",
  鹏城: "深圳",
  蓉城: "成都",
  山城: "重庆",
  沪: "上海",
  京: "北京",
  穗: "广州",
  深: "深圳",
};

const CACHE = new Map<string, { at: number; data: GeoResult[] }>();
const TTL = 60 * 60 * 1000;

function normalize(city: string): string {
  const trimmed = city.trim();
  const aliased = ALIAS[trimmed] ?? trimmed;
  // 去掉"市/县/区"后缀，open-meteo 对"杭州市"的匹配反而不如"杭州"
  return aliased.replace(/(特别行政区|自治区|自治州|地区|市|县|区)$/u, "") || aliased;
}

export async function geocode(city: string, count = 3): Promise<GeoResult[]> {
  const query = normalize(city);
  const cacheKey = `${query}|${count}`;
  const hit = CACHE.get(cacheKey);
  if (hit && Date.now() - hit.at < TTL) return hit.data;

  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", query);
  url.searchParams.set("count", String(count));
  url.searchParams.set("language", "zh");
  url.searchParams.set("format", "json");

  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`地理编码接口返回 ${res.status}`);

  const json = (await res.json()) as { results?: GeoResult[] };
  const data = (json.results ?? []).map((r) => ({
    name: r.name,
    admin1: r.admin1,
    country: r.country,
    latitude: r.latitude,
    longitude: r.longitude,
    timezone: r.timezone,
    population: r.population,
  }));

  CACHE.set(cacheKey, { at: Date.now(), data });
  return data;
}

export function describeGeo(g: GeoResult): string {
  return [g.name, g.admin1, g.country].filter(Boolean).join(" · ");
}

export function describeWeatherCode(code: number): string {
  return weatherText(code);
}
