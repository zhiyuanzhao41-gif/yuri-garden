import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { access, mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = express();
const PORT = process.env.PORT || 3000;
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';
const __dirname = dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = resolve(__dirname, '..', 'frontend');
const DATA_DIR = resolve(__dirname, '..', 'data');
const CHARACTERS_DIR = resolve(DATA_DIR, 'characters');
const CONVERSATIONS_DIR = resolve(DATA_DIR, 'conversation');
const LEGACY_CONVERSATIONS_DIR = resolve(__dirname, 'conversations');
const INDEX_HTML_PATH = resolve(FRONTEND_DIR, 'index.html');
const DEFAULT_CHARACTER_ID = 'sakiko';
const FALLBACK_WELCOME_MESSAGE = '欢迎光临莉莉安百合风俗店。';

app.set('trust proxy', true);
app.use(cors());
app.use(express.json({ limit: '1mb' }));

function isCharacterId(value) {
  return typeof value === 'string' && /^[a-z0-9_-]+$/i.test(value);
}

function characterPath(characterId, ...segments) {
  if (!isCharacterId(characterId)) {
    const error = new Error('Invalid character id');
    error.status = 400;
    throw error;
  }

  return resolve(CHARACTERS_DIR, characterId, ...segments);
}

function normalizeAssetPath(characterId, fileName) {
  if (typeof fileName !== 'string' || !fileName.trim()) return null;
  if (fileName.includes('/') || fileName.includes('\\') || fileName.includes('..')) return null;
  if (!isCharacterAssetFile(fileName)) return null;
  return `/characters/${characterId}/${fileName}`;
}

function isCharacterAssetFile(fileName) {
  return typeof fileName === 'string' && /\.(?:avif|gif|jpe?g|png|webp)$/i.test(fileName);
}

function publicCharacter(character) {
  return {
    id: character.id,
    name: character.name,
    initials: character.initials,
    enabled: character.enabled,
    sortOrder: character.sortOrder,
    information: character.information,
    welcomeMessage: character.welcomeMessage,
    assets: {
      avatar: normalizeAssetPath(character.id, character.assets?.avatar),
      cover: normalizeAssetPath(character.id, character.assets?.cover),
    },
  };
}

async function readCharacter(characterId) {
  const metadataPath = characterPath(characterId, 'character.json');
  try {
    const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
    const id = metadata.id || characterId;

    if (id !== characterId || !isCharacterId(id)) {
      const error = new Error(`Invalid character metadata for ${characterId}`);
      error.status = 500;
      throw error;
    }

    return {
      id,
      name: typeof metadata.name === 'string' && metadata.name.trim() ? metadata.name.trim() : id,
      initials:
        typeof metadata.initials === 'string' && metadata.initials.trim()
          ? metadata.initials.trim().slice(0, 2)
          : id.slice(0, 2).toUpperCase(),
      enabled: metadata.enabled !== false,
      sortOrder: Number.isFinite(metadata.sortOrder) ? metadata.sortOrder : 100,
      information:
        typeof metadata.information === 'string' && metadata.information.trim()
          ? metadata.information.trim()
          : '',
      welcomeMessage:
        typeof metadata.welcomeMessage === 'string' && metadata.welcomeMessage.trim()
          ? metadata.welcomeMessage.trim()
          : FALLBACK_WELCOME_MESSAGE,
      prompt:
        typeof metadata.prompt === 'string' && metadata.prompt.trim()
          ? metadata.prompt.trim()
          : 'prompt.md',
      assets: metadata.assets && typeof metadata.assets === 'object' ? metadata.assets : {},
    };
  } catch (error) {
    if (error.code === 'ENOENT') {
      error.status = 404;
      error.message = 'Character not found';
    }
    throw error;
  }
}

async function listCharacters() {
  const entries = await readdir(CHARACTERS_DIR, { withFileTypes: true });
  const characters = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && isCharacterId(entry.name))
      .map((entry) => readCharacter(entry.name)),
  );

  return characters
    .filter((character) => character.enabled)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
}

