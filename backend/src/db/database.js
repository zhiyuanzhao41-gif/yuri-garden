import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { SQLITE_DB_PATH } from '../config/paths.js';

let database;

export async function initializeDatabase() {
  await mkdir(dirname(SQLITE_DB_PATH), { recursive: true });

  const db = getDatabase();
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      nickname TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      avatar_path TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_api_keys (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      api_key TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS user_prompts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      character_id TEXT NOT NULL,
      user_id TEXT,
      title TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS conversation_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id TEXT NOT NULL,
      message_index INTEGER NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      time TEXT NOT NULL,
      meta TEXT,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
      UNIQUE (conversation_id, message_index)
    );

    CREATE INDEX IF NOT EXISTS idx_conversations_character_updated
      ON conversations(character_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_conversations_user_character_updated
      ON conversations(user_id, character_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_conversation_messages_conversation_index
      ON conversation_messages(conversation_id, message_index);
    CREATE INDEX IF NOT EXISTS idx_user_api_keys_user
      ON user_api_keys(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_prompts_user
      ON user_prompts(user_id);
  `);
}

export function getDatabase() {
  if (!database) {
    database = new DatabaseSync(SQLITE_DB_PATH);
    database.exec('PRAGMA foreign_keys = ON;');
    database.exec('PRAGMA busy_timeout = 5000;');
  }

  return database;
}
