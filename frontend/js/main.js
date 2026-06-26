const API_BASE_URL = window.location.origin;
const messageList = document.getElementById("messageList");
const composer = document.getElementById("composer");
const messageInput = document.getElementById("messageInput");
const conversationList = document.getElementById("conversationList");
const newConversationButton = document.getElementById("newConversationButton");

const avatarUrls = {
  user: "./assets/avatars/user.jpg",
  assistant: "./assets/avatars/lilian.jpg",
};

let currentConversationId = null;
let conversations = [];
let chatMessages = [];
let isBusy = false;

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatTime(date) {
  return date
    .toLocaleString("zh-CN", {
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
    .replaceAll("/", "-");
}

function formatHistoryTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "刚刚" : formatTime(date);
}

function defaultAvatarUrl(role) {
  return role === "user" ? avatarUrls.user : avatarUrls.assistant;
}

function decorateMessage(message) {
  const role = message?.role === "user" ? "user" : "assistant";

  return {
    role,
    content: typeof message?.content === "string" ? message.content : "",
    initials: message?.initials ?? (role === "user" ? "你" : "AI"),
    name: message?.name ?? (role === "user" ? "zzy" : "丰川祥子"),
    avatarUrl: message?.avatarUrl ?? defaultAvatarUrl(role),
    time: message?.time ?? formatTime(new Date()),
    tone: message?.tone ?? (role === "user" ? "highlight" : "soft"),
    meta: message?.meta ?? (role === "user" ? "新消息" : "回复"),
  };
}

function avatarTemplate(message) {
  const avatarUrl = message.avatarUrl || defaultAvatarUrl(message.role);
  const image = avatarUrl
    ? `<img class="avatar-image" src="${escapeHtml(avatarUrl)}" alt="" onerror="this.parentElement.dataset.hasImage='false'; this.remove();">`
    : "";

  return `<div class="avatar" data-initials="${escapeHtml(message.initials || "")}" data-has-image="${avatarUrl ? "true" : "false"}" aria-hidden="true">${image}</div>`;
}

function messageTemplate(message, index) {
  return `
    <article class="message" data-tone="${escapeHtml(message.tone)}" data-index="${index}">
      <div class="avatar-wrap">
        ${avatarTemplate(message)}
        <div class="meta">
          <strong>${escapeHtml(message.meta)}</strong>
          ${escapeHtml(message.time)}
        </div>
      </div>
      <div class="bubble">
        <div class="bubble-head">
          <span class="name">${escapeHtml(message.name)}</span>
          <span class="time">${escapeHtml(message.time)}</span>
        </div>
        <p class="bubble-text">${escapeHtml(message.content || "正在输入...")}</p>
        <div class="bubble-actions" aria-label="消息操作">
          <button type="button" aria-label="复制消息">C</button>
          <button type="button" aria-label="编辑消息">E</button>
        </div>
      </div>
    </article>
  `;
}

function historyItemTemplate(conversation) {
  return `
    <button
      class="history-item"
      type="button"
      data-id="${escapeHtml(conversation.id)}"
      aria-current="${conversation.id === currentConversationId ? "true" : "false"}"
      ${isBusy ? "disabled" : ""}
    >
      <span class="history-title">${escapeHtml(conversation.title || "新会话")}</span>
      <span class="history-preview">${escapeHtml(conversation.preview || "还没有开始对话")}</span>
      <span class="history-meta">${escapeHtml(formatHistoryTime(conversation.updatedAt))} · ${conversation.messageCount || 0} 条消息</span>
    </button>
  `;
}

function renderMessages() {
  messageList.innerHTML = chatMessages.map(messageTemplate).join("");
  messageList.scrollTop = messageList.scrollHeight;
}

function renderConversations() {
  if (!conversations.length) {
    conversationList.innerHTML = '<p class="history-empty">暂无会话</p>';
    return;
  }

  conversationList.innerHTML = conversations.map(historyItemTemplate).join("");
}

function updateMessage(index, patch) {
  chatMessages[index] = { ...chatMessages[index], ...patch };
  const element = messageList.querySelector(`[data-index="${index}"]`);

  if (!element) {
    renderMessages();
    return;
  }

  const text = element.querySelector(".bubble-text");
  const meta = element.querySelector(".meta strong");
  if (text) text.textContent = chatMessages[index].content || "正在输入...";
  if (meta) meta.textContent = chatMessages[index].meta;
  messageList.scrollTop = messageList.scrollHeight;
}

function appendMessage({ role, content, meta, tone, name, initials, avatarUrl }) {
  const message = decorateMessage({
    role,
    content,
    initials,
    name,
    avatarUrl,
    tone,
    meta,
    time: formatTime(new Date()),
  });

  chatMessages.push(message);
  messageList.insertAdjacentHTML("beforeend", messageTemplate(message, chatMessages.length - 1));
  messageList.scrollTop = messageList.scrollHeight;
  return chatMessages.length - 1;
}

function toConversationMessages() {
  return chatMessages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => ({
      role: message.role,
      content: message.content,
      time: message.time,
      meta: message.meta,
    }));
}

