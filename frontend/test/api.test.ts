import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '../src/lib/api';
import { getMetricsSnapshot, resetMetrics } from '../src/lib/metrics';
import { saveSession } from '../src/lib/session';

function mockFetch(status: number, body: unknown, instance: string | null) {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (instance) headers.set('X-Instance-Name', instance);
  return vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status, headers }));
}

describe('client API', () => {
  beforeEach(() => {
    resetMetrics();
    saveSession(null, null);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('utilise des URL relatives et enregistre l’instance qui a répondu', async () => {
    const fetchMock = mockFetch(200, { instance: 'WEB-02' }, 'WEB-02');
    vi.stubGlobal('fetch', fetchMock);
    const res = await api.instance();
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/instance');
    expect(res.instance).toBe('WEB-02');
    expect(getMetricsSnapshot().byInstance).toEqual({ 'WEB-02': 1 });
  });

  it('envoie le jeton du joueur dans l’en-tête Authorization', async () => {
    saveSession('tok_' + 'x'.repeat(39), { id: '1', pseudo: 'Test', avatar: 'fox' });
    const fetchMock = mockFetch(200, { player: { id: '1', pseudo: 'Test', avatar: 'fox' } }, 'WEB-01');
    vi.stubGlobal('fetch', fetchMock);
    await api.me();
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toMatch(/^Bearer tok_/);
  });

  it('transforme les erreurs JSON de l’API en ApiError', async () => {
    vi.stubGlobal('fetch', mockFetch(409, { error: { code: 'GAME_FULL', message: 'Complet' } }, 'WEB-01'));
    await expect(api.joinMulti('ABCDEF')).rejects.toMatchObject({ status: 409, code: 'GAME_FULL', message: 'Complet' });
    expect(getMetricsSnapshot().httpErrors).toBe(1);
  });

  it('signale une erreur réseau', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const err = await api.stats().catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe('NETWORK_ERROR');
    expect(getMetricsSnapshot().networkErrors).toBe(1);
  });
});
