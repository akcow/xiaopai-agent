/**
 * 系统提示词拼装。
 * 保留 Pi 默认提示词（它教模型怎么发工具调用），只在尾部追加人设、时间、长期记忆。
 * 注意 session.systemPrompt 是只读的，所以记忆必须在建会话时拼进去 —— 变更后靠重建会话热注入。
 */
import { readFileSync } from "node:fs";
import { PERSONA_PATH } from "../config.js";
import { memoriesForPrompt } from "../data/memories.js";

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

function nowInShanghai(): { text: string; weekday: string } {
  const now = new Date();
  const text = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
  const weekday = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", weekday: "short" }).format(now);
  return { text, weekday: weekday || WEEKDAYS[now.getDay()]! };
}

export function buildPersonaAppend(): string {
  const { text, weekday } = nowInShanghai();
  const memories = memoriesForPrompt(20);
  const memoryBlock =
    memories.length === 0
      ? "- （暂无，第一次见面）"
      : memories.map((m) => `- [${m.category}] ${m.content}`).join("\n");

  return readFileSync(PERSONA_PATH, "utf8")
    .replace("{{NOW}}", text)
    .replace("{{WEEKDAY}}", weekday)
    .replace("{{MEMORIES}}", memoryBlock)
    .trim();
}
