import { access, mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import {
  CONVERSATIONS_DIR,
  LEGACY_CONVERSATIONS_DIR,
} from '../config/paths.js';
import { DEFAULT_CHARACTER_ID } from '../config/constants.js';
import { getCharacterOrDefault, listCharacters } from './characterService.js';
import { httpError } from '../utils/errors.js';
import { formatDisplayTime } from '../utils/time.js';
import { assertConversationId, isCharacterId } from '../utils/validation.js';

export function normalizeMessage(message) {
  return {
    role: message?.role === 'user' ? 'user' : 'assistant',
    content: typeof message?.content === 'string' ? message.content : '',
    time: typeof message?.time === 'string' ? message.time : formatDisplayTime(new Date()),
    meta: typeof message?.meta === 'string' ? message.meta : undefined,
  };
}

export function titleFromMessages(messages) {
  const firstUserMessage = messages.find(
    (message) => message.role === 'user' && message.content.trim(),
  );
  return firstUserMessage?.content.trim().slice(0, 20) || '新会话';
}

export function summarizeConversation(conversation) {
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

export async function ensureConversationDir() {
  await mkdir(CONVERSATIONS_DIR, { recursive: true });
}

export function conversationDir(characterId) {
  if (!isCharacterId(characterId)) {
    throw httpError('Invalid character id', 400);
  }

  return resolve(CONVERSATIONS_DIR, characterId);
}

function conversationPath(characterId, id) {
  assertConversationId(id);
  return resolve(conversationDir(characterId), `${id}.json`);
}

async function ensureCharacterConversationDir(characterId) {
  await mkdir(conversationDir(characterId), { recursive: true });
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

export async function findConversationFile(id, preferredCharacterId) {
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

  throw httpError('Conversation not found', 404);
}

export async function readConversation(id, preferredCharacterId) {
  return JSON.parse(await readFile(await findConversationFile(id, preferredCharacterId), 'utf8'));
}

export async function writeConversation(conversation) {
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

export function createConversation(character) {
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

export async function createConversationForCharacter(characterId) {
  const character = await getCharacterOrDefault(characterId);
  return writeConversation(createConversation(character));
}

export async function listConversationSummaries(characterId) {
  await ensureConversationDir();
  const dir = conversationDir(characterId);

  await mkdir(dir, { recursive: true });
  const fileNames = await readdir(dir);
  const conversations = await Promise.all(
    fileNames
      .filter((fileName) => fileName.endsWith('.json'))
      .map(async (fileName) => JSON.parse(await readFile(resolve(dir, fileName), 'utf8'))),
  );

  return conversations
    .filter((conversation) => (conversation.characterId || DEFAULT_CHARACTER_ID) === characterId)
    .map(summarizeConversation)
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

export async function updateConversationMessages(id, characterId, messages) {
  const existingConversation = await readConversation(id, characterId);
  const savedMessages = messages.map(normalizeMessage);

  return writeConversation({
    ...existingConversation,
    title: titleFromMessages(savedMessages),
    updatedAt: new Date().toISOString(),
    messages: savedMessages,
  });
}

export async function deleteConversation(id, characterId) {
  const filePath = await findConversationFile(id, characterId);

  try {
    await unlink(filePath);
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw httpError('Conversation not found', 404);
    }
    throw error;
  }
}

export async function conversationExists(id) {
  try {
    await findConversationFile(id);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    if (error.status === 404) return false;
    throw error;
  }
}

export async function migrateLegacyConversations() {
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
