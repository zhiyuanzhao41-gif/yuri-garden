import { httpError } from './errors.js';

export function isCharacterId(value) {
  return typeof value === 'string' && /^[a-z0-9_-]+$/i.test(value);
}

export function isCharacterAssetFile(fileName) {
  return typeof fileName === 'string' && /\.(?:avif|gif|jpe?g|png|webp)$/i.test(fileName);
}

export function assertConversationId(id) {
  if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/i.test(id)) {
    throw httpError('Invalid conversation id', 400);
  }
}
