import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const BACKEND_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PROJECT_DIR = resolve(BACKEND_DIR, '..');

export const FRONTEND_DIR = resolve(PROJECT_DIR, 'frontend');
export const DATA_DIR = resolve(PROJECT_DIR, 'data');
export const CHARACTERS_DIR = resolve(DATA_DIR, 'characters');
export const SQLITE_DB_PATH = resolve(DATA_DIR, 'app.sqlite');
export const INDEX_HTML_PATH = resolve(FRONTEND_DIR, 'index.html');
