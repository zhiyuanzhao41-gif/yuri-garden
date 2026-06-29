import {
  findUserById,
  readSessionToken,
  SESSION_COOKIE_NAME,
} from '../services/authService.js';

function parseCookies(header) {
  return String(header || '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const separatorIndex = part.indexOf('=');
      if (separatorIndex < 0) return cookies;

      const key = decodeURIComponent(part.slice(0, separatorIndex).trim());
      const value = decodeURIComponent(part.slice(separatorIndex + 1).trim());
      cookies[key] = value;
      return cookies;
    }, {});
}

export function attachAuth(req, _res, next) {
  const cookies = parseCookies(req.get('cookie'));
  const session = readSessionToken(cookies[SESSION_COOKIE_NAME]);

  req.user = session ? findUserById(session.userId) : null;
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: '请先登录' });
  }

  return next();
}
