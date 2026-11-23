import type { AuthPlayer } from './services/playerService.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Identifiant unique de la requête (renvoyé dans X-Request-Id). */
      requestId: string;
      /** Joueur authentifié (renseigné par le middleware requirePlayer). */
      player?: AuthPlayer;
    }
  }
}

export {};
