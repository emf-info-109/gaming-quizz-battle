import type { RequestHandler } from 'express';
import type { Pool } from '../db/pool.js';
import { unauthorized } from '../http/errors.js';
import { findPlayerByToken, isWellFormedToken, touchPlayer } from '../services/playerService.js';

/**
 * Identification STATELESS des joueurs.
 *
 * Le navigateur envoie "Authorization: Bearer <jeton>". L'instance calcule le
 * SHA-256 du jeton et le cherche dans MySQL. Aucune session en mémoire : la
 * requête suivante peut être traitée par n'importe quelle autre instance.
 */
export function requirePlayer(pool: Pool): RequestHandler {
  return async (req, _res, next) => {
    const header = req.get('authorization') ?? '';
    const match = /^Bearer\s+(\S+)$/i.exec(header);
    const token = match?.[1];
    if (!token || !isWellFormedToken(token)) throw unauthorized();

    const player = await findPlayerByToken(pool, token);
    if (!player) throw unauthorized('Jeton de joueur inconnu ou expiré. Recrée ton profil.');

    req.player = player;
    // Mise à jour "dernière activité" (sert au compteur de joueurs connectés).
    await touchPlayer(pool, player.id);
    next();
  };
}
