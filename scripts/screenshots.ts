/**
 * 用 Playwright 驱动真实页面截图，产出 README / 博客要用的证据图。
 * 前提：npm run dev（或 npm start）已在 127.0.0.1:8787 起着，且 .env 里有可用的模型 key。
 */
import { chromium, type Page } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.XIAOPAI_BASE ?? "http://127.0.0.1:8787";
const OUT = join(process.cwd(), "docs", "screenshots");
mkdirSync(OUT, { recursive: true });

/** 等本轮真正开始（assistant 气泡变多），再等状态回到 idle —— 只看 idle 会被上一轮的状态骗过 */
async function ask(page: Page, text: string, label: string): Promise<void> {
  const before = await page.locator(".msg.assistant").count();
  console.log(`  提问：${text}`);
  await page.fill("#input", text);
  await page.press("#input", "Enter");

  await page.waitForFunction(
    (n) => document.querySelectorAll(".msg.assistant").length > n,
    before,
    { timeout: 60000 },
  );
  await page.waitForFunction(
    () => document.getElementById("status")?.dataset.state === "idle",
    undefined,
    { timeout: 180000 },
  );
  // 等打字光标消失、侧栏刷新完
  await page.waitForFunction(() => document.querySelectorAll(".bubble.streaming").length === 0, undefined, {
    timeout: 10000,
  });
  await page.waitForTimeout(700);
  console.log(`  ✅ ${label}`);
}

const browser = await chromium.launch({ args: ["--font-render-hinting=none"] });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  locale: "zh-CN",
  timezoneId: "Asia/Shanghai",
});
const page = await context.newPage();
page.on("console", (msg) => {
  if (msg.type() === "error") console.log(`  [浏览器错误] ${msg.text()}`);
});

console.log("打开首页…");
await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForTimeout(800);
await page.screenshot({ path: join(OUT, "01-home.png") });
console.log("  ✅ 01-home.png");

// 第 1 轮：查天气（触发 travel_advice，出现工具卡片）
await ask(page, "杭州明天要带伞吗？出门上班。", "02-weather-chat.png");
await page.screenshot({ path: join(OUT, "02-weather-chat.png") });

// 第 2 轮：记待办（右侧栏真的多一条）
await ask(page, "帮我记一下：周五下午三点去实验室交软件工程作业。", "03-todo.png");
await page.screenshot({ path: join(OUT, "03-todo.png") });

// 第 3 轮：说偏好（写长期记忆，服务端会重建会话热注入）
await ask(page, "我住在广州，不吃香菜，记一下。", "04-long-term-memory.png");
await page.screenshot({ path: join(OUT, "04-long-term-memory.png") });

// 第 4 轮：记账（两条记录一次说完，触发两次 expense_add）
await ask(page, "今天午饭花了 28 块，打车 20 块，帮我记一下。", "05-expense.png");
await page.screenshot({ path: join(OUT, "05-expense.png") });

// 第 5 轮：倒数日
await ask(page, "距离 2026-12-20 的软工答辩还有多少天？帮我记个倒数日。", "06-countdown.png");
await page.screenshot({ path: join(OUT, "06-countdown.png") });

// 第 6 轮：追问，验证记忆被用上
await ask(page, "根据你记得的，帮我推荐个晚饭。", "07-recall.png");
await page.screenshot({ path: join(OUT, "07-recall.png") });

// 展开第一张工具卡片，展示参数与结果
const firstTool = page.locator(".tool-head").first();
if (await firstTool.count()) {
  await firstTool.click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(OUT, "08-tool-card.png") });
  console.log("  ✅ 08-tool-card.png");
}

await browser.close();
console.log(`\n截图已保存到 ${OUT}`);
