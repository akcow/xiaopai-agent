/** 临时探针：同一个会话连跑多轮，看每轮到底调了哪些工具（验证"第二轮开始不调工具"的怀疑）。 */
import { migrate } from "../src/data/db.js";
import { acquireSession, disposeAll } from "../src/agent/sessionStore.js";
import { listTodos } from "../src/data/todos.js";
import { listMemories } from "../src/data/memories.js";

migrate();
const record = await acquireSession(null);
console.log(`会话 ${record.id}，工具 ${record.session.getActiveToolNames().length} 个\n`);

const turns = [
  "杭州明天要带伞吗？出门上班。",
  "帮我记一下：周五下午三点去实验室交软件工程作业。",
  "我住在广州，不吃香菜，记一下。",
];

for (const [i, prompt] of turns.entries()) {
  const activeBefore = record.session.getActiveToolNames();
  console.log(`  [轮前] 活动工具 ${activeBefore.length} 个，mcp ${activeBefore.filter((n) => n.startsWith("mcp__")).length} 个`);
  const calls: string[] = [];
  const detach = record.session.subscribe((e) => {
    const ev = e as unknown as { type: string; toolName?: string };
    if (ev.type === "tool_execution_start" && ev.toolName) calls.push(ev.toolName);
  });
  await record.session.prompt(prompt);
  detach();
  const reply = (record.session.getLastAssistantText() ?? "").replace(/\n+/g, " ").slice(0, 60);
  console.log(`第 ${i + 1} 轮：「${prompt.slice(0, 12)}…」`);
  console.log(`  调用：${calls.length ? calls.join(", ") : "（无）"}`);
  console.log(`  回答：${reply}`);
  console.log(`  库里：待办 ${listTodos({ status: "all", limit: 50 }).length} 条，记忆 ${listMemories(50).length} 条`);
  const activeAfter = record.session.getActiveToolNames();
  console.log(`  [轮后] 活动工具 ${activeAfter.length} 个，mcp ${activeAfter.filter((n) => n.startsWith("mcp__")).length} 个`);
}

await disposeAll();
process.exit(0);
