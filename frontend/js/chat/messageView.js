import { assetUrl } from "../app/api.js";
import { escapeHtml } from "../app/html.js";
import { formatTime } from "../app/time.js";
import { avatarUrls } from "./state.js";

function defaultAvatarUrl(appState, role) {
  return role === "user" ? avatarUrls.user : assetUrl(appState.activeCharacter.assets?.avatar);
}

export function decorateMessage(appState, message) {
  const role = message?.role === "user" ? "user" : "assistant";

  return {
    role,
    content: typeof message?.content === "string" ? message.content : "",
    initials:
      message?.initials ??
      (role === "user" ? "你" : appState.activeCharacter.initials || "AI"),
    name: message?.name ?? (role === "user" ? "zzy" : appState.activeCharacter.name),
    avatarUrl: message?.avatarUrl ?? defaultAvatarUrl(appState, role),
    time: message?.time ?? formatTime(new Date()),
    tone: message?.tone ?? (role === "user" ? "highlight" : "soft"),
    meta: message?.meta ?? (role === "user" ? "新消息" : "回复"),
  };
}

function avatarTemplate(appState, message) {
  const avatarUrl = message.avatarUrl || defaultAvatarUrl(appState, message.role);
  const image = avatarUrl
    ? `<img class="avatar-image" src="${escapeHtml(avatarUrl)}" alt="" onerror="this.parentElement.dataset.hasImage='false'; this.remove();">`
    : "";

  return `<div class="avatar" data-initials="${escapeHtml(message.initials || "")}" data-has-image="${avatarUrl ? "true" : "false"}" aria-hidden="true">${image}</div>`;
}

export function findRoundUserIndex(appState, assistantIndex) {
  if (appState.chatMessages[assistantIndex]?.role !== "assistant") return -1;

  for (let index = assistantIndex - 1; index >= 0; index -= 1) {
    if (appState.chatMessages[index]?.role === "user") return index;
  }

  return -1;
}

export function roundStartIndex(appState, assistantIndex) {
  const userIndex = findRoundUserIndex(appState, assistantIndex);
  return userIndex >= 0 ? userIndex : assistantIndex;
}

function assistantActionsTemplate(appState, index) {
  const canResend = findRoundUserIndex(appState, index) >= 0;
  const disabled = appState.isBusy ? "disabled" : "";
  const resendDisabled = !canResend || appState.isBusy ? "disabled" : "";

  return `
        <div class="bubble-actions" aria-label="消息操作">
          <button class="message-action" type="button" data-message-action="delete-round" data-index="${index}" aria-label="删除这一轮及之后的消息" title="删除" ${disabled}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 7h12M10 7V5.5A1.5 1.5 0 0 1 11.5 4h1A1.5 1.5 0 0 1 14 5.5V7m-6 0 .7 11.1A1.4 1.4 0 0 0 10.1 19h3.8a1.4 1.4 0 0 0 1.4-1.3L16 7M9.5 10.5v5M14.5 10.5v5"/>
            </svg>
          </button>
          <button class="message-action" type="button" data-message-action="resend-round" data-index="${index}" aria-label="重新发送本轮用户消息" title="${canResend ? "重新发送" : "没有可重新发送的用户消息"}" ${resendDisabled}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 12a8 8 0 0 1 13.7-5.6L20 8M20 4v4h-4M20 12a8 8 0 0 1-13.7 5.6L4 16M4 20v-4h4"/>
            </svg>
          </button>
        </div>
  `;
}

function messageTemplate(appState, message, index) {
  return `
    <article class="message" data-role="${escapeHtml(message.role)}" data-tone="${escapeHtml(message.tone)}" data-index="${index}">
      <div class="avatar-wrap">
        ${avatarTemplate(appState, message)}
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
        ${message.role === "assistant" ? assistantActionsTemplate(appState, index) : ""}
      </div>
    </article>
  `;
}

export function renderMessages(elements, appState) {
  elements.messageList.innerHTML = appState.chatMessages
    .map((message, index) => messageTemplate(appState, message, index))
    .join("");
  elements.messageList.scrollTop = elements.messageList.scrollHeight;
}

export function updateMessage(elements, appState, index, patch) {
  appState.chatMessages[index] = { ...appState.chatMessages[index], ...patch };
  const element = elements.messageList.querySelector(`[data-index="${index}"]`);

  if (!element) {
    renderMessages(elements, appState);
    return;
  }

  const text = element.querySelector(".bubble-text");
  const meta = element.querySelector(".meta strong");
  if (text) text.textContent = appState.chatMessages[index].content || "正在输入...";
  if (meta) meta.textContent = appState.chatMessages[index].meta;
  elements.messageList.scrollTop = elements.messageList.scrollHeight;
}

export function appendMessage(elements, appState, { role, content, meta, tone, name, initials, avatarUrl }) {
  const message = decorateMessage(appState, {
    role,
    content,
    initials,
    name,
    avatarUrl,
    tone,
    meta,
    time: formatTime(new Date()),
  });

  appState.chatMessages.push(message);
  elements.messageList.insertAdjacentHTML(
    "beforeend",
    messageTemplate(appState, message, appState.chatMessages.length - 1),
  );
  elements.messageList.scrollTop = elements.messageList.scrollHeight;
  return appState.chatMessages.length - 1;
}

export function toConversationMessages(appState) {
  return appState.chatMessages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => ({
      role: message.role,
      content: message.content,
      time: message.time,
      meta: message.meta,
    }));
}
