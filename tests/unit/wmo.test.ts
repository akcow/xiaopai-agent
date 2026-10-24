/** 天气码与日期工具的单测。这些函数被规则引擎依赖，错了会直接影响"该不该带伞"。 */
import test from "node:test";
import assert from "node:assert/strict";
import { isRainyCode, isSnowyCode, weatherText, weekdayOf, windDirText } from "../../mcp/weather/wmo.js";

test("常见天气码能翻译成中文", () => {
  assert.equal(weatherText(0), "晴");
  assert.equal(weatherText(3), "阴");
  assert.equal(weatherText(61), "小雨");
  assert.equal(weatherText(95), "雷阵雨");
});

test("未知或缺失的天气码不会抛错", () => {
  assert.equal(weatherText(undefined), "未知");
  assert.equal(weatherText(null), "未知");
  assert.match(weatherText(1234), /未知/);
});

test("雨雪判定覆盖毛毛雨、阵雨、雷雨与雪", () => {
  for (const code of [51, 53, 55, 61, 65, 80, 82, 95, 96, 99]) {
    assert.equal(isRainyCode(code), true, `code ${code} 应判为降水`);
  }
  for (const code of [71, 73, 75, 85, 86]) {
    assert.equal(isSnowyCode(code), true, `code ${code} 应判为雪`);
  }
  assert.equal(isRainyCode(0), false);
  assert.equal(isSnowyCode(0), false);
  assert.equal(isRainyCode(undefined), false);
});

test("日期转星期几", () => {
  assert.equal(weekdayOf("2026-10-25"), "周日");
  assert.equal(weekdayOf("2026-10-26"), "周一");
  assert.equal(weekdayOf("不是日期"), "");
});

test("风向按 45 度一档折算", () => {
  assert.equal(windDirText(0), "北风");
  assert.equal(windDirText(90), "东风");
  assert.equal(windDirText(180), "南风");
  assert.equal(windDirText(359), "北风");
  assert.equal(windDirText(null), "未知");
});
