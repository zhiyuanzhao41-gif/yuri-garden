import { API_BASE_URL } from "../app/api.js";
import { toConversationMessages } from "./messageView.js";

export async function requestAssistantReply(appState, assistantIndex, onContent) {
  if (!appState.currentConversationId) {
    throw new Error("当前没有可保存的会话");
  }

  const response = await fetch(`${API_BASE_URL}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      conversationId: appState.currentConversationId,
      characterId: appState.activeCharacter.id,
      messages: toConversationMessages(appState),
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
        onContent(assistantIndex, reply);
      }
    }
  }
}
