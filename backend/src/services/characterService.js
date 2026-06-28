import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { CHARACTERS_DIR } from '../config/paths.js';
import { DEFAULT_CHARACTER_ID, FALLBACK_WELCOME_MESSAGE } from '../config/constants.js';
import { httpError } from '../utils/errors.js';
import { isCharacterAssetFile, isCharacterId } from '../utils/validation.js';

export function characterPath(characterId, ...segments) {
  if (!isCharacterId(characterId)) {
    throw httpError('Invalid character id', 400);
  }

  return resolve(CHARACTERS_DIR, characterId, ...segments);
}

function normalizeAssetPath(characterId, fileName) {
  if (typeof fileName !== 'string' || !fileName.trim()) return null;
  if (fileName.includes('/') || fileName.includes('\\') || fileName.includes('..')) return null;
  if (!isCharacterAssetFile(fileName)) return null;
  return `/characters/${characterId}/${fileName}`;
}

export function publicCharacter(character) {
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

export async function readCharacter(characterId) {
  const metadataPath = characterPath(characterId, 'character.json');
  try {
    const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
    const id = metadata.id || characterId;

    if (id !== characterId || !isCharacterId(id)) {
      throw httpError(`Invalid character metadata for ${characterId}`, 500);
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

export async function listCharacters() {
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

export async function getCharacterOrDefault(characterId) {
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

export async function loadSystemPrompt(characterId) {
  const character = await getCharacterOrDefault(characterId);
  const promptFile = character.prompt;

  if (promptFile.includes('/') || promptFile.includes('\\') || promptFile.includes('..')) {
    throw httpError(`Invalid prompt file for ${character.id}`, 500);
  }

  return {
    character,
    prompt: (await readFile(characterPath(character.id, promptFile), 'utf8')).trim(),
  };
}
