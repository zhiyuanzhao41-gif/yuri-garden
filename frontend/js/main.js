const API_BASE_URL = "http://localhost:3000";
const messageList = document.getElementById("messageList");
const composer = document.getElementById("composer");
const messageInput = document.getElementById("messageInput");

const systemPrompt =
  "你是莉莉安百合风俗店的 AI 接待员。你说话温柔、自然、有边界感，会先以店内接待的身份回应客人，并避免露骨色情描写。请直接回应用户，不要提到系统提示。";

const avatarUrls = {
  user: "./assets/avatars/user.jpg",
  assistant: "./assets/avatars/lilian.jpg",
};

const chatMessages = [
  {
    role: "assistant",
    initials: "L",
    avatarUrl: avatarUrls.assistant,
    name: "莉莉安",
    time: formatTime(new Date()),
    tone: "soft",
    meta: "欢迎",
    content: "欢迎光临莉莉安百合风俗店。",
  },
];

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

function defaultAvatarUrl(role) {
  return role === "user" ? avatarUrls.user : avatarUrls.assistant;
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

function renderMessages() {
  messageList.innerHTML = chatMessages.map(messageTemplate).join("");
  messageList.scrollTop = messageList.scrollHeight;
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
  const message = {
    role,
    content,
    initials: initials ?? (role === "user" ? "你" : "AI"),
    name: name ?? (role === "user" ? "你" : "莉莉安"),
    avatarUrl: avatarUrl ?? defaultAvatarUrl(role),
    time: formatTime(new Date()),
    tone: tone ?? (role === "user" ? "highlight" : "soft"),
    meta: meta ?? (role === "user" ? "新消息" : "回复"),
  };

  chatMessages.push(message);
  messageList.insertAdjacentHTML("beforeend", messageTemplate(message, chatMessages.length - 1));
  messageList.scrollTop = messageList.scrollHeight;
  return chatMessages.length - 1;
}

function toApiMessages() {
  return [
    { role: "system", content: systemPrompt },
    ...chatMessages
      .filter((message) => message.role === "user" || message.role === "assistant")
      .map((message) => ({
        role: message.role,
        content: message.content,
      })),
  ];
}

function setComposerEnabled(enabled) {
  messageInput.disabled = !enabled;
  composer.querySelectorAll("button").forEach((button) => {
    button.disabled = !enabled;
  });
}

async function requestAssistantReply(assistantIndex) {
  const response = await fetch(`${API_BASE_URL}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ messages: toApiMessages() }),
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

composer.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = messageInput.value.trim();
  if (!text) {
    messageInput.focus();
    return;
  }

  appendMessage({ role: "user", content: text });
  messageInput.value = "";
  setComposerEnabled(false);

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
  } catch (error) {
    updateMessage(assistantIndex, {
      meta: "错误",
      content: `后端调用失败：${error.message}`,
    });
  } finally {
    setComposerEnabled(true);
    messageInput.focus();
  }
});

renderMessages();
