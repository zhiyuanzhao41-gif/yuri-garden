import { fallbackCharacter, state } from "./chat/state.js";
import { getCurrentUser, loginRedirectUrl } from "./app/auth.js";
import {
  createConversationRequest,
  deleteConversationRequest,
  fetchCharacter,
  fetchConversation,
  fetchConversationSummaries,
  saveConversationMessages,
} from "./chat/conversationApi.js";
import {
  appendMessage,
  decorateMessage,
  findRoundUserIndex,
  renderMessages,
  roundStartIndex,
  updateMessage,
} from "./chat/messageView.js";
import { getConversationById, renderConversations } from "./chat/conversationView.js";
import { requestAssistantReply } from "./chat/streamChat.js";

const elements = {
  messageList: document.getElementById("messageList"),
  composer: document.getElementById("composer"),
  messageInput: document.getElementById("messageInput"),
  conversationList: document.getElementById("conversationList"),
  newConversationButton: document.getElementById("newConversationButton"),
  characterNoticeName: document.getElementById("characterNoticeName"),
  characterNoticeInformation: document.getElementById("characterNoticeInformation"),
};

function getRequestedCharacterId() {
  const params = new URLSearchParams(window.location.search);
  return params.get("character") || fallbackCharacter.id;
}

function redirectToLogin() {
  window.location.replace(loginRedirectUrl(getRequestedCharacterId()));
}

async function loadActiveCharacter() {
  const characterId = getRequestedCharacterId();

  try {
    state.activeCharacter = (await fetchCharacter(characterId)) || fallbackCharacter;
  } catch (error) {
    state.activeCharacter = fallbackCharacter;
  }

  renderCharacterNotice();
}

function renderCharacterNotice() {
  if (elements.characterNoticeName) {
    elements.characterNoticeName.textContent = state.activeCharacter.name || "角色资料";
  }

  if (elements.characterNoticeInformation) {
    elements.characterNoticeInformation.textContent =
      state.activeCharacter.information || "暂未填写角色核心个人信息。";
  }
}

function renderAllConversations() {
  renderConversations(elements, state);
}

function renderAllMessages() {
  renderMessages(elements, state);
}

function setComposerEnabled(enabled) {
  elements.messageInput.disabled = !enabled;
  elements.composer.querySelectorAll("button").forEach((button) => {
    button.disabled = !enabled;
  });
}

function setBusy(busy) {
  state.isBusy = busy;
  if (busy) {
    state.openConversationMenuId = null;
  }
  setComposerEnabled(!busy && Boolean(state.currentConversationId));
  if (elements.newConversationButton) elements.newConversationButton.disabled = busy;
  elements.conversationList.querySelectorAll(".history-item button").forEach((button) => {
    button.disabled = busy;
  });
  elements.messageList.querySelectorAll(".message-action").forEach((button) => {
    const cannotResend =
      button.dataset.messageAction === "resend-round" &&
      findRoundUserIndex(state, Number(button.dataset.index)) < 0;
    button.disabled = busy || cannotResend;
  });
}

async function refreshConversations() {
  state.conversations = await fetchConversationSummaries(state.activeCharacter.id);
  renderAllConversations();
}

function applyConversation(conversation) {
  state.openConversationMenuId = null;
  state.currentConversationId = conversation.id;
  state.chatMessages = (conversation.messages || []).map((message) => decorateMessage(state, message));
  renderAllMessages();
  renderAllConversations();
}

async function loadConversation(conversationId) {
  setBusy(true);

  try {
    applyConversation(await fetchConversation(conversationId, state.activeCharacter.id));
  } finally {
    setBusy(false);
  }
}

async function createConversation() {
  setBusy(true);

  try {
    const data = await createConversationRequest(state.activeCharacter.id);
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

    if (state.conversations.length > 0) {
      applyConversation(
        await fetchConversation(state.conversations[0].id, state.activeCharacter.id),
      );
      return;
    }

    const data = await createConversationRequest(state.activeCharacter.id);
    applyConversation(data.conversation);
    await refreshConversations();
  } catch (error) {
    state.currentConversationId = null;
    state.conversations = [];
    state.chatMessages = [
      decorateMessage(state, {
        role: "assistant",
        meta: "错误",
        content: `历史服务连接失败：${error.message}`,
      }),
    ];
    renderAllConversations();
    renderAllMessages();
  } finally {
    setBusy(false);
  }
}