function setComposerEnabled(enabled) {
  messageInput.disabled = !enabled;
  composer.querySelectorAll("button").forEach((button) => {
    button.disabled = !enabled;
  });
}

function setBusy(busy) {
  isBusy = busy;
  setComposerEnabled(!busy && Boolean(currentConversationId));
  if (newConversationButton) newConversationButton.disabled = busy;
  conversationList.querySelectorAll(".history-item").forEach((button) => {
    button.disabled = busy;
  });
}

async function fetchJson(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, options);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || `请求失败：${response.status}`);
  }

  return data;
}

async function refreshConversations() {
  const data = await fetchJson("/api/conversations");
  conversations = data.conversations || [];
  renderConversations();
}

function applyConversation(conversation) {
  currentConversationId = conversation.id;
  chatMessages = (conversation.messages || []).map(decorateMessage);
  renderMessages();
  renderConversations();
}

async function loadConversation(conversationId) {
  setBusy(true);

  try {
    const data = await fetchJson(`/api/conversations/${encodeURIComponent(conversationId)}`);
    applyConversation(data.conversation);
  } finally {
    setBusy(false);
  }
}

async function createConversation() {
  setBusy(true);

  try {
    const data = await fetchJson("/api/conversations", { method: "POST" });
    applyConversation(data.conversation);
    await refreshConversations();
  } finally {
    setBusy(false);
  }
}

async function bootConversations() {
  setBusy(true);

  try {
    await refreshConversations();

    if (conversations.length > 0) {
      const data = await fetchJson(`/api/conversations/${encodeURIComponent(conversations[0].id)}`);
      applyConversation(data.conversation);
      return;
    }

    const data = await fetchJson("/api/conversations", { method: "POST" });
    applyConversation(data.conversation);
    await refreshConversations();
  } catch (error) {
    currentConversationId = null;
    conversations = [];
    chatMessages = [
      decorateMessage({
        role: "assistant",
        meta: "错误",
        content: `历史服务连接失败：${error.message}`,
      }),
    ];
    renderConversations();
    renderMessages();
  } finally {
    setBusy(false);
  }
}

async function requestAssistantReply(assistantIndex) {
  if (!currentConversationId) {
    throw new Error("当前没有可保存的会话");
  }

  const response = await fetch(`${API_BASE_URL}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      conversationId: currentConversationId,
      messages: toConversationMessages(),
    }),
  });

  if (!response.ok || !response.body) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || `请求失败：${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let reply = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";

    for (const event of events) {
      const line = event.split("\n").find((item) => item.startsWith("data:"));
      if (!line) continue;

      const payload = line.slice(5).trim();
      if (payload === "[DONE]") return;

      const data = JSON.parse(payload);
      if (data.error) throw new Error(data.error);
      if (data.content) {
        reply += data.content;
        updateMessage(assistantIndex, { content: reply, meta: "生成中" });
      }
    }
  }
}

document.querySelectorAll(".tool-btn, .mini-btn").forEach((button) => {
  button.addEventListener("click", () => {
    const action = button.dataset.action || "action";
    button.animate(
      [
        { transform: "translateY(0)" },
        { transform: "translateY(-2px)" },
        { transform: "translateY(0)" },
      ],
      { duration: 220, easing: "ease-out" }
    );

    if (action === "prompt") {
      messageInput.value = "请用温柔自然的语气回复我。";
      messageInput.focus();
    }
  });
});

conversationList.addEventListener("click", async (event) => {
  const item = event.target.closest(".history-item");
  if (!item || item.disabled || item.dataset.id === currentConversationId) return;

  try {
    await loadConversation(item.dataset.id);
  } catch (error) {
    chatMessages = [
      decorateMessage({
        role: "assistant",
        meta: "错误",
        content: `读取历史会话失败：${error.message}`,
      }),
    ];
    renderMessages();
  }
});

newConversationButton.addEventListener("click", async () => {
  try {
    await createConversation();
    messageInput.focus();
  } catch (error) {
    chatMessages = [
      decorateMessage({
        role: "assistant",
        meta: "错误",
        content: `新建会话失败：${error.message}`,
      }),
    ];
    renderMessages();
  }
});

composer.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = messageInput.value.trim();
  if (!text) {
    messageInput.focus();
    return;
  }

  appendMessage({ role: "user", content: text });
  messageInput.value = "";
  setBusy(true);

  const assistantIndex = appendMessage({
    role: "assistant",
    content: "",
    meta: "连接中",
  });

  try {
    await requestAssistantReply(assistantIndex);
    updateMessage(assistantIndex, {
      meta: chatMessages[assistantIndex].content ? "回复" : "空回复",
    });
    await refreshConversations();
  } catch (error) {
    updateMessage(assistantIndex, {
      meta: "错误",
      content: `后端调用失败：${error.message}`,
    });
  } finally {
    setBusy(false);
    messageInput.focus();
  }
});

bootConversations();
