/**
 * Schémas de validation des entrées (zod). Toute donnée venant du client est
 * validée ici avant d'atteindre la base de données.
 */
import { z } from 'zod';
import { AVATARS } from './avatars.js';
import { GAME_CODE_REGEX, normalizeGameCode } from './gameCode.js';

/** Lettres (toutes langues), chiffres, espace, point, tiret, underscore. */
const PSEUDO_REGEX = /^[\p{L}\p{N}][\p{L}\p{N} ._-]*$/u;

export const pseudoSchema = z
  .string()
  .transform((s) => s.normalize('NFC').trim().replace(/\s+/g, ' '))
  .pipe(
    z
      .string()
      .min(3, 'Le pseudo doit contenir au moins 3 caractères.')
      .max(20, 'Le pseudo doit contenir au maximum 20 caractères.')
      .regex(PSEUDO_REGEX, 'Le pseudo contient des caractères non autorisés.'),
  );

export const avatarSchema = z.enum(AVATARS, { message: 'Avatar inconnu.' });

export const createPlayerSchema = z.object({ pseudo: pseudoSchema, avatar: avatarSchema }).strict();

export const updatePlayerSchema = z
  .object({ pseudo: pseudoSchema.optional(), avatar: avatarSchema.optional() })
  .strict()
  .refine((v) => v.pseudo !== undefined || v.avatar !== undefined, 'Rien à modifier.');

/** "all" (ou "mixed") = toutes les catégories. */
export const categorySlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9-]{1,40}$/, 'Catégorie invalide.');

/** Nom de partie : lettres, chiffres, espaces, ponctuation courante et emojis. */
const GAME_NAME_REGEX = /^[\p{L}\p{N}\p{Extended_Pictographic}][\p{L}\p{N}\p{Extended_Pictographic}\u200d\ufe0f '’!?.,:;_#&()+-]*$/u;

export const gameNameSchema = z
  .string()
  .transform((s) => s.normalize('NFC').trim().replace(/\s+/g, ' '))
  .pipe(
    z
      .string()
      .min(3, 'Le nom de la partie doit contenir au moins 3 caractères.')
      .max(40, 'Le nom de la partie doit contenir au maximum 40 caractères.')
      .regex(GAME_NAME_REGEX, 'Le nom de la partie contient des caractères non autorisés.'),
  );

export const createGameSchema = z
  .object({
    category: categorySlugSchema,
    /** Facultatif : « Partie de <pseudo> » par défaut. */
    name: z
      .string()
      .optional()
      .transform((s) => (s && s.trim() ? s : undefined))
      .pipe(gameNameSchema.optional()),
    /** true = visible dans la liste des parties en attente ; false = uniquement avec le code. */
    isPublic: z.boolean().default(true),
  })
  .strict();

/**
 * Message du chat : caractères de contrôle et caractères d'inversion du sens
 * d'écriture (utilisés pour maquiller un texte) supprimés, espaces normalisés.
 */
export const chatMessageSchema = z
  .object({
    text: z
      .string()
      .transform((s) =>
        s
          .normalize('NFC')
          .replace(/[\p{Cc}\u202a-\u202e\u2066-\u2069]/gu, ' ')
          .trim()
          .replace(/\s+/g, ' '),
      )
      .pipe(z.string().min(1, 'Le message est vide.').max(200, 'Le message est trop long (200 caractères maximum).')),
  })
  .strict();

/** Polling de l'état : ne renvoyer que les messages plus récents que celui-ci. */
export const gameStateQuerySchema = z.object({
  afterMessageId: z.coerce.number().int().min(0).optional(),
});

export const gameCodeSchema = z
  .string()
  .transform(normalizeGameCode)
  .pipe(z.string().regex(GAME_CODE_REGEX, 'Code de partie invalide (6 caractères).'));

export const joinGameSchema = z.object({ code: gameCodeSchema }).strict();

export const answerSchema = z
  .object({
    position: z.number().int().min(0).max(50),
    /** null = temps écoulé (mode solo uniquement) */
    choice: z.number().int().min(0).max(3).nullable(),
  })
  .strict();

export const uuidSchema = z.uuid({ message: 'Identifiant invalide.' });

export const leaderboardQuerySchema = z.object({
  category: categorySlugSchema.default('all'),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
