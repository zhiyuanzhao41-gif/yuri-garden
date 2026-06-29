import { createHmac, randomBytes, randomUUID, timingSafeEqual, pbkdf2Sync } from 'node:crypto';
import { getDatabase } from '../db/database.js';
import { httpError } from '../utils/errors.js';

const SESSION_COOKIE_NAME = 'lilian_session';
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const PASSWORD_ITERATIONS = 120000;
const PASSWORD_KEY_LENGTH = 32;
const PASSWORD_DIGEST = 'sha256';

function sessionSecret() {
  return process.env.SESSION_SECRET || process.env.API_KEY || 'lilian-garden-local-session-secret';
}

function toBase64Url(value) {
  return Buffer.from(value).toString('base64url');
}

function fromBase64Url(value) {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function signPayload(payload) {
  return createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
}

function safeCompare(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function publicUser(row) {
  if (!row) return null;

  return {
    id: row.id,
    username: row.username,
    nickname: row.nickname,
    avatarPath: row.avatar_path ?? undefined,
  };
}

export function validateUsername(username) {
  return typeof username === 'string' && /^[a-zA-Z0-9_-]{3,32}$/.test(username);
}

export function validatePassword(password) {
  return typeof password === 'string' && password.length >= 6;
}

export function hashPassword(password) {
  const salt = randomBytes(16).toString('base64url');
  const hash = pbkdf2Sync(
    password,
    salt,
    PASSWORD_ITERATIONS,
    PASSWORD_KEY_LENGTH,
    PASSWORD_DIGEST,
  ).toString('base64url');

  return `pbkdf2:${PASSWORD_ITERATIONS}:${salt}:${hash}`;
}

export function verifyPassword(password, storedHash) {
  const [scheme, iterationsText, salt, hash] = String(storedHash || '').split(':');
  const iterations = Number(iterationsText);

  if (scheme !== 'pbkdf2' || !Number.isInteger(iterations) || !salt || !hash) {
    return false;
  }

  const candidate = pbkdf2Sync(
    password,
    salt,
    iterations,
    PASSWORD_KEY_LENGTH,
    PASSWORD_DIGEST,
  ).toString('base64url');

  return safeCompare(candidate, hash);
}

export function createSessionToken(user) {
  const payload = toBase64Url(JSON.stringify({
    userId: user.id,
    username: user.username,
    exp: Date.now() + SESSION_MAX_AGE_SECONDS * 1000,
  }));
  return `${payload}.${signPayload(payload)}`;
}

export function readSessionToken(token) {
  const [payload, signature] = String(token || '').split('.');
  if (!payload || !signature || !safeCompare(signature, signPayload(payload))) {
    return null;
  }

  try {
    const session = JSON.parse(fromBase64Url(payload));
    if (!session.userId || Date.now() > session.exp) return null;
    return session;
  } catch {
    return null;
  }
}

export function findUserById(id) {
  const row = getDatabase()
    .prepare(`
      SELECT id, username, nickname, avatar_path
      FROM users
      WHERE id = ?
    `)
    .get(id);

  return publicUser(row);
}

export function registerUser({ username, password }) {
  const cleanUsername = typeof username === 'string' ? username.trim() : '';

  if (!validateUsername(cleanUsername)) {
    throw httpError('用户名需为 3-32 位字母、数字、下划线或短横线', 400);
  }

  if (!validatePassword(password)) {
    throw httpError('密码至少需要 6 位', 400);
  }

  const db = getDatabase();
  const existing = db.prepare('SELECT 1 FROM users WHERE username = ?').get(cleanUsername);
  if (existing) {
    throw httpError('用户名已存在', 409);
  }

  const now = new Date().toISOString();
  const user = {
    id: randomUUID(),
    username: cleanUsername,
    nickname: cleanUsername,
  };

  db.prepare(`
    INSERT INTO users (id, username, nickname, password_hash, avatar_path, created_at, updated_at)
    VALUES (?, ?, ?, ?, NULL, ?, ?)
  `).run(user.id, user.username, user.nickname, hashPassword(password), now, now);

  return user;
}

export function loginUser({ username, password }) {
  const cleanUsername = typeof username === 'string' ? username.trim() : '';
  const row = getDatabase()
    .prepare(`
      SELECT id, username, nickname, avatar_path, password_hash
      FROM users
      WHERE username = ?
    `)
    .get(cleanUsername);

  if (!row || !verifyPassword(password, row.password_hash)) {
    throw httpError('用户名或密码错误', 401);
  }

  return publicUser(row);
}

export function sessionCookieOptions(req) {
  const forwardedProto = String(req.get('x-forwarded-proto') || '').split(',')[0].trim();
  const secure = req.secure || forwardedProto === 'https';

  return {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS * 1000,
  };
}

export function clearSessionCookieOptions(req) {
  return {
    ...sessionCookieOptions(req),
    maxAge: 0,
  };
}

export { SESSION_COOKIE_NAME };
