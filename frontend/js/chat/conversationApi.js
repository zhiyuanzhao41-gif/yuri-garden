import { fetchJson } from "../app/api.js";
import { toConversationMessages } from "./messageView.js";

export async function fetchCharacter(characterId) {
  const data = await fetchJson(`/api/characters/${encodeURIComponent(characterId)}`);
  return data.character;
}

export async function fetchConversationSummaries(characterId) {
  const data = await fetchJson(`/api/conversations?characterId=${encodeURIComponent(characterId)}`);
  return data.conversations || [];
}

export function createConversationRequest(characterId) {
  return fetchJson("/api/conversations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ characterId }),
  });
}

export async function fetchConversation(conversationId, characterId) {
  const data = await fetchJson(
    `/api/conversations/${encodeURIComponent(conversationId)}?characterId=${encodeURIComponent(characterId)}`,
  );
  return data.conversation;
}

export async function saveConversationMessages(appState) {
  if (!appState.currentConversationId) {
    throw new Error("当前没有可保存的会话");
  }

  const data = await fetchJson(
    `/api/conversations/${encodeURIComponent(appState.currentConversationId)}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        characterId: appState.activeCharacter.id,
        messages: toConversationMessages(appState),
      }),
    },
  );

  return data.conversation;
}

export function deleteConversationRequest(conversationId, characterId) {
  return fetchJson(
    `/api/conversations/${encodeURIComponent(conversationId)}?characterId=${encodeURIComponent(characterId)}`,
    {
      method: "DELETE",
    },
  );
}
