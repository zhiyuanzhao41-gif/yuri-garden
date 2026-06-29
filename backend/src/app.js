import express from 'express';
import cors from 'cors';
import { FRONTEND_DIR, INDEX_HTML_PATH } from './config/paths.js';
import { attachAuth, requireAuth } from './middleware/auth.js';
import { authRouter } from './routes/auth.js';
import { characterAssetsRouter, charactersRouter } from './routes/characters.js';
import { chatRouter } from './routes/chat.js';
import { conversationsRouter } from './routes/conversations.js';
import { healthRouter } from './routes/health.js';

function corsOrigin(origin, callback) {
  callback(null, origin || true);
}

function loginRedirectUrl(req) {
  const params = new URLSearchParams({ auth: 'login' });
  if (typeof req.query.character === 'string' && req.query.character) {
    params.set('character', req.query.character);
  }

  return `/index.html?${params.toString()}`;
}

export function createApp() {
  const app = express();

  app.set('trust proxy', true);
  app.use(cors({ origin: corsOrigin, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(attachAuth);

  app.use('/api/health', healthRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/characters', charactersRouter);
  app.use('/api/conversations', requireAuth, conversationsRouter);
  app.use('/api/chat', requireAuth, chatRouter);
  app.use('/characters', characterAssetsRouter);

  app.get('/chat.html', (req, res, next) => {
    if (!req.user) {
      return res.redirect(302, loginRedirectUrl(req));
    }

    return next();
  });

  app.use(express.static(FRONTEND_DIR));

  app.get(/^\/(?!api\/).*/, (_req, res) => {
    res.sendFile(INDEX_HTML_PATH);
  });

  return app;
}
