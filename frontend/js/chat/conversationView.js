import { escapeHtml } from "../app/html.js";
import { formatHistoryTime } from "../app/time.js";

function historyItemTemplate(appState, conversation) {
  const isMenuOpen = conversation.id === appState.openConversationMenuId;

  return `
    <div
      class="history-item"
      data-id="${escapeHtml(conversation.id)}"
      aria-current="${conversation.id === appState.currentConversationId ? "true" : "false"}"
    >
      <button class="history-open" type="button" ${appState.isBusy ? "disabled" : ""}>
        <span class="history-copy">
          <span class="history-title">${escapeHtml(conversation.title || "新会话")}</span>
          <span class="history-preview">${escapeHtml(conversation.preview || "还没有开始对话")}</span>
          <span class="history-meta">${escapeHtml(formatHistoryTime(conversation.updatedAt))} · ${conversation.messageCount || 0} 条消息</span>
        </span>
      </button>
      <button
        class="history-menu-toggle"
        type="button"
        aria-label="打开会话操作"
        aria-expanded="${isMenuOpen ? "true" : "false"}"
        ${appState.isBusy ? "disabled" : ""}
      >
        <span aria-hidden="true"></span>
      </button>
      <div class="history-menu" ${isMenuOpen ? "" : "hidden"}>
        <button class="history-delete" type="button" ${appState.isBusy ? "disabled" : ""}>删除</button>
      </div>
    </div>
  `;
}

export function renderConversations(elements, appState) {
  if (!appState.conversations.length) {
    appState.openConversationMenuId = null;
    elements.conversationList.innerHTML = '<p class="history-empty">暂无会话</p>';
    return;
  }

  if (
    !appState.conversations.some(
      (conversation) => conversation.id === appState.openConversationMenuId,
    )
  ) {
    appState.openConversationMenuId = null;
  }

  elements.conversationList.innerHTML = appState.conversations
    .map((conversation) => historyItemTemplate(appState, conversation))
    .join("");
}

export function getConversationById(appState, id) {
  return appState.conversations.find((conversation) => conversation.id === id);
}
