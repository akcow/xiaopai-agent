/**
 * 出行建议规则引擎。故意写成纯函数、不调模型：
 * ① 结果可复现，演示不会因为模型抽风而变化；② 可以单测。
 */
import type { DailyForecast, HourlyPoint } from "./api.js";
import { isRainyCode, isSnowyCode } from "./wmo.js";

export type Activity = "通勤" | "运动" | "出游" | "晾晒";
export type RiskLevel = "低" | "中" | "高";

export interface Advice {
  umbrella: boolean;
  clothing: string;
  bestWindow: string;
  tips: string[];
  riskLevel: RiskLevel;
}

function clothingFor(tempMax: number): string {
  if (tempMax >= 30) return "短袖 + 防晒";
  if (tempMax >= 22) return "薄长袖或 T 恤";
  if (tempMax >= 12) return "外套";
  if (tempMax >= 5) return "厚外套";
  return "羽绒服 + 保暖内搭";
}

/** 在 07:00–21:00 里找连续两小时"降水概率 < 30 且温度在 10–28℃"的窗口 */
function findBestWindow(hourly: HourlyPoint[], date: string): string {
  const points = hourly.filter((p) => p.time.startsWith(date));
  const usable = points.filter((p) => {
    const hour = Number(p.time.slice(11, 13));
    return hour >= 7 && hour <= 21;
  });
  for (let i = 0; i < usable.length - 1; i++) {
    const a = usable[i]!;
    const b = usable[i + 1]!;
    if (a.precipProbability < 30 && b.precipProbability < 30 && a.temperature >= 10 && b.temperature <= 28) {
      return `${a.time.slice(11, 13)}:00-${Number(b.time.slice(11, 13)) + 1}:00`;
    }
  }
  return "09:00-11:00（备选窗口）";
}

export function buildAdvice(day: DailyForecast, hourly: HourlyPoint[], activity: Activity): Advice {
  const rainy = isRainyCode(day.weatherCode) || isSnowyCode(day.weatherCode) || day.precipProbability >= 50;
  const snowing = isSnowyCode(day.weatherCode);
  const windy = day.windSpeedMax >= 40;
  const hot = day.tempMax >= 35;
  const freezing = day.tempMin <= 0;

  let riskLevel: RiskLevel = "低";
  if (rainy && windy) riskLevel = "高";
  else if (rainy || hot || freezing || windy) riskLevel = "中";

  const tips: string[] = [];
  if (rainy) tips.push(`降水概率 ${day.precipProbability}%，${snowing ? "路面湿滑，注意防滑" : "出门带伞"}`);
  if (day.tempMax - day.tempMin >= 10) tips.push(`昼夜温差 ${(day.tempMax - day.tempMin).toFixed(0)}℃，早晚注意增减衣物`);
  if (windy) tips.push(`阵风最高 ${day.windSpeedMax.toFixed(0)} km/h，骑行和高空作业注意安全`);

  switch (activity) {
    case "运动":
      tips.push(hot ? "避开 12:00-15:00 高温时段，补水" : "适合户外运动，注意热身");
      if (rainy) tips.push("有降水，建议改为室内运动");
      break;
    case "晾晒":
      tips.push(rainy ? `降水概率 ${day.precipProbability}%，不建议晾晒` : "降水概率低，适合晾晒");
      break;
    case "出游":
      tips.push(rainy ? "带上雨具，优先安排室内行程" : "天气条件不错，适合安排户外行程");
      if (day.tempMax >= 30) tips.push("紫外线较强，注意防晒");
      break;
    default:
      tips.push(rainy ? "通勤建议提前出门，避开积水路段" : "通勤天气正常");
      break;
  }

  return {
    umbrella: rainy,
    clothing: clothingFor(day.tempMax),
    bestWindow: findBestWindow(hourly, day.date),
    tips,
    riskLevel,
  };
}
