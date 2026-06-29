import { Router } from 'express';
import { DEFAULT_CHARACTER_ID, DEEPSEEK_API_URL } from '../config/constants.js';
import { loadSystemPrompt } from '../services/characterService.js';
import {
  conversationExists,
  normalizeMessage,
  readConversation,
  titleFromMessages,
  writeConversation,
} from '../services/conversationService.js';
import { handleJsonError } from '../utils/errors.js';
import { formatDisplayTime } from '../utils/time.js';
import { assertConversationId } from '../utils/validation.js';

export const chatRouter = Router();

chatRouter.post('/', async (req, res) => {
  const { conversationId, messages, characterId } = req.body ?? {};

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages must be a non-empty array' });
  }

  try {
    assertConversationId(conversationId);

    if (!(await conversationExists(req.user.id, conversationId))) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
  } catch (error) {
    return handleJsonError(res, error);
  }

  if (!process.env.API_KEY) {
    return res.status(500).json({ error: 'Missing API_KEY in backend/.env' });
  }

  let character;
  let systemPrompt;
  try {
    const promptData = await loadSystemPrompt(characterId);
    character = promptData.character;
    systemPrompt = promptData.prompt;
  } catch (error) {
    return res.status(500).json({
      error: `Failed to load system prompt for ${characterId || DEFAULT_CHARACTER_ID}: ${error.message}`,
    });
  }

  const modelMessages = [
    { role: 'system', content: systemPrompt },
    ...messages
      .filter(
        (message) =>
          (message?.role === 'user' || message?.role === 'assistant') &&
          typeof message.content === 'string' &&
          message.content.trim(),
      )
      .map((message) => ({
        role: message.role,
        content: message.content,
      })),
  ];

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  try {
    const upstream = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.MODEL || 'deepseek-v4-pro',
        messages: modelMessages,
        stream: true,
      }),
    });

    if (!upstream.ok || !upstream.body) {
      const detail = await upstream.text();
      throw new Error(`Model API returned ${upstream.status}: ${detail}`);
    }

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let assistantReply = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;

        const payload = trimmed.slice(5).trim();
        if (payload === '[DONE]') {
          continue;
        }

        const parsed = JSON.parse(payload);
        const content = parsed.choices?.[0]?.delta?.content;
        if (content) {
          assistantReply += content;
          res.write(`data: ${JSON.stringify({ content })}\n\n`);
        }
      }
    }

    const existingConversation = await readConversation(req.user.id, conversationId, characterId);
    const savedMessages = messages.map(normalizeMessage);
    const lastMessage = savedMessages.at(-1);

    if (lastMessage?.role === 'assistant' && !lastMessage.content.trim()) {
      lastMessage.content = assistantReply;
      lastMessage.meta = assistantReply ? '回复' : '空回复';
      lastMessage.time = formatDisplayTime(new Date());
    } else {
      savedMessages.push({
        role: 'assistant',
        content: assistantReply,
        time: formatDisplayTime(new Date()),
        meta: assistantReply ? '回复' : '空回复',
      });
    }

    await writeConversation(req.user.id, {
      ...existingConversation,
      characterId: existingConversation.characterId || character.id,
      title: titleFromMessages(savedMessages),
      updatedAt: new Date().toISOString(),
      messages: savedMessages,
    });

    res.write('data: [DONE]\n\n');
  } catch (error) {
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
  } finally {
    res.end();
  }
});