async function getCharacterOrDefault(characterId) {
  if (isCharacterId(characterId)) {
    try {
      const character = await readCharacter(characterId);
      if (character.enabled) return character;
    } catch (error) {
      if (error.status !== 404) throw error;
    }
  }

  return readCharacter(DEFAULT_CHARACTER_ID);
}

async function loadSystemPrompt(characterId) {
  const character = await getCharacterOrDefault(characterId);
  const promptFile = character.prompt;

  if (promptFile.includes('/') || promptFile.includes('\\') || promptFile.includes('..')) {
    const error = new Error(`Invalid prompt file for ${character.id}`);
    error.status = 500;
    throw error;
  }

  return {
    character,
    prompt: (await readFile(characterPath(character.id, promptFile), 'utf8')).trim(),
  };
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
    characterId: conversation.characterId || DEFAULT_CHARACTER_ID,
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

async function ensureCharacterConversationDir(characterId) {
  await mkdir(conversationDir(characterId), { recursive: true });
}

function conversationDir(characterId) {
  if (!isCharacterId(characterId)) {
    const error = new Error('Invalid character id');
    error.status = 400;
    throw error;
  }

  return resolve(CONVERSATIONS_DIR, characterId);
}

function conversationPath(characterId, id) {
  assertConversationId(id);
  return resolve(conversationDir(characterId), `${id}.json`);
}

async function conversationSearchDirs(preferredCharacterId) {
  const dirs = [];
  const seen = new Set();

  function addDir(dir) {
    if (seen.has(dir)) return;
    seen.add(dir);
    dirs.push(dir);
  }

  if (isCharacterId(preferredCharacterId)) {
    addDir(conversationDir(preferredCharacterId));
  }

  try {
    const characters = await listCharacters();
    for (const character of characters) {
      addDir(conversationDir(character.id));
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  addDir(conversationDir(DEFAULT_CHARACTER_ID));
  addDir(LEGACY_CONVERSATIONS_DIR);

  return dirs;
}

async function findConversationFile(id, preferredCharacterId) {
  assertConversationId(id);

  for (const dir of await conversationSearchDirs(preferredCharacterId)) {
    const filePath = resolve(dir, `${id}.json`);
    try {
      await access(filePath);
      return filePath;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }

  const error = new Error('Conversation not found');
  error.status = 404;
  throw error;
}

async function readConversation(id, preferredCharacterId) {
  return JSON.parse(await readFile(await findConversationFile(id, preferredCharacterId), 'utf8'));
}

async function writeConversation(conversation) {
  const characterId = isCharacterId(conversation.characterId)
    ? conversation.characterId
    : DEFAULT_CHARACTER_ID;

  await ensureCharacterConversationDir(characterId);
  await writeFile(
    conversationPath(characterId, conversation.id),
    `${JSON.stringify(conversation, null, 2)}\n`,
    'utf8',
  );
  return conversation;
}

function createConversation(character) {
  const now = new Date();
  const nowIso = now.toISOString();

  return {
    id: randomUUID(),
    characterId: character.id,
    title: '新会话',
    createdAt: nowIso,
    updatedAt: nowIso,
    messages: [
      {
        role: 'assistant',
        content: character.welcomeMessage,
        time: formatDisplayTime(now),
        meta: '欢迎',
      },
    ],
  };
}

async function conversationExists(id) {
  try {
    await findConversationFile(id);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    if (error.status === 404) return false;
    throw error;
  }
}

async function migrateLegacyConversations() {
  try {
    const fileNames = await readdir(LEGACY_CONVERSATIONS_DIR);

    await Promise.all(
      fileNames
        .filter((fileName) => fileName.endsWith('.json'))
        .map(async (fileName) => {
          const legacyPath = resolve(LEGACY_CONVERSATIONS_DIR, fileName);
          const conversation = JSON.parse(await readFile(legacyPath, 'utf8'));
          const characterId = isCharacterId(conversation.characterId)
            ? conversation.characterId
            : DEFAULT_CHARACTER_ID;
          const targetPath = conversationPath(characterId, conversation.id);

          try {
            await access(targetPath);
            return;
          } catch (error) {
            if (error.code !== 'ENOENT') throw error;
          }

          await writeConversation({
            ...conversation,
            characterId,
          });
        }),
    );
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

function handleJsonError(res, error) {
  res.status(error.status || 500).json({ error: error.message });
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/characters', async (_req, res) => {
  try {
    res.json({ characters: (await listCharacters()).map(publicCharacter) });
  } catch (error) {
    handleJsonError(res, error);
  }
});

app.get('/api/characters/:id', async (req, res) => {
  try {
    const character = await readCharacter(req.params.id);
    if (!character.enabled) {
      return res.status(404).json({ error: 'Character not found' });
    }
    res.json({ character: publicCharacter(character) });
  } catch (error) {
    handleJsonError(res, error);
  }
});

app.get('/api/conversations', async (req, res) => {
  try {
    await ensureConversationDir();
    const characterId = isCharacterId(req.query.characterId) ? req.query.characterId : DEFAULT_CHARACTER_ID;
    const dir = conversationDir(characterId);

    await mkdir(dir, { recursive: true });
    const fileNames = await readdir(dir);
    const conversations = await Promise.all(
      fileNames
        .filter((fileName) => fileName.endsWith('.json'))
        .map(async (fileName) => JSON.parse(await readFile(resolve(dir, fileName), 'utf8'))),
    );

    res.json({
      conversations: conversations
        .filter((conversation) => (conversation.characterId || DEFAULT_CHARACTER_ID) === characterId)
        .map(summarizeConversation)
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)),
    });
  } catch (error) {
    handleJsonError(res, error);
  }
});

app.post('/api/conversations', async (req, res) => {
  try {
    const character = await getCharacterOrDefault(req.body?.characterId);
    const conversation = await writeConversation(createConversation(character));
    res.status(201).json({ conversation });
  } catch (error) {
    handleJsonError(res, error);
  }
});

app.get('/api/conversations/:id', async (req, res) => {
  try {
    res.json({ conversation: await readConversation(req.params.id, req.query.characterId) });
  } catch (error) {
    handleJsonError(res, error);
  }
});

app.patch('/api/conversations/:id', async (req, res) => {
  const { messages } = req.body ?? {};

  if (!Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages must be an array' });
  }

  try {
    const existingConversation = await readConversation(req.params.id, req.body?.characterId);
    const savedMessages = messages.map(normalizeMessage);
    const conversation = await writeConversation({
      ...existingConversation,
      title: titleFromMessages(savedMessages),
      updatedAt: new Date().toISOString(),
      messages: savedMessages,
    });

    res.json({ conversation });
  } catch (error) {
    handleJsonError(res, error);
  }
});

app.delete('/api/conversations/:id', async (req, res) => {
  try {
    const filePath = await findConversationFile(req.params.id, req.query.characterId);

    try {
      await unlink(filePath);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return res.status(404).json({ error: 'Conversation not found' });
      }
      throw error;
    }

    res.json({ ok: true });
  } catch (error) {
    handleJsonError(res, error);
  }
});

app.post('/api/chat', async (req, res) => {
  const { conversationId, messages, characterId } = req.body ?? {};

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

    const existingConversation = await readConversation(conversationId, characterId);
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

app.get('/characters/:id/:fileName', (req, res) => {
  const { id, fileName } = req.params;

  if (!isCharacterId(id) || fileName.includes('..') || !isCharacterAssetFile(fileName)) {
    return res.status(404).end();
  }

  res.sendFile(characterPath(id, fileName));
});

app.use(express.static(FRONTEND_DIR));

app.get(/^\/(?!api\/).*/, (_req, res) => {
  res.sendFile(INDEX_HTML_PATH);
});

migrateLegacyConversations()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`AI chat backend is running at http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error(`Failed to migrate legacy conversations: ${error.message}`);
    process.exit(1);
  });
