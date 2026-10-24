/**
 * 单位换算。纯函数、无网络，方便单测。
 * 每个单位只记"折算到基准单位的倍数"，换算就是 value * from / to。
 */

type Category = "length" | "mass" | "volume" | "area" | "temperature" | "data";

interface UnitDef {
  category: Category;
  /** 折算到该类基准单位的倍数（温度不用它） */
  factor: number;
  label: string;
}

const UNITS: Record<string, UnitDef> = {
  // 长度，基准米
  mm: { category: "length", factor: 0.001, label: "毫米" },
  毫米: { category: "length", factor: 0.001, label: "毫米" },
  cm: { category: "length", factor: 0.01, label: "厘米" },
  厘米: { category: "length", factor: 0.01, label: "厘米" },
  m: { category: "length", factor: 1, label: "米" },
  米: { category: "length", factor: 1, label: "米" },
  km: { category: "length", factor: 1000, label: "公里" },
  公里: { category: "length", factor: 1000, label: "公里" },
  千米: { category: "length", factor: 1000, label: "公里" },
  里: { category: "length", factor: 500, label: "里" },
  in: { category: "length", factor: 0.0254, label: "英寸" },
  英寸: { category: "length", factor: 0.0254, label: "英寸" },
  ft: { category: "length", factor: 0.3048, label: "英尺" },
  英尺: { category: "length", factor: 0.3048, label: "英尺" },
  mi: { category: "length", factor: 1609.344, label: "英里" },
  英里: { category: "length", factor: 1609.344, label: "英里" },

  // 质量，基准千克
  g: { category: "mass", factor: 0.001, label: "克" },
  克: { category: "mass", factor: 0.001, label: "克" },
  kg: { category: "mass", factor: 1, label: "千克" },
  千克: { category: "mass", factor: 1, label: "千克" },
  公斤: { category: "mass", factor: 1, label: "千克" },
  斤: { category: "mass", factor: 0.5, label: "斤" },
  两: { category: "mass", factor: 0.05, label: "两" },
  t: { category: "mass", factor: 1000, label: "吨" },
  吨: { category: "mass", factor: 1000, label: "吨" },
  lb: { category: "mass", factor: 0.45359237, label: "磅" },
  磅: { category: "mass", factor: 0.45359237, label: "磅" },
  oz: { category: "mass", factor: 0.028349523125, label: "盎司" },
  盎司: { category: "mass", factor: 0.028349523125, label: "盎司" },

  // 体积，基准升
  ml: { category: "volume", factor: 0.001, label: "毫升" },
  毫升: { category: "volume", factor: 0.001, label: "毫升" },
  l: { category: "volume", factor: 1, label: "升" },
  升: { category: "volume", factor: 1, label: "升" },
  cup: { category: "volume", factor: 0.24, label: "杯(240ml)" },
  杯: { category: "volume", factor: 0.24, label: "杯(240ml)" },
  gal: { category: "volume", factor: 3.785411784, label: "加仑" },
  加仑: { category: "volume", factor: 3.785411784, label: "加仑" },

  // 面积，基准平方米
  sqm: { category: "area", factor: 1, label: "平方米" },
  平方米: { category: "area", factor: 1, label: "平方米" },
  平米: { category: "area", factor: 1, label: "平方米" },
  mu: { category: "area", factor: 666.6667, label: "亩" },
  亩: { category: "area", factor: 666.6667, label: "亩" },
  ha: { category: "area", factor: 10000, label: "公顷" },
  公顷: { category: "area", factor: 10000, label: "公顷" },
  sqft: { category: "area", factor: 0.09290304, label: "平方英尺" },

  // 数据量，基准字节
  b: { category: "data", factor: 1, label: "字节" },
  kb: { category: "data", factor: 1024, label: "KB" },
  mb: { category: "data", factor: 1024 ** 2, label: "MB" },
  gb: { category: "data", factor: 1024 ** 3, label: "GB" },
  tb: { category: "data", factor: 1024 ** 4, label: "TB" },

  // 温度：基准摄氏度，换算走公式
  c: { category: "temperature", factor: 1, label: "摄氏度" },
  摄氏度: { category: "temperature", factor: 1, label: "摄氏度" },
  "℃": { category: "temperature", factor: 1, label: "摄氏度" },
  f: { category: "temperature", factor: 1, label: "华氏度" },
  华氏度: { category: "temperature", factor: 1, label: "华氏度" },
  "℉": { category: "temperature", factor: 1, label: "华氏度" },
  k: { category: "temperature", factor: 1, label: "开尔文" },
  开尔文: { category: "temperature", factor: 1, label: "开尔文" },
};

export interface UnitConversion {
  value: number;
  from: string;
  to: string;
  category: Category;
  result: number;
  formula: string;
}

export type ConvertError = { error: string };

function norm(unit: string): string {
  return unit.trim().toLowerCase().replace(/^度$/, "c");
}

function toCelsius(value: number, unit: string): number {
  const u = norm(unit);
  if (u === "f" || u === "华氏度" || u === "℉") return (value - 32) / 1.8;
  if (u === "k" || u === "开尔文") return value - 273.15;
  return value;
}

function fromCelsius(celsius: number, unit: string): number {
  const u = norm(unit);
  if (u === "f" || u === "华氏度" || u === "℉") return celsius * 1.8 + 32;
  if (u === "k" || u === "开尔文") return celsius + 273.15;
  return celsius;
}

export function convertUnit(value: number, fromRaw: string, toRaw: string): UnitConversion | ConvertError {
  const from = UNITS[norm(fromRaw)];
  const to = UNITS[norm(toRaw)];

  if (!from) return { error: `不认识单位"${fromRaw}"。支持：长度、质量、体积、面积、温度、数据量，例如 米/公里/斤/摄氏度/MB。` };
  if (!to) return { error: `不认识单位"${toRaw}"。` };
  if (from.category !== to.category) {
    return { error: `"${fromRaw}"(${from.label}) 和 "${toRaw}"(${to.label}) 不是同一类单位，不能直接换算。` };
  }

  let result: number;
  let formula: string;
  if (from.category === "temperature") {
    const celsius = toCelsius(value, fromRaw);
    result = fromCelsius(celsius, toRaw);
    formula = `${value}${from.label} → ${celsius.toFixed(2)}℃ → ${result.toFixed(2)}${to.label}`;
  } else {
    result = (value * from.factor) / to.factor;
    formula = `${value}${from.label} × ${from.factor} ÷ ${to.factor}`;
  }

  return {
    value,
    from: from.label,
    to: to.label,
    category: from.category,
    result: Math.round(result * 1e6) / 1e6,
    formula,
  };
}

export function isConvertError(x: UnitConversion | ConvertError): x is ConvertError {
  return (x as ConvertError).error !== undefined;
}
