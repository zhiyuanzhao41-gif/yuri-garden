import { randomUUID } from 'node:crypto';
import { DEFAULT_CHARACTER_ID } from '../config/constants.js';
import { getDatabase } from '../db/database.js';
import { getCharacterOrDefault } from './characterService.js';
import { httpError } from '../utils/errors.js';
import { formatDisplayTime } from '../utils/time.js';
import { assertConversationId, isCharacterId } from '../utils/validation.js';

function rowToMessage(row) {
  return {
    role: row.role,
    content: row.content,
    time: row.time,
    meta: row.meta ?? undefined,
  };
}

function normalizeCharacterId(characterId) {
  return isCharacterId(characterId) ? characterId : DEFAULT_CHARACTER_ID;
}

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

function saveConversation(userId, conversation) {
  const db = getDatabase();
  const characterId = normalizeCharacterId(conversation.characterId);
  const existingConversation = db.prepare('SELECT user_id AS userId FROM conversations WHERE id = ?')
    .get(conversation.id);

  if (existingConversation && existingConversation.userId !== userId) {
    throw httpError('Conversation not found', 404);
  }

  const insertConversation = db.prepare(`
    INSERT INTO conversations (id, character_id, user_id, title, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      character_id = excluded.character_id,
      user_id = excluded.user_id,
      title = excluded.title,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at
  `);
  const deleteMessages = db.prepare('DELETE FROM conversation_messages WHERE conversation_id = ?');
  const insertMessage = db.prepare(`
    INSERT INTO conversation_messages (
      conversation_id,
      message_index,
      role,
      content,
      time,
      meta
    )
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  try {
    db.exec('BEGIN');
    insertConversation.run(
      conversation.id,
      characterId,
      userId,
      conversation.title,
      conversation.createdAt,
      conversation.updatedAt,
    );
    deleteMessages.run(conversation.id);
    conversation.messages.map(normalizeMessage).forEach((message, index) => {
      insertMessage.run(
        conversation.id,
        index,
        message.role,
        message.content,
        message.time,
        message.meta ?? null,
      );
    });
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  return {
    ...conversation,
    characterId,
    userId,
    messages: conversation.messages.map(normalizeMessage),
  };
}

export async function readConversation(userId, id, _preferredCharacterId) {
  assertConversationId(id);

  const db = getDatabase();
  const conversation = db.prepare(`
    SELECT
      id,
      character_id AS characterId,
      user_id AS userId,
      title,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM conversations
    WHERE id = ? AND user_id = ?
  `).get(id, userId);

  if (!conversation) {
    throw httpError('Conversation not found', 404);
  }

  const messages = db.prepare(`
    SELECT role, content, time, meta
    FROM conversation_messages
    WHERE conversation_id = ?
    ORDER BY message_index ASC
  `).all(id).map(rowToMessage);

  return {
    ...conversation,
    messages,
  };
}

export async function writeConversation(userId, conversation) {
  assertConversationId(conversation.id);

  return saveConversation(userId, {
    id: conversation.id,
    characterId: normalizeCharacterId(conversation.characterId),
    title: typeof conversation.title === 'string' && conversation.title.trim()
      ? conversation.title.trim()
      : '新会话',
    createdAt: typeof conversation.createdAt === 'string'
      ? conversation.createdAt
      : new Date().toISOString(),
    updatedAt: typeof conversation.updatedAt === 'string'
      ? conversation.updatedAt
      : new Date().toISOString(),
    messages: Array.isArray(conversation.messages) ? conversation.messages : [],
  });
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

export async function createConversationForCharacter(userId, characterId) {
  const character = await getCharacterOrDefault(characterId);
  return writeConversation(userId, createConversation(character));
}

export async function listConversationSummaries(userId, characterId) {
  const safeCharacterId = normalizeCharacterId(characterId);
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT
      c.id,
      c.character_id AS characterId,
      c.title,
      c.created_at AS createdAt,
      c.updated_at AS updatedAt,
      COUNT(m.id) AS messageCount,
      COALESCE(
        (
          SELECT content
          FROM conversation_messages
          WHERE conversation_id = c.id
            AND TRIM(content) != ''
          ORDER BY message_index DESC
          LIMIT 1
        ),
        ''
      ) AS preview
    FROM conversations c
    LEFT JOIN conversation_messages m ON m.conversation_id = c.id
    WHERE c.user_id = ? AND c.character_id = ?
    GROUP BY c.id
    ORDER BY datetime(c.updated_at) DESC
  `).all(userId, safeCharacterId);

  return rows.map((row) => ({
    id: row.id,
    characterId: row.characterId,
    title: row.title,
    preview: row.preview.trim().slice(0, 60) || '还没有开始对话',
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    messageCount: row.messageCount,
  }));
}

export async function updateConversationMessages(userId, id, characterId, messages) {
  const existingConversation = await readConversation(userId, id, characterId);
  const savedMessages = messages.map(normalizeMessage);

  return writeConversation(userId, {
    ...existingConversation,
    title: titleFromMessages(savedMessages),
    updatedAt: new Date().toISOString(),
    messages: savedMessages,
  });
}

export async function deleteConversation(userId, id, characterId) {
  assertConversationId(id);

  const existingConversation = await readConversation(userId, id, characterId);
  const result = getDatabase()
    .prepare('DELETE FROM conversations WHERE id = ? AND user_id = ?')
    .run(existingConversation.id, userId);

  if (result.changes === 0) {
    throw httpError('Conversation not found', 404);
  }
}

export async function conversationExists(userId, id) {
  try {
    assertConversationId(id);
  } catch (error) {
    if (error.status === 400) return false;
    throw error;
  }

  const row = getDatabase()
    .prepare('SELECT 1 FROM conversations WHERE id = ? AND user_id = ?')
    .get(id, userId);
  return Boolean(row);
}
