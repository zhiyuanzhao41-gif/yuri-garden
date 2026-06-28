import express from 'express';
import cors from 'cors';
import { FRONTEND_DIR, INDEX_HTML_PATH } from './config/paths.js';
import { characterAssetsRouter, charactersRouter } from './routes/characters.js';
import { chatRouter } from './routes/chat.js';
import { conversationsRouter } from './routes/conversations.js';
import { healthRouter } from './routes/health.js';

export function createApp() {
  const app = express();

  app.set('trust proxy', true);
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  app.use('/api/health', healthRouter);
  app.use('/api/characters', charactersRouter);
  app.use('/api/conversations', conversationsRouter);
  app.use('/api/chat', chatRouter);
  app.use('/characters', characterAssetsRouter);

  app.use(express.static(FRONTEND_DIR));

  app.get(/^\/(?!api\/).*/, (_req, res) => {
    res.sendFile(INDEX_HTML_PATH);
  });

  return app;
}
