import { useEffect, useState } from 'react';

/**
 * Compte à rebours fluide côté navigateur.
 * La valeur de départ vient TOUJOURS du serveur (temps restant en ms) : on ne
 * dépend donc pas de l'horloge de l'ordinateur du joueur.
 *
 * `syncKey` change à chaque nouvelle donnée serveur (nouvelle question, nouveau
 * poll). Tant que l'intervalle n'a pas encore tourné pour cette clé, on renvoie
 * directement `remainingMs` : une ancienne valeur (ex : 0 de la question
 * précédente) n'est jamais renvoyée pour une nouvelle question.
 */
export function useCountdown(remainingMs: number, syncKey: unknown, running = true): number {
  const [state, setState] = useState({ key: syncKey, left: remainingMs });

  useEffect(() => {
    const deadline = performance.now() + remainingMs;
    setState({ key: syncKey, left: remainingMs });
    if (!running) return;
    const id = setInterval(() => {
      const value = Math.max(0, deadline - performance.now());
      setState({ key: syncKey, left: value });
      if (value <= 0) clearInterval(id);
    }, 100);
    return () => clearInterval(id);
  }, [remainingMs, syncKey, running]);

  return Object.is(state.key, syncKey) ? state.left : remainingMs;
}
