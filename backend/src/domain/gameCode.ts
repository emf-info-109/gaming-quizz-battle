import { randomInt } from 'node:crypto';

/**
 * Codes de partie : 6 caractères sans caractères ambigus (pas de 0/O, 1/I/L).
 * 31^6 ≈ 887 millions de combinaisons ; l'unicité est garantie par une
 * contrainte UNIQUE en base (en cas de collision, on retire un code).
 */
export const GAME_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const GAME_CODE_LENGTH = 6;
export const GAME_CODE_REGEX = new RegExp(`^[${GAME_CODE_ALPHABET}]{${GAME_CODE_LENGTH}}$`);

export function generateGameCode(): string {
  let code = '';
  for (let i = 0; i < GAME_CODE_LENGTH; i++) {
    code += GAME_CODE_ALPHABET[randomInt(GAME_CODE_ALPHABET.length)];
  }
  return code;
}

export function normalizeGameCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[\s-]/g, '');
}
