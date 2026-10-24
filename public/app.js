/* 小派前端：零构建，原生 DOM + fetch 流式读取。 */
const els = {
  messages: document.getElementById("messages"),
  intro: document.getElementById("intro"),
  form: document.getElementById("composer"),
  input: document.getElementById("input"),
  send: document.getElementById("btn-send"),
  abort: document.getElementById("btn-abort"),
  newBtn: document.getElementById("btn-new"),
  status: document.getElementById("status"),
  badgeModel: document.getElementById("badge-model"),
  badgeTools: document.getElementById("badge-tools"),
  badgeSession: document.getElementById("badge-session"),
  todoList: document.getElementById("todo-list"),
  todoHint: document.getElementById("todo-hint"),
  memList: document.getElementById("mem-list"),
  memHint: document.getElementById("mem-hint"),
};

const state = {
  sessionId: localStorage.getItem("xiaopai.sessionId") || null,
  streaming: false,
};

/* ---------- 工具函数 ---------- */
function setStatus(text, mode = "idle") {
  const short = text.length > 70 ? `${text.slice(0, 70)}…` : text;
  els.status.textContent = short;
  els.status.dataset.state = mode;
}

function shortToolName(name) {
  // 形如 mcp__xiaopai_weather__weather_forecast（服务器名里的 - 会被转成 _）
  return name.replace(/^mcp__.*?__/, "");
}

function friendlyTool(name) {
  const n = shortToolName(name);
  const map = {
    weather_current: "查当前天气",
    weather_forecast: "查未来天气",
    travel_advice: "出行建议",
    geocode_city: "定位城市",
    todo_add: "新增待办",
    todo_list: "查询待办",
    todo_update: "修改待办",
    todo_delete: "删除待办",
    memory_remember: "记住偏好",
    memory_recall: "回忆偏好",
    memory_forget: "忘记偏好",
    file_list: "列目录",
    file_read: "读文件",
    file_write: "写文件",
  };
  return map[n] || n;
}

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

/* ---------- 渲染 ---------- */
function hideIntro() {
  if (els.intro && els.intro.parentNode) els.intro.remove();
}

function appendUser(text) {
  hideIntro();
  const wrap = el("div", "msg user");
  wrap.appendChild(el("div", "role", "我"));
  wrap.appendChild(el("div", "bubble", text));
  els.messages.appendChild(wrap);
  scrollToBottom();
}

function createAssistant() {
  const wrap = el("div", "msg assistant");
  wrap.appendChild(el("div", "role", "小派"));
  const tools = el("div", "tools");
  const bubble = el("div", "bubble streaming");
  wrap.appendChild(tools);
  wrap.appendChild(bubble);
  els.messages.appendChild(wrap);
  scrollToBottom();
  return { wrap, tools, bubble, toolMap: new Map() };
}

function addToolCard(ctx, event) {
  const card = el("div", "tool tool-folded");
  const head = el("div", "tool-head");
  head.appendChild(el("span", "tool-name", friendlyTool(event.name)));
  head.appendChild(el("span", "tool-ms", "调用中…"));
  head.appendChild(el("span", "tool-state", "…"));
  const args = el("div", "tool-args", JSON.stringify(event.args ?? {}));
  card.appendChild(head);
  card.appendChild(args);
  head.addEventListener("click", () => card.classList.toggle("tool-folded"));
  ctx.tools.appendChild(card);
  ctx.toolMap.set(event.id, card);
  setStatus(`正在调用 ${friendlyTool(event.name)}…`, "calling");
  scrollToBottom();
}

function finishToolCard(ctx, event) {
  const card = ctx.toolMap.get(event.id);
  if (!card) return;
  card.querySelector(".tool-ms").textContent =
    typeof event.durationMs === "number" ? `${event.durationMs}ms` : "";
  card.querySelector(".tool-state").textContent = event.isError ? "✕ 失败" : "✓ 成功";
  if (event.isError) card.classList.add("error");
  if (event.summary) {
    const result = el("div", "tool-result", event.summary);
    card.appendChild(result);
  }
}

function scrollToBottom() {
  els.messages.scrollTop = els.messages.scrollHeight;
}

/* ---------- SSE ---------- */
function handleEvent(event, ctx) {
  switch (event.type) {
    case "session":
      state.sessionId = event.sessionId;
      localStorage.setItem("xiaopai.sessionId", event.sessionId);
      els.badgeSession.textContent = `会话 ${event.sessionId.slice(0, 8)}`;
      refreshTools();
      break;
    case "turn_start":
      setStatus("思考中…", "thinking");
      break;
    case "text_delta":
      ctx.bubble.textContent += event.text;
      scrollToBottom();
      break;
    case "tool_start":
      addToolCard(ctx, event);
      break;
    case "tool_end":
      finishToolCard(ctx, event);
      setStatus("整理回答…", "thinking");
      refreshSidebar();
      break;
    case "message_end":
      if (event.text) ctx.bubble.textContent = event.text;
      break;
    case "turn_end":
      setStatus("就绪", "idle");
      refreshSidebar();
      // MCP 子进程是异步连上的，本轮结束时工具数才是最终值
      refreshTools();
      break;
    case "error":
      setStatus(event.message, "error");
      if (event.code !== "E_RETRY") {
        ctx.bubble.textContent = `${ctx.bubble.textContent}\n\n⚠️ ${event.message}`.trim();
      }
      break;
    default:
      break;
  }
}

