import { beforeEach, describe, expect, it } from 'vitest';
import { getMetricsSnapshot, instanceColor, recordRequest, resetMetrics } from '../src/lib/metrics';

describe('métriques observées par le navigateur', () => {
  beforeEach(() => resetMetrics());

  it('compte les requêtes par instance et calcule la moyenne', () => {
    recordRequest({ at: 1, method: 'GET', path: '/api/a', status: 200, durationMs: 10, instance: 'WEB-01' });
    recordRequest({ at: 2, method: 'GET', path: '/api/a', status: 200, durationMs: 30, instance: 'WEB-02' });
    recordRequest({ at: 3, method: 'GET', path: '/api/a', status: 200, durationMs: 20, instance: 'WEB-01' });
    const s = getMetricsSnapshot();
    expect(s.total).toBe(3);
    expect(s.byInstance).toEqual({ 'WEB-01': 2, 'WEB-02': 1 });
    expect(s.avgDurationMs).toBe(20);
    expect(s.lastInstance).toBe('WEB-01');
    expect(s.httpErrors).toBe(0);
  });

  it('distingue erreurs HTTP et erreurs réseau, sans inventer d’instance', () => {
    recordRequest({ at: 1, method: 'GET', path: '/api/a', status: 503, durationMs: 5, instance: 'WEB-02' });
    recordRequest({ at: 2, method: 'GET', path: '/api/a', status: 0, durationMs: 1000, instance: null });
    const s = getMetricsSnapshot();
    expect(s.httpErrors).toBe(1);
    expect(s.networkErrors).toBe(1);
    expect(s.byInstance).toEqual({ 'WEB-02': 1, 'aucune réponse': 1 });
    // Les erreurs réseau n'entrent pas dans le temps moyen
    expect(s.avgDurationMs).toBe(5);
    expect(s.lastInstance).toBe('WEB-02');
  });

  it('attribue des couleurs stables aux instances', () => {
    expect(instanceColor('WEB-01')).toBe(instanceColor('WEB-01'));
    expect(instanceColor('WEB-01')).not.toBe(instanceColor('WEB-02'));
    expect(instanceColor(null)).toBe('#64748b');
  });
});
