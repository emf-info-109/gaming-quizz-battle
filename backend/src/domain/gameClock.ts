/**
 * Horloge d'une partie multijoueur – fonction PURE, sans timer.
 *
 * L'état courant se déduit uniquement de :
 *   - l'instant de démarrage (started_at, stocké en base),
 *   - l'heure actuelle du serveur MySQL (NOW(3)),
 *   - les durées enregistrées dans la partie.
 *
 * N'importe quelle instance (WEB-01, WEB-02...) calcule donc exactement le même
 * état, même si elle vient de redémarrer : aucun setTimeout n'est nécessaire.
 *
 *  started_at
 *     |-- countdown --|-- Q1 question --|grace|-- Q1 reveal --|-- Q2 question --| ...
 *
 * La "grace" absorbe la latence réseau : une réponse partie juste avant la fin
 * du chrono est acceptée, et la bonne réponse n'est révélée qu'après cette marge.
 */
export const ANSWER_GRACE_MS = 400;

export type GameStatus = 'lobby' | 'in_progress' | 'finished' | 'cancelled';
export type Phase = 'lobby' | 'countdown' | 'question' | 'reveal' | 'finished' | 'cancelled';

export interface ClockInput {
  status: GameStatus;
  /** Millisecondes écoulées depuis started_at selon l'horloge MySQL (null si non démarrée). */
  elapsedMs: number | null;
  questionCount: number;
  questionDurationMs: number;
  revealDurationMs: number;
  countdownMs: number;
}

export interface ClockState {
  phase: Phase;
  /** Index (0-based) de la question courante, -1 avant la première question. */
  questionIndex: number;
  /** Temps restant affiché au joueur pour la phase courante (ms). */
  phaseRemainingMs: number;
  /** Les réponses à la question courante sont-elles encore acceptées ? */
  acceptingAnswers: boolean;
  /** Millisecondes écoulées depuis l'ouverture de la question courante. */
  questionElapsedMs: number;
  /** Nombre de questions dont la correction est visible (pour les scores affichés). */
  revealedCount: number;
}

export function totalGameDurationMs(i: Pick<ClockInput, 'questionCount' | 'questionDurationMs' | 'revealDurationMs' | 'countdownMs'>): number {
  return i.countdownMs + i.questionCount * (i.questionDurationMs + i.revealDurationMs);
}

export function computeClock(input: ClockInput): ClockState {
  const idle = (phase: Phase, revealedCount = 0): ClockState => ({
    phase,
    questionIndex: -1,
    phaseRemainingMs: 0,
    acceptingAnswers: false,
    questionElapsedMs: 0,
    revealedCount,
  });

  if (input.status === 'cancelled') return idle('cancelled');
  if (input.status === 'lobby' || input.elapsedMs === null) return idle('lobby');
  if (input.status === 'finished') return idle('finished', input.questionCount);

  const elapsed = Math.max(0, input.elapsedMs);
  if (elapsed < input.countdownMs) {
    return { ...idle('countdown'), phaseRemainingMs: input.countdownMs - elapsed };
  }

  const slot = input.questionDurationMs + input.revealDurationMs;
  const sinceFirst = elapsed - input.countdownMs;
  const index = Math.floor(sinceFirst / slot);
  if (index >= input.questionCount) return idle('finished', input.questionCount);

  const inSlot = sinceFirst - index * slot;
  // La marge de grâce ne peut pas dépasser la durée de révélation
  const grace = Math.min(ANSWER_GRACE_MS, Math.floor(input.revealDurationMs / 2));
  const acceptingAnswers = inSlot < input.questionDurationMs + grace;

  if (acceptingAnswers) {
    return {
      phase: 'question',
      questionIndex: index,
      phaseRemainingMs: Math.max(0, input.questionDurationMs - inSlot),
      acceptingAnswers: true,
      questionElapsedMs: inSlot,
      revealedCount: index,
    };
  }
  return {
    phase: 'reveal',
    questionIndex: index,
    phaseRemainingMs: slot - inSlot,
    acceptingAnswers: false,
    questionElapsedMs: inSlot,
    revealedCount: index + 1,
  };
}
