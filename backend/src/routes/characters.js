import { Router } from 'express';
import {
  characterPath,
  listCharacters,
  publicCharacter,
  readCharacter,
} from '../services/characterService.js';
import { handleJsonError } from '../utils/errors.js';
import { isCharacterAssetFile, isCharacterId } from '../utils/validation.js';

export const charactersRouter = Router();
export const characterAssetsRouter = Router();

charactersRouter.get('/', async (_req, res) => {
  try {
    res.json({ characters: (await listCharacters()).map(publicCharacter) });
  } catch (error) {
    handleJsonError(res, error);
  }
});

charactersRouter.get('/:id', async (req, res) => {
  try {
    const character = await readCharacter(req.params.id);
    if (!character.enabled) {
      return res.status(404).json({ error: 'Character not found' });
    }
    res.json({ character: publicCharacter(character) });
  } catch (error) {
    handleJsonError(res, error);
  }
});

characterAssetsRouter.get('/:id/:fileName', (req, res) => {
  const { id, fileName } = req.params;

  if (!isCharacterId(id) || fileName.includes('..') || !isCharacterAssetFile(fileName)) {
    return res.status(404).end();
  }

  res.sendFile(characterPath(id, fileName));
});
