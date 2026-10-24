/** 单位换算单测。换算错一位小数就是事故，所以边界值都钉死。 */
import test from "node:test";
import assert from "node:assert/strict";
import { convertUnit, isConvertError } from "../../mcp/convert/units.js";
import { applyRate } from "../../mcp/convert/rates.js";

function value(x: ReturnType<typeof convertUnit>): number {
  assert.ok(!isConvertError(x), `不该报错：${isConvertError(x) ? x.error : ""}`);
  return x.result;
}

test("长度：5 英里 ≈ 8.04672 公里", () => {
  assert.equal(value(convertUnit(5, "mi", "km")), 8.04672);
});

test("长度：1 米 = 100 厘米 = 1000 毫米", () => {
  assert.equal(value(convertUnit(1, "m", "cm")), 100);
  assert.equal(value(convertUnit(1, "米", "毫米")), 1000);
});

test("质量：180 磅 ≈ 163.29 斤", () => {
  const jin = value(convertUnit(180, "lb", "斤"));
  assert.ok(Math.abs(jin - 163.293) < 0.01, `实际 ${jin}`);
});

test("质量：1 斤 = 500 克，1 两 = 50 克", () => {
  assert.equal(value(convertUnit(1, "斤", "克")), 500);
  assert.equal(value(convertUnit(1, "两", "克")), 50);
});

test("温度：100℉ = 37.78℃，0℃ = 32℉，0K = -273.15℃", () => {
  assert.ok(Math.abs(value(convertUnit(100, "f", "c")) - 37.777778) < 0.0001);
  assert.equal(value(convertUnit(0, "℃", "℉")), 32);
  assert.equal(value(convertUnit(0, "k", "c")), -273.15);
});

test("数据量按 1024 进制", () => {
  assert.equal(value(convertUnit(2, "GB", "MB")), 2048);
  assert.equal(value(convertUnit(1, "TB", "GB")), 1024);
});

test("同一单位换算等于自身", () => {
  assert.equal(value(convertUnit(42, "kg", "kg")), 42);
});

test("跨类别换算要报错，而不是悄悄按长度算", () => {
  const r = convertUnit(1, "米", "斤");
  assert.ok(isConvertError(r));
  assert.match(r.error, /不是同一类/);
});

test("不认识的单位给出可用示例", () => {
  const r = convertUnit(1, "光年", "米");
  assert.ok(isConvertError(r));
  assert.match(r.error, /不认识单位/);
  assert.match(r.error, /米\/公里/);
});

test("汇率换算保留两位小数", () => {
  assert.equal(applyRate(100, 7.123), 712.3);
  assert.equal(applyRate(0.5, 3.333), 1.67);
});
