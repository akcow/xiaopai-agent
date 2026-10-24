/**
 * 待办仓储层单测。每个测试文件跑在独立进程里，所以可以在 import 前
 * 把 XIAOPAI_DB 指到临时目录，绝不碰开发用的 data/xiaopai.db。
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "xiaopai-todos-"));
process.env.XIAOPAI_DB = join(dir, "test.db");

const { migrate, closeDb } = await import("../../src/data/db.js");
const { addTodo, listTodos, updateTodo, deleteTodo, todoStats, isDateString } =
  await import("../../src/data/todos.js");

migrate();
test.after(() => closeDb());

test("日期校验只接受 YYYY-MM-DD", () => {
  assert.equal(isDateString("2026-10-25"), true);
  assert.equal(isDateString("2026-13-01"), false);
  assert.equal(isDateString("2026/10/25"), false);
  assert.equal(isDateString("明天"), false);
});

test("新增后能查到，字段完整", () => {
  const row = addTodo({ title: "  交软件工程作业  ", dueDate: "2026-10-29", priority: "high" });
  assert.equal(row.title, "交软件工程作业", "标题应去掉首尾空格");
  assert.equal(row.status, "pending");
  assert.equal(row.priority, "high");
  assert.equal(row.dueDate, "2026-10-29");
  assert.equal(row.overdue, false);
});

test("列表默认只返回未完成的，且按截止日排序", () => {
  addTodo({ title: "晚的", dueDate: "2099-12-31" });
  addTodo({ title: "早的", dueDate: "2000-01-01" });
  const pending = listTodos({ status: "pending" });
  const withDue = pending.filter((t) => t.dueDate).map((t) => t.dueDate!);
  assert.deepEqual(withDue, [...withDue].sort(), "应按截止日升序");
  assert.ok(pending.every((t) => t.status === "pending"));
});

test("逾期判断只看未完成且早于今天", () => {
  const row = addTodo({ title: "过期的事", dueDate: "2000-01-01" });
  const found = listTodos({ status: "pending" }).find((t) => t.id === row.id);
  assert.equal(found?.overdue, true);

  updateTodo({ id: row.id, status: "done" });
  const afterDone = listTodos({ status: "all" }).find((t) => t.id === row.id);
  assert.equal(afterDone?.overdue, false, "完成之后不再算逾期");
  assert.ok(afterDone?.done_at, "完成时要写 done_at");
});

test("改状态和优先级会记录 changed 字段", () => {
  const row = addTodo({ title: "要改的事" });
  const result = updateTodo({ id: row.id, status: "done", priority: "low" });
  assert.ok(result);
  assert.ok(result.changed.includes("status"));
  assert.ok(result.changed.includes("priority"));
  assert.equal(result.after.priority, "low");
});

test("改不存在的 id 返回 undefined", () => {
  assert.equal(updateTodo({ id: 999999, status: "done" }), undefined);
});

test("统计数字与实际数据一致", () => {
  const stats = todoStats();
  const all = listTodos({ status: "all", limit: 50 });
  assert.equal(stats.pending, all.filter((t) => t.status === "pending").length);
  assert.equal(stats.done, all.filter((t) => t.status === "done").length);
  assert.equal(stats.overdue, all.filter((t) => t.overdue).length);
});

test("删除返回被删的行，再删返回 undefined", () => {
  const row = addTodo({ title: "待删除" });
  assert.equal(deleteTodo(row.id)?.title, "待删除");
  assert.equal(deleteTodo(row.id), undefined);
});

test("limit 会被夹到 1-50，不会返回空数组", () => {
  assert.ok(listTodos({ limit: 0 }).length >= 1);
  assert.ok(listTodos({ status: "all", limit: 999 }).length <= 50);
});