async function deleteConversation(conversationId) {
  if (!conversationId || state.isBusy) return;

  const conversation = getConversationById(state, conversationId);
  const title = conversation?.title || "该会话";
  const confirmed = window.confirm(`确定删除“${title}”吗？`);
  if (!confirmed) return;

  setBusy(true);

  try {
    await deleteConversationRequest(conversationId, state.activeCharacter.id);

    state.conversations = state.conversations.filter((item) => item.id !== conversationId);
    if (state.openConversationMenuId === conversationId) {
      state.openConversationMenuId = null;
    }

    if (state.currentConversationId === conversationId) {
      state.currentConversationId = null;
      state.chatMessages = [];
      renderAllMessages();

      if (state.conversations.length > 0) {
        const nextConversation = state.conversations[0];
        applyConversation(await fetchConversation(nextConversation.id, state.activeCharacter.id));
      } else {
        const data = await createConversationRequest(state.activeCharacter.id);
        applyConversation(data.conversation);
      }
    }

    await refreshConversations();
  } catch (error) {
    state.chatMessages = [
      decorateMessage(state, {
        role: "assistant",
        meta: "错误",
        content: `删除会话失败：${error.message}`,
      }),
    ];
    renderAllMessages();
  } finally {
    setBusy(false);
  }
}

function updateAssistantReply(assistantIndex, reply) {
  updateMessage(elements, state, assistantIndex, { content: reply, meta: "生成中" });
}

async function deleteRoundFromAssistant(assistantIndex) {
  if (state.isBusy || state.chatMessages[assistantIndex]?.role !== "assistant") return;

  const previousMessages = state.chatMessages;
  state.chatMessages = state.chatMessages.slice(0, roundStartIndex(state, assistantIndex));
  setBusy(true);
  renderAllMessages();

  try {
    await saveConversationMessages(state);
    await refreshConversations();
  } catch (error) {
    state.chatMessages = previousMessages;
    renderAllMessages();
    appendMessage(elements, state, {
      role: "assistant",
      meta: "错误",
      content: `删除消息失败：${error.message}`,
    });
  } finally {
    setBusy(false);
    elements.messageInput.focus();
  }
}

async function resendRoundFromAssistant(assistantIndex) {
  if (state.isBusy || state.chatMessages[assistantIndex]?.role !== "assistant") return;

  const userIndex = findRoundUserIndex(state, assistantIndex);
  const userMessage = state.chatMessages[userIndex];
  if (!userMessage?.content.trim()) return;

  setBusy(true);
  state.chatMessages = state.chatMessages.slice(0, userIndex);
  renderAllMessages();
  appendMessage(elements, state, { role: "user", content: userMessage.content });

  const nextAssistantIndex = appendMessage(elements, state, {
    role: "assistant",
    content: "",
    meta: "连接中",
  });

  try {
    await requestAssistantReply(state, nextAssistantIndex, updateAssistantReply);
    updateMessage(elements, state, nextAssistantIndex, {
      meta: state.chatMessages[nextAssistantIndex].content ? "回复" : "空回复",
    });
    await refreshConversations();
  } catch (error) {
    updateMessage(elements, state, nextAssistantIndex, {
      meta: "错误",
      content: `后端调用失败：${error.message}`,
    });
  } finally {
    setBusy(false);
    elements.messageInput.focus();
  }
}

function bindToolbar() {
  document.querySelectorAll(".tool-btn, .mini-btn").forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.dataset.action || "action";
      button.animate(
        [
          { transform: "translateY(0)" },
          { transform: "translateY(-2px)" },
          { transform: "translateY(0)" },
        ],
        { duration: 220, easing: "ease-out" },
      );

      if (action === "prompt") {
        elements.messageInput.value = "请用温柔自然的语气回复我。";
        elements.messageInput.focus();
      }
    });
  });
}

