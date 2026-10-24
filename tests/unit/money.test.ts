/** 倒数日与记账的仓储层单测（同一个临时库）。 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "xiaopai-money-"));
process.env.XIAOPAI_DB = join(dir, "test.db");

const { migrate, closeDb } = await import("../../src/data/db.js");
const { addCountdown, listCountdowns, daysBetween, deleteCountdown } = await import(
  "../../src/data/countdowns.js"
);
const { addExpense, listExpenses, summarizeExpenses, deleteExpense, todayString } = await import(
  "../../src/data/expenses.js"
);

migrate();
test.after(() => closeDb());

test("天数差跨月跨年都算对", () => {
  assert.equal(daysBetween("2026-10-24", "2026-10-25"), 1);
  assert.equal(daysBetween("2026-10-24", "2026-11-24"), 31);
  assert.equal(daysBetween("2026-12-31", "2027-01-01"), 1);
  assert.equal(daysBetween("2026-10-24", "2026-10-24"), 0);
  assert.equal(daysBetween("2026-10-24", "2026-10-20"), -4);
});

test("新增倒数日会带上剩余天数", () => {
  const future = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
  const row = addCountdown({ title: "软件工程答辩", targetDate: future });
  assert.equal(row.daysLeft, 10);
  assert.equal(row.passed, false);
});

test("列表默认过滤掉已经过去的倒数日", () => {
  addCountdown({ title: "去年的今天", targetDate: "2025-01-01" });
  const upcoming = listCountdowns({});
  assert.ok(upcoming.every((c) => !c.passed));

  const all = listCountdowns({ includePast: true });
  assert.ok(all.some((c) => c.title === "去年的今天" && c.passed));
});

test("删除倒数日返回被删记录", () => {
  const row = addCountdown({ title: "临时", targetDate: "2099-01-01" });
  assert.equal(deleteCountdown(row.id)?.title, "临时");
  assert.equal(deleteCountdown(row.id), undefined);
});

test("记账金额保留两位小数，默认日期是今天", () => {
  const row = addExpense({ amount: 35.678, category: "餐饮", note: "火锅" });
  assert.equal(row.amount, 35.68);
  assert.equal(row.spent_on, todayString());
});

test("统计：总额、笔数、日均、分类汇总", () => {
  addExpense({ amount: 20, category: "交通", spentOn: "2026-10-01" });
  addExpense({ amount: 80, category: "学习", spentOn: "2026-10-01" });
  addExpense({ amount: 100, category: "餐饮", spentOn: "2026-10-02" });

  const s = summarizeExpenses({ from: "2026-10-01", to: "2026-10-02" });
  assert.equal(s.total, 200);
  assert.equal(s.count, 3);
  assert.equal(s.days, 2);
  assert.equal(s.dailyAverage, 100);
  assert.equal(s.byCategory[0]?.category, "餐饮");
  assert.equal(s.byCategory[0]?.total, 100);
});

test("区间过滤只统计区间内的账", () => {
  const s = summarizeExpenses({ from: "2026-10-02", to: "2026-10-02" });
  assert.equal(s.total, 100);
  assert.equal(s.count, 1);
});

test("空区间返回 0，而不是 null", () => {
  const s = summarizeExpenses({ from: "1990-01-01", to: "1990-01-02" });
  assert.equal(s.total, 0);
  assert.equal(s.count, 0);
  assert.equal(s.dailyAverage, 0);
});

test("明细按日期倒序返回", () => {
  const items = listExpenses({ limit: 10 });
  const dates = items.map((i) => i.spent_on);
  assert.deepEqual(dates, [...dates].sort().reverse());
});

test("删除记账返回被删记录", () => {
  const row = addExpense({ amount: 1, category: "其他" });
  assert.equal(deleteExpense(row.id)?.id, row.id);
  assert.equal(deleteExpense(row.id), undefined);
});
