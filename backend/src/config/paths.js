import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const BACKEND_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PROJECT_DIR = resolve(BACKEND_DIR, '..');

export const FRONTEND_DIR = resolve(PROJECT_DIR, 'frontend');
export const DATA_DIR = resolve(PROJECT_DIR, 'data');
export const CHARACTERS_DIR = resolve(DATA_DIR, 'characters');
export const CONVERSATIONS_DIR = resolve(DATA_DIR, 'conversation');
export const LEGACY_CONVERSATIONS_DIR = resolve(BACKEND_DIR, 'conversations');
export const INDEX_HTML_PATH = resolve(FRONTEND_DIR, 'index.html');
