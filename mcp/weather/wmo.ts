/** WMO 天气代码 → 中文现象。open-meteo 只给数字码，模型看不懂，必须翻译。 */

const TABLE: Record<number, string> = {
  0: "晴",
  1: "晴间多云",
  2: "多云",
  3: "阴",
  45: "雾",
  48: "雾凇",
  51: "毛毛雨",
  53: "小雨",
  55: "中雨",
  56: "冻毛毛雨",
  57: "冻雨",
  61: "小雨",
  63: "中雨",
  65: "大雨",
  66: "冻雨",
  67: "强冻雨",
  71: "小雪",
  73: "中雪",
  75: "大雪",
  77: "雪粒",
  80: "阵雨",
  81: "中阵雨",
  82: "强阵雨",
  85: "小阵雪",
  86: "大阵雪",
  95: "雷阵雨",
  96: "雷阵雨伴小冰雹",
  99: "雷阵雨伴大冰雹",
};

const RAINY = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99]);
const SNOWY = new Set([71, 73, 75, 77, 85, 86]);

export function weatherText(code: number | null | undefined): string {
  if (code === null || code === undefined) return "未知";
  return TABLE[code] ?? `未知(${code})`;
}

export function isRainyCode(code: number | null | undefined): boolean {
  return code !== null && code !== undefined && RAINY.has(code);
}

export function isSnowyCode(code: number | null | undefined): boolean {
  return code !== null && code !== undefined && SNOWY.has(code);
}

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

export function weekdayOf(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  return Number.isNaN(d.getTime()) ? "" : WEEKDAYS[d.getDay()]!;
}

export function windDirText(deg: number | null | undefined): string {
  if (deg === null || deg === undefined) return "未知";
  const dirs = ["北", "东北", "东", "东南", "南", "西南", "西", "西北"];
  return `${dirs[Math.round(deg / 45) % 8]}风`;
}
