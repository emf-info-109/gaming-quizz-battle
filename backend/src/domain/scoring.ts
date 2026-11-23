/**
 * Calcul des points – exécuté UNIQUEMENT côté serveur.
 *
 * Bonne réponse : 500 points de base + jusqu'à 500 points de bonus de rapidité
 * proportionnels au temps restant. Mauvaise réponse ou temps écoulé : 0 point.
 */
export const BASE_POINTS = 500;
export const MAX_SPEED_BONUS = 500;

export function computePoints(isCorrect: boolean, responseMs: number, durationMs: number): number {
  if (!isCorrect || durationMs <= 0) return 0;
  const clamped = Math.min(Math.max(responseMs, 0), durationMs);
  const remainingRatio = (durationMs - clamped) / durationMs;
  return BASE_POINTS + Math.round(MAX_SPEED_BONUS * remainingRatio);
}
