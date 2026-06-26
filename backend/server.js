import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = express();
const PORT = process.env.PORT || 3000;
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';
const __dirname = dirname(fileURLToPath(import.meta.url));
const SYSTEM_PROMPT_PATH = resolve(__dirname, 'prompts', 'lilian.md');
const CONVERSATIONS_DIR = resolve(__dirname, 'conversations');
const FRONTEND_DIR = resolve(__dirname, '..', 'frontend');
const INDEX_HTML_PATH = resolve(FRONTEND_DIR, 'index.html');
const WELCOME_MESSAGE = '欢迎光临莉莉安百合风俗店。';

app.set('trust proxy', true);
app.use(cors());
app.use(express.json({ limit: '1mb' }));

async function loadSystemPrompt() {
  return (await readFile(SYSTEM_PROMPT_PATH, 'utf8')).trim();
}

function formatDisplayTime(date) {
  return date
    .toLocaleString('zh-CN', {
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
    .replaceAll('/', '-');
}

function normalizeMessage(message) {
  return {
    role: message?.role === 'user' ? 'user' : 'assistant',
    content: typeof message?.content === 'string' ? message.content : '',
    time: typeof message?.time === 'string' ? message.time : formatDisplayTime(new Date()),
    meta: typeof message?.meta === 'string' ? message.meta : undefined,
  };
}

function titleFromMessages(messages) {
  const firstUserMessage = messages.find(
    (message) => message.role === 'user' && message.content.trim(),
  );
  return firstUserMessage?.content.trim().slice(0, 20) || '新会话';
}

function summarizeConversation(conversation) {
  const previewMessage = [...conversation.messages]
    .reverse()
    .find((message) => message.content.trim());

  return {
    id: conversation.id,
    title: conversation.title,
    preview: previewMessage?.content.trim().slice(0, 60) || '还没有开始对话',
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    messageCount: conversation.messages.length,
  };
}

function assertConversationId(id) {
  if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/i.test(id)) {
    const error = new Error('Invalid conversation id');
    error.status = 400;
    throw error;
  }
}

async function ensureConversationDir() {
  await mkdir(CONVERSATIONS_DIR, { recursive: true });
}

function conversationPath(id) {
  assertConversationId(id);
  return resolve(CONVERSATIONS_DIR, `${id}.json`);
}

async function readConversation(id) {
  const filePath = conversationPath(id);
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') {
      error.status = 404;
      error.message = 'Conversation not found';
    }
    throw error;
  }
}

async function writeConversation(conversation) {
  await ensureConversationDir();
  await writeFile(
    conversationPath(conversation.id),
    `${JSON.stringify(conversation, null, 2)}\n`,
    'utf8',
  );
  return conversation;
}

function createConversation() {
  const now = new Date();
  const nowIso = now.toISOString();

  return {
    id: randomUUID(),
    title: '新会话',
    createdAt: nowIso,
    updatedAt: nowIso,
    messages: [
      {
        role: 'assistant',
        content: WELCOME_MESSAGE,
        time: formatDisplayTime(now),
        meta: '欢迎',
      },
    ],
  };
}

async function conversationExists(id) {
  try {
    await access(conversationPath(id));
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

function handleJsonError(res, error) {
  res.status(error.status || 500).json({ error: error.message });
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/conversations', async (_req, res) => {
  try {
    await ensureConversationDir();
    const fileNames = await readdir(CONVERSATIONS_DIR);
    const conversations = await Promise.all(
      fileNames
        .filter((fileName) => fileName.endsWith('.json'))
        .map(async (fileName) => JSON.parse(await readFile(resolve(CONVERSATIONS_DIR, fileName), 'utf8'))),
    );

    res.json({
      conversations: conversations
        .map(summarizeConversation)
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)),
    });
  } catch (error) {
    handleJsonError(res, error);
  }
});

app.post('/api/conversations', async (_req, res) => {
  try {
    const conversation = await writeConversation(createConversation());
    res.status(201).json({ conversation });
  } catch (error) {
    handleJsonError(res, error);
  }
});

app.get('/api/conversations/:id', async (req, res) => {
  try {
    res.json({ conversation: await readConversation(req.params.id) });
  } catch (error) {
    handleJsonError(res, error);
  }
});

app.post('/api/chat', async (req, res) => {
  const { conversationId, messages } = req.body ?? {};

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages must be a non-empty array' });
  }

  try {
    assertConversationId(conversationId);

    if (!(await conversationExists(conversationId))) {
      return res.status(400).json({ error: 'Conversation not found' });
    }
  } catch (error) {
    return handleJsonError(res, error);
  }

  if (!process.env.API_KEY) {
    return res.status(500).json({ error: 'Missing API_KEY in backend/.env' });
  }

  let systemPrompt;
  try {
    systemPrompt = await loadSystemPrompt();
  } catch (error) {
    return res.status(500).json({
      error: `Failed to load system prompt from backend/prompts/lilian.md: ${error.message}`,
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

    const existingConversation = await readConversation(conversationId);
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

    await writeConversation({
      ...existingConversation,
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

app.use(express.static(FRONTEND_DIR));

app.get(/^\/(?!api\/).*/, (_req, res) => {
  res.sendFile(INDEX_HTML_PATH);
});

app.listen(PORT, () => {
  console.log(`AI chat backend is running at http://localhost:${PORT}`);
});
