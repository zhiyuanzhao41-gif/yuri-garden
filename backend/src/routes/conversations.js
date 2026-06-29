import { Router } from 'express';
import { DEFAULT_CHARACTER_ID } from '../config/constants.js';
import {
  createConversationForCharacter,
  deleteConversation,
  listConversationSummaries,
  readConversation,
  updateConversationMessages,
} from '../services/conversationService.js';
import { handleJsonError } from '../utils/errors.js';
import { isCharacterId } from '../utils/validation.js';

export const conversationsRouter = Router();

conversationsRouter.get('/', async (req, res) => {
  try {
    const characterId = isCharacterId(req.query.characterId)
      ? req.query.characterId
      : DEFAULT_CHARACTER_ID;

    res.json({ conversations: await listConversationSummaries(req.user.id, characterId) });
  } catch (error) {
    handleJsonError(res, error);
  }
});

conversationsRouter.post('/', async (req, res) => {
  try {
    const conversation = await createConversationForCharacter(req.user.id, req.body?.characterId);
    res.status(201).json({ conversation });
  } catch (error) {
    handleJsonError(res, error);
  }
});

conversationsRouter.get('/:id', async (req, res) => {
  try {
    res.json({
      conversation: await readConversation(req.user.id, req.params.id, req.query.characterId),
    });
  } catch (error) {
    handleJsonError(res, error);
  }
});

conversationsRouter.patch('/:id', async (req, res) => {
  const { messages } = req.body ?? {};

  if (!Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages must be an array' });
  }

  try {
    const conversation = await updateConversationMessages(
      req.user.id,
      req.params.id,
      req.body?.characterId,
      messages,
    );
    res.json({ conversation });
  } catch (error) {
    handleJsonError(res, error);
  }
});

conversationsRouter.delete('/:id', async (req, res) => {
  try {
    await deleteConversation(req.user.id, req.params.id, req.query.characterId);
    res.json({ ok: true });
  } catch (error) {
    handleJsonError(res, error);
  }
});
