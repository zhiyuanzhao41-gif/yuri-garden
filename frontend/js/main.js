const messageList = document.getElementById("messageList");
const composer = document.getElementById("composer");
const messageInput = document.getElementById("messageInput");

const seedMessages = [
  {
    initials: "Z",
    name: "zzY",
    time: "2026-06-26 16:28",
    tone: "highlight",
    meta: "#317",
    text: "欢迎进入接待台。先把界面调顺眼，再开始聊具体内容。",
  },
  {
    initials: "L",
    name: "莉莉安",
    time: "2026-06-26 16:29",
    tone: "soft",
    meta: "在线",
    text: "我已经把夜间模式、消息流和输入栏都放好了。你可以直接输入消息，或者点工具栏做些切换。",
  },
  {
    initials: "A",
    name: "AI 助手",
    time: "2026-06-26 16:30",
    tone: "",
    meta: "系统",
    text: "如果你想，我也可以继续帮你补侧栏、状态栏、历史记录和对话模板。",
  },
];

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function messageTemplate(message) {
  return `
    <article class="message" data-tone="${escapeHtml(message.tone)}">
      <div class="avatar-wrap">
        <div class="avatar" data-initials="${escapeHtml(message.initials)}" aria-hidden="true"></div>
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
        <p class="bubble-text">${escapeHtml(message.text)}</p>
        <div class="bubble-actions" aria-label="消息操作">
          <button type="button" aria-label="复制消息">⧉</button>
          <button type="button" aria-label="编辑消息">✎</button>
        </div>
      </div>
    </article>
  `;
}

function renderMessages() {
  messageList.innerHTML = seedMessages.map(messageTemplate).join("");
  messageList.scrollTop = messageList.scrollHeight;
}

function appendMessage(text, name = "你", initials = "你", tone = "highlight") {
  const now = new Date();
  const time = now.toLocaleString("zh-CN", {
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).replaceAll("/", "-");

  const message = {
    initials,
    name,
    time,
    tone,
    meta: tone === "soft" ? "回复" : "新消息",
    text,
  };

  messageList.insertAdjacentHTML("beforeend", messageTemplate(message));
  messageList.scrollTop = messageList.scrollHeight;
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
      messageInput.value = "/ 生成一段更柔和的欢迎语";
      messageInput.focus();
    }
  });
});

composer.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = messageInput.value.trim();
  if (!text) {
    messageInput.focus();
    return;
  }

  appendMessage(text);
  messageInput.value = "";
  messageInput.focus();
});

renderMessages();