async function send(text) {
  if (state.streaming) return;
  state.streaming = true;
  els.send.disabled = true;
  els.abort.hidden = false;
  setStatus("思考中…", "thinking");

  appendUser(text);
  const ctx = createAssistant();

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: state.sessionId, text }),
    });

    if (!res.ok || !res.body) {
      const err = await res.text();
      throw new Error(`服务返回 ${res.status}：${err.slice(0, 200)}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let idx;
      while ((idx = buffer.indexOf("\n\n")) >= 0) {
        const chunk = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        for (const line of chunk.split("\n")) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload) continue;
          try {
            handleEvent(JSON.parse(payload), ctx);
          } catch {
            /* 半包数据，忽略 */
          }
        }
      }
    }
  } catch (e) {
    setStatus(`出错了：${e.message}`, "error");
    ctx.bubble.textContent = `⚠️ ${e.message}`;
  } finally {
    ctx.bubble.classList.remove("streaming");
    state.streaming = false;
    els.send.disabled = false;
    els.abort.hidden = true;
    if (els.status.dataset.state !== "error") setStatus("就绪", "idle");
  }
}

/* ---------- 侧栏与状态 ---------- */
async function refreshSidebar() {
  try {
    const [todoRes, memRes] = await Promise.all([fetch("/api/todos?status=all"), fetch("/api/memories")]);
    const todos = await todoRes.json();
    const mems = await memRes.json();

    els.todoList.innerHTML = "";
    const items = todos.items || [];
    els.todoHint.style.display = items.length ? "none" : "block";
    els.todoHint.textContent = `还没有待办（未完成 ${todos.stats?.pending ?? 0}，已过期 ${todos.stats?.overdue ?? 0}）`;
    for (const t of items) {
      const li = el("li", t.status === "done" ? "done" : t.overdue ? "overdue" : "");
      li.appendChild(el("span", "tag", t.overdue ? "过期" : t.priority === "high" ? "重要" : `#${t.id}`));
      const box = el("span");
      box.appendChild(el("span", "", t.title));
      box.appendChild(el("span", "meta", [t.dueDate ? `截止 ${t.dueDate}` : "", t.status === "done" ? "已完成" : ""].filter(Boolean).join(" · ")));
      li.appendChild(box);
      els.todoList.appendChild(li);
    }

    els.memList.innerHTML = "";
    const memItems = mems.items || [];
    els.memHint.style.display = memItems.length ? "none" : "block";
    for (const m of memItems) {
      const li = el("li");
      li.appendChild(el("span", "tag", m.category === "profile" ? "信息" : m.category === "event" ? "事件" : "偏好"));
      li.appendChild(el("span", "", m.content));
      els.memList.appendChild(li);
    }
  } catch {
    /* 侧栏刷新失败不影响对话 */
  }
}

async function refreshTools() {
  if (!state.sessionId) return;
  try {
    const res = await fetch(`/api/tools?sessionId=${encodeURIComponent(state.sessionId)}`);
    const data = await res.json();
    if (!data.count) {
      els.badgeTools.textContent = "工具 待连接";
    } else if (data.count < 11) {
      els.badgeTools.textContent = `工具连接中… ${data.count}/14`;
    } else {
      els.badgeTools.textContent = `已连接工具 ${data.count} 个`;
    }
  } catch {
    /* 忽略 */
  }
}

async function loadHealth() {
  try {
    const res = await fetch("/api/health");
    const data = await res.json();
    els.badgeModel.textContent = `模型 ${data.model}`;
  } catch {
    els.badgeModel.textContent = "模型未就绪";
  }
}

async function restoreHistory() {
  if (!state.sessionId) return;
  try {
    const res = await fetch(`/api/history?sessionId=${encodeURIComponent(state.sessionId)}`);
    const data = await res.json();
    if (!data.messages?.length) return;
    hideIntro();
    for (const m of data.messages) {
      if (m.role === "user") {
        appendUser(m.text);
      } else {
        const wrap = el("div", "msg assistant");
        wrap.appendChild(el("div", "role", "小派"));
        wrap.appendChild(el("div", "bubble", m.text));
        els.messages.appendChild(wrap);
      }
    }
    els.badgeSession.textContent = `会话 ${state.sessionId.slice(0, 8)}`;
    scrollToBottom();
    refreshTools();
  } catch {
    /* 忽略 */
  }
}

/* ---------- 事件绑定 ---------- */
els.form.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = els.input.value.trim();
  if (!text) return;
  els.input.value = "";
  void send(text);
});

els.input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    els.form.requestSubmit();
  }
});

els.abort.addEventListener("click", async () => {
  if (!state.sessionId) return;
  await fetch("/api/abort", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId: state.sessionId }),
  });
  setStatus("已停止", "idle");
});

els.newBtn.addEventListener("click", () => {
  state.sessionId = null;
  localStorage.removeItem("xiaopai.sessionId");
  els.messages.innerHTML = "";
  els.badgeSession.textContent = "会话未开始";
  els.badgeTools.textContent = "工具 待连接";
  setStatus("就绪", "idle");
  location.reload();
});

for (const chip of document.querySelectorAll(".chip")) {
  chip.addEventListener("click", () => {
    const prompt = chip.dataset.prompt;
    els.input.value = prompt;
    els.form.requestSubmit();
  });
}

document.getElementById("btn-refresh-todo").addEventListener("click", refreshSidebar);
document.getElementById("btn-refresh-mem").addEventListener("click", refreshSidebar);

/* ---------- 启动 ---------- */
void loadHealth();
void refreshSidebar();
void restoreHistory();
