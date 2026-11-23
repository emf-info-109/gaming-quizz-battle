import { describe, expect, it } from 'vitest';
import { BASE_POINTS, MAX_SPEED_BONUS, computePoints } from '../../src/domain/scoring.js';

describe('computePoints', () => {
  it('0 point pour une mauvaise réponse', () => {
    expect(computePoints(false, 100, 15_000)).toBe(0);
  });
  it('maximum pour une réponse instantanée', () => {
    expect(computePoints(true, 0, 15_000)).toBe(BASE_POINTS + MAX_SPEED_BONUS);
  });
  it('points de base pour une réponse à la dernière milliseconde', () => {
    expect(computePoints(true, 15_000, 15_000)).toBe(BASE_POINTS);
    expect(computePoints(true, 20_000, 15_000)).toBe(BASE_POINTS);
  });
  it('bonus proportionnel au temps restant', () => {
    expect(computePoints(true, 7_500, 15_000)).toBe(750);
  });
});