function bindConversationList() {
  elements.conversationList.addEventListener("click", async (event) => {
    const menuToggle = event.target.closest(".history-menu-toggle");
    if (menuToggle) {
      event.stopPropagation();
      const item = menuToggle.closest(".history-item");
      state.openConversationMenuId =
        state.openConversationMenuId === item?.dataset.id ? null : item?.dataset.id;
      renderAllConversations();
      return;
    }

    const deleteButton = event.target.closest(".history-delete");
    if (deleteButton) {
      event.stopPropagation();
      const item = deleteButton.closest(".history-item");
      await deleteConversation(item?.dataset.id);
      return;
    }

    const item = event.target.closest(".history-item");
    if (!item || item.dataset.id === state.currentConversationId) return;

    const openButton = event.target.closest(".history-open");
    if (!openButton) return;

    if (state.suppressNextConversationClickId === item.dataset.id) {
      state.suppressNextConversationClickId = null;
      return;
    }

    state.openConversationMenuId = null;

    try {
      await loadConversation(item.dataset.id);
    } catch (error) {
      state.chatMessages = [
        decorateMessage(state, {
          role: "assistant",
          meta: "错误",
          content: `读取历史会话失败：${error.message}`,
        }),
      ];
      renderAllMessages();
    }
  });

  elements.conversationList.addEventListener("pointerdown", (event) => {
    const item = event.target.closest(".history-item");
    if (
      !item ||
      event.pointerType !== "touch" ||
      event.target.closest(".history-delete, .history-menu-toggle, .history-menu")
    ) {
      return;
    }

    state.conversationPressTarget = item;
    state.conversationPressTriggered = false;
    state.conversationPressStartX = event.clientX;
    state.conversationPressStartY = event.clientY;
    state.conversationPressTimer = window.setTimeout(() => {
      state.conversationPressTriggered = true;
      deleteConversation(item.dataset.id);
      state.conversationPressTimer = null;
    }, 600);
  });

  elements.conversationList.addEventListener("pointerup", () => {
    if (state.conversationPressTimer) {
      window.clearTimeout(state.conversationPressTimer);
      state.conversationPressTimer = null;
    }
    if (state.conversationPressTriggered && state.conversationPressTarget) {
      state.suppressNextConversationClickId = state.conversationPressTarget.dataset.id;
    }
    state.conversationPressTriggered = false;
    state.conversationPressTarget = null;
  });

  elements.conversationList.addEventListener("pointercancel", () => {
    if (state.conversationPressTimer) {
      window.clearTimeout(state.conversationPressTimer);
      state.conversationPressTimer = null;
    }
    state.conversationPressTriggered = false;
    state.conversationPressTarget = null;
  });

  elements.conversationList.addEventListener("pointermove", (event) => {
    if (!state.conversationPressTarget || event.pointerType !== "touch") return;

    const movedAway =
      Math.abs(event.clientX - state.conversationPressStartX) > 8 ||
      Math.abs(event.clientY - state.conversationPressStartY) > 8;
    if (movedAway && state.conversationPressTimer) {
      window.clearTimeout(state.conversationPressTimer);
      state.conversationPressTimer = null;
      state.conversationPressTriggered = false;
      state.conversationPressTarget = null;
    }
  });
}

function bindGlobalEvents() {
  document.addEventListener("click", (event) => {
    if (!state.openConversationMenuId || event.target.closest(".history-item")) return;
    state.openConversationMenuId = null;
    renderAllConversations();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !state.openConversationMenuId) return;
    state.openConversationMenuId = null;
    renderAllConversations();
  });
}

function bindMessageActions() {
  elements.messageList.addEventListener("click", async (event) => {
    const button = event.target.closest(".message-action");
    if (!button) return;

    const assistantIndex = Number(button.dataset.index);
    if (!Number.isInteger(assistantIndex)) return;

    if (button.dataset.messageAction === "delete-round") {
      await deleteRoundFromAssistant(assistantIndex);
      return;
    }

    if (button.dataset.messageAction === "resend-round") {
      await resendRoundFromAssistant(assistantIndex);
    }
  });
}

function bindNewConversationButton() {
  elements.newConversationButton.addEventListener("click", async () => {
    try {
      await createConversation();
      elements.messageInput.focus();
    } catch (error) {
      state.chatMessages = [
        decorateMessage(state, {
          role: "assistant",
          meta: "错误",
          content: `新建会话失败：${error.message}`,
        }),
      ];
      renderAllMessages();
    }
  });
}

function bindComposer() {
  elements.composer.addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = elements.messageInput.value.trim();
    if (!text) {
      elements.messageInput.focus();
      return;
    }

    appendMessage(elements, state, { role: "user", content: text });
    elements.messageInput.value = "";
    setBusy(true);

    const assistantIndex = appendMessage(elements, state, {
      role: "assistant",
      content: "",
      meta: "连接中",
    });

    try {
      await requestAssistantReply(state, assistantIndex, updateAssistantReply);
      updateMessage(elements, state, assistantIndex, {
        meta: state.chatMessages[assistantIndex].content ? "回复" : "空回复",
      });
      await refreshConversations();
    } catch (error) {
      updateMessage(elements, state, assistantIndex, {
        meta: "错误",
        content: `后端调用失败：${error.message}`,
      });
    } finally {
      setBusy(false);
      elements.messageInput.focus();
    }
  });
}

function bindEvents() {
  bindToolbar();
  bindConversationList();
  bindGlobalEvents();
  bindMessageActions();
  bindNewConversationButton();
  bindComposer();
}

async function bootApp() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      redirectToLogin();
      return;
    }
  } catch {
    redirectToLogin();
    return;
  }

  bindEvents();
  await loadActiveCharacter();
  await bootConversations();
}

bootApp();
