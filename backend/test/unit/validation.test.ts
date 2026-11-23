import { describe, expect, it } from 'vitest';
import { GAME_CODE_REGEX, generateGameCode } from '../../src/domain/gameCode.js';
import { answerSchema, createPlayerSchema, gameCodeSchema, updatePlayerSchema } from '../../src/domain/validation.js';
import { buildConfig } from '../../src/config.js';

describe('validation des entrées', () => {
  it('accepte un pseudo valide et le normalise', () => {
    expect(createPlayerSchema.parse({ pseudo: '  Léa   la  Pro ', avatar: 'fox' })).toEqual({
      pseudo: 'Léa la Pro',
      avatar: 'fox',
    });
  });

  it.each(['ab', 'x'.repeat(21), '<script>', 'a"b', "Robert'); DROP TABLE players;--", '   '])(
    'refuse le pseudo %s',
    (pseudo) => {
      expect(createPlayerSchema.safeParse({ pseudo, avatar: 'fox' }).success).toBe(false);
    },
  );

  it('refuse un avatar inconnu et les champs supplémentaires (ex : score)', () => {
    expect(createPlayerSchema.safeParse({ pseudo: 'Valide', avatar: 'mario' }).success).toBe(false);
    expect(createPlayerSchema.safeParse({ pseudo: 'Valide', avatar: 'fox', score: 99999 }).success).toBe(false);
    expect(updatePlayerSchema.safeParse({ score: 99999 }).success).toBe(false);
  });

  it('normalise et valide les codes de partie', () => {
    expect(gameCodeSchema.parse(' abc-234 ')).toBe('ABC234');
    expect(gameCodeSchema.safeParse('ABC12').success).toBe(false);
    expect(gameCodeSchema.safeParse('ABCDE0').success).toBe(false); // 0 exclu (ambigu)
  });

  it('valide les réponses', () => {
    expect(answerSchema.parse({ position: 0, choice: 3 })).toEqual({ position: 0, choice: 3 });
    expect(answerSchema.safeParse({ position: 0, choice: 4 }).success).toBe(false);
    expect(answerSchema.safeParse({ position: 0, choice: '1' }).success).toBe(false);
  });

  it('génère des codes à 6 caractères sans ambiguïté', () => {
    for (let i = 0; i < 200; i++) expect(generateGameCode()).toMatch(GAME_CODE_REGEX);
  });
});

describe('configuration', () => {
  it('lit INSTANCE_NAME et les valeurs par défaut', () => {
    const c = buildConfig({ INSTANCE_NAME: 'WEB-02', DB_PASSWORD: 'x' });
    expect(c.instanceName).toBe('WEB-02');
    expect(c.game.questionDurationMs).toBe(15_000);
    expect(c.game.maxPlayersPerGame).toBe(30);
  });
  it('refuse une configuration invalide', () => {
    expect(() => buildConfig({ PORT: 'abc' })).toThrow(/Configuration invalide/);
    expect(() => buildConfig({ INSTANCE_NAME: 'WEB 01 <b>' })).toThrow(/INSTANCE_NAME/);
  });
});
