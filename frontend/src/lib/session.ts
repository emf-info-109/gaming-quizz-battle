/**
 * Jeton du joueur conservé dans le navigateur (localStorage).
 * Le serveur ne garde AUCUNE session en mémoire : ce jeton suffit à n'importe
 * quelle instance pour identifier le joueur (via son empreinte stockée en base).
 */
import type { Player } from './types';

const TOKEN_KEY = 'gqb.token';
const PLAYER_KEY = 'gqb.player';

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function getCachedPlayer(): Player | null {
  try {
    const raw = localStorage.getItem(PLAYER_KEY);
    return raw ? (JSON.parse(raw) as Player) : null;
  } catch {
    return null;
  }
}

export function saveSession(token: string | null, player: Player | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
    if (player) localStorage.setItem(PLAYER_KEY, JSON.stringify(player));
    else localStorage.removeItem(PLAYER_KEY);
  } catch {
    /* navigation privée stricte : la session ne durera que le temps de l'onglet */
  }
}
