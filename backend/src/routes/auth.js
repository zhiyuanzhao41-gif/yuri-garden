import { Router } from 'express';
import {
  clearSessionCookieOptions,
  createSessionToken,
  loginUser,
  registerUser,
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
} from '../services/authService.js';
import { handleJsonError } from '../utils/errors.js';

export const authRouter = Router();

function setSessionCookie(req, res, user) {
  res.cookie(SESSION_COOKIE_NAME, createSessionToken(user), sessionCookieOptions(req));
}

authRouter.get('/me', (req, res) => {
  res.json({ user: req.user ?? null });
});

authRouter.post('/register', (req, res) => {
  try {
    const user = registerUser(req.body ?? {});
    setSessionCookie(req, res, user);
    res.status(201).json({ user });
  } catch (error) {
    handleJsonError(res, error);
  }
});

authRouter.post('/login', (req, res) => {
  try {
    const user = loginUser(req.body ?? {});
    setSessionCookie(req, res, user);
    res.json({ user });
  } catch (error) {
    handleJsonError(res, error);
  }
});

authRouter.post('/logout', (req, res) => {
  res.clearCookie(SESSION_COOKIE_NAME, clearSessionCookieOptions(req));
  res.json({ ok: true });
});
