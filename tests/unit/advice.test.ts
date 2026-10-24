/** 出行建议规则引擎的单测：这是"建议"的唯一来源，必须可复现。 */
import test from "node:test";
import assert from "node:assert/strict";
import { buildAdvice } from "../../mcp/weather/advice.js";
import type { DailyForecast, HourlyPoint } from "../../mcp/weather/api.js";

function day(over: Partial<DailyForecast> = {}): DailyForecast {
  return {
    date: "2026-10-25",
    weekday: "周日",
    weatherCode: 0,
    weatherDesc: "晴",
    tempMax: 24,
    tempMin: 18,
    precipProbability: 5,
    windSpeedMax: 10,
    ...over,
  };
}

function hourly(precipByHour: Record<number, number>, temp = 22): HourlyPoint[] {
  return Array.from({ length: 24 }, (_, h) => ({
    time: `2026-10-25T${String(h).padStart(2, "0")}:00`,
    temperature: temp,
    precipProbability: precipByHour[h] ?? 0,
  }));
}

test("降水概率 ≥50% 要带伞", () => {
  const advice = buildAdvice(day({ precipProbability: 60 }), hourly({}), "通勤");
  assert.equal(advice.umbrella, true);
});

test("降水概率低于 50% 且天气码是晴 → 不带伞", () => {
  const advice = buildAdvice(day({ precipProbability: 10 }), hourly({}), "通勤");
  assert.equal(advice.umbrella, false);
});

test("即使降水概率只有 14%，天气码是毛毛雨也要带伞", () => {
  const advice = buildAdvice(day({ weatherCode: 51, weatherDesc: "毛毛雨", precipProbability: 14 }), hourly({}), "通勤");
  assert.equal(advice.umbrella, true);
});

test("穿衣建议随最高温变化", () => {
  assert.match(buildAdvice(day({ tempMax: 33 }), hourly({}), "通勤").clothing, /短袖/);
  assert.match(buildAdvice(day({ tempMax: 25 }), hourly({}), "通勤").clothing, /薄长袖/);
  assert.match(buildAdvice(day({ tempMax: 16 }), hourly({}), "通勤").clothing, /外套/);
  assert.match(buildAdvice(day({ tempMax: 3 }), hourly({}), "通勤").clothing, /羽绒服/);
});

test("下雨 + 大风 → 风险高；只有下雨 → 风险中", () => {
  assert.equal(buildAdvice(day({ precipProbability: 70, windSpeedMax: 45 }), hourly({}), "通勤").riskLevel, "高");
  assert.equal(buildAdvice(day({ precipProbability: 70, windSpeedMax: 12 }), hourly({}), "通勤").riskLevel, "中");
  assert.equal(buildAdvice(day({ precipProbability: 5, windSpeedMax: 12 }), hourly({}), "通勤").riskLevel, "低");
});

test("最佳时段挑出降水概率最低的连续两小时（窗口跨两小时）", () => {
  // 10 点、11 点全晴，其余时间都在下雨
  const rainAllDay: Record<number, number> = {};
  for (let h = 7; h <= 21; h++) rainAllDay[h] = 80;
  rainAllDay[10] = 5;
  rainAllDay[11] = 5;
  assert.equal(buildAdvice(day(), hourly(rainAllDay), "通勤").bestWindow, "10:00-12:00");
});

test("全天都下雨时退回默认窗口，不会给出空值", () => {
  const rainAllDay: Record<number, number> = {};
  for (let h = 0; h < 24; h++) rainAllDay[h] = 90;
  const advice = buildAdvice(day({ precipProbability: 90 }), hourly(rainAllDay), "通勤");
  assert.match(advice.bestWindow, /09:00-11:00/);
});

test("不同场景给不同建议条目", () => {
  const dry = day({ precipProbability: 5 });
  assert.ok(buildAdvice(dry, hourly({}), "晾晒").tips.some((t) => t.includes("适合晾晒")));
  assert.ok(buildAdvice(day({ precipProbability: 80 }), hourly({}), "运动").tips.some((t) => t.includes("室内")));
  assert.ok(buildAdvice(day({ tempMax: 36 }), hourly({}), "出游").tips.some((t) => t.includes("防晒")));
});

test("同样的输入必须给同样的输出（可复现）", () => {
  const input = day({ precipProbability: 42, tempMax: 27, windSpeedMax: 30 });
  const a = buildAdvice(input, hourly({}), "出游");
  const b = buildAdvice(input, hourly({}), "出游");
  assert.deepEqual(a, b);
});
