import { describe, expect, it } from 'vitest';
import { ANSWER_GRACE_MS, computeClock, totalGameDurationMs, type ClockInput } from '../../src/domain/gameClock.js';

const base: ClockInput = {
  status: 'in_progress',
  elapsedMs: 0,
  questionCount: 3,
  questionDurationMs: 15_000,
  revealDurationMs: 6_000,
  countdownMs: 4_000,
};
const at = (elapsedMs: number | null, overrides: Partial<ClockInput> = {}) =>
  computeClock({ ...base, ...overrides, elapsedMs });

describe('computeClock – état d’une partie calculé sans timer', () => {
  it('lobby tant que la partie n’a pas démarré', () => {
    expect(at(null, { status: 'lobby' }).phase).toBe('lobby');
  });

  it('compte à rebours avant la première question', () => {
    const s = at(1_000);
    expect(s.phase).toBe('countdown');
    expect(s.phaseRemainingMs).toBe(3_000);
    expect(s.acceptingAnswers).toBe(false);
  });

  it('première question ouverte juste après le compte à rebours', () => {
    const s = at(4_000);
    expect(s).toMatchObject({ phase: 'question', questionIndex: 0, phaseRemainingMs: 15_000, acceptingAnswers: true });
    expect(s.revealedCount).toBe(0);
  });

  it('accepte encore les réponses pendant la marge de grâce, chrono affiché à 0', () => {
    const s = at(4_000 + 15_000 + ANSWER_GRACE_MS - 1);
    expect(s.phase).toBe('question');
    expect(s.phaseRemainingMs).toBe(0);
    expect(s.acceptingAnswers).toBe(true);
  });

  it('passe en révélation après la marge de grâce', () => {
    const s = at(4_000 + 15_000 + ANSWER_GRACE_MS);
    expect(s).toMatchObject({ phase: 'reveal', questionIndex: 0, acceptingAnswers: false, revealedCount: 1 });
  });

  it('enchaîne sur la question suivante', () => {
    const s = at(4_000 + 21_000 + 500);
    expect(s).toMatchObject({ phase: 'question', questionIndex: 1, revealedCount: 1 });
    expect(s.questionElapsedMs).toBe(500);
  });

  it('se termine après la dernière révélation', () => {
    const total = totalGameDurationMs(base);
    expect(total).toBe(4_000 + 3 * 21_000);
    expect(at(total - 1).phase).toBe('reveal');
    expect(at(total)).toMatchObject({ phase: 'finished', revealedCount: 3 });
  });

  it('statuts terminés / annulés', () => {
    expect(at(10, { status: 'finished' }).phase).toBe('finished');
    expect(at(10, { status: 'cancelled' }).phase).toBe('cancelled');
  });

  it('un léger décalage négatif d’horloge est traité comme 0', () => {
    expect(at(-50).phase).toBe('countdown');
  });
});
