/**
 * Client HTTP de l'API.
 *  - URL toujours relatives (/api/...) : fonctionne derrière Nginx/HAProxy sans configuration.
 *  - Chaque réponse est mesurée et alimente le tableau de bord Cloud (lib/metrics.ts).
 */
import { recordRequest } from './metrics';
import { getToken } from './session';
import type {
  Category,
  GlobalStats,
  InstanceInfo,
  LeaderboardEntry,
  MultiGameState,
  OpenGame,
  Player,
  PlayerStats,
  SoloAnswerResult,
  SoloCreated,
  SoloNext,
  SoloResults,
  SoloState,
} from './types';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH';
  body?: unknown;
  signal?: AbortSignal;
  /** La requête part même si la page se ferme (fermeture d'onglet). */
  keepalive?: boolean;
}

export interface ApiResponse<T> {
  data: T;
  instance: string | null;
  durationMs: number;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<ApiResponse<T>> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = { Accept: 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  const start = performance.now();
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
      keepalive: options.keepalive,
      cache: 'no-store',
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    recordRequest({ at: Date.now(), method, path, status: 0, durationMs: performance.now() - start, instance: null });
    throw new ApiError(0, 'NETWORK_ERROR', 'Serveur injoignable. Vérifie ta connexion.');
  }
  const durationMs = performance.now() - start;
  const instance = res.headers.get('X-Instance-Name');
  recordRequest({ at: Date.now(), method, path: path.split('?')[0]!, status: res.status, durationMs, instance });

  let payload: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }
  if (!res.ok) {
    const err = (payload as { error?: { code?: string; message?: string } } | null)?.error;
    throw new ApiError(
      res.status,
      err?.code ?? `HTTP_${res.status}`,
      err?.message ?? (res.status >= 500 ? 'Le serveur a rencontré une erreur.' : `Erreur HTTP ${res.status}`),
    );
  }
  return { data: payload as T, instance, durationMs };
}

const get = async <T>(path: string, signal?: AbortSignal) => (await apiRequest<T>(path, { signal })).data;
const post = async <T>(path: string, body: unknown = {}) => (await apiRequest<T>(path, { method: 'POST', body })).data;

export const api = {
  instance: () => apiRequest<InstanceInfo>('/api/instance'),
  diagPing: (signal?: AbortSignal) => apiRequest<{ instance: string }>('/api/diag/ping', { signal }),
  stats: () => get<GlobalStats>('/api/stats'),
  categories: () => get<{ categories: Category[] }>('/api/categories').then((r) => r.categories),
  leaderboard: (category: string) =>
    get<{ category: string; entries: LeaderboardEntry[] }>(`/api/leaderboard?category=${encodeURIComponent(category)}&limit=50`),

  createPlayer: (pseudo: string, avatar: string) => post<{ player: Player; token: string }>('/api/players', { pseudo, avatar }),
  me: () => get<{ player: Player }>('/api/players/me').then((r) => r.player),
  updateMe: async (changes: Partial<Pick<Player, 'pseudo' | 'avatar'>>) =>
    (await apiRequest<{ player: Player }>('/api/players/me', { method: 'PATCH', body: changes })).data.player,
  myStats: () => get<{ stats: PlayerStats }>('/api/players/me/stats').then((r) => r.stats),

  createSolo: (category: string) => post<SoloCreated>('/api/solo/games', { category }),
  soloState: (id: string) => get<SoloState>(`/api/solo/games/${id}`),
  soloNext: (id: string) => post<SoloNext>(`/api/solo/games/${id}/next`),
  soloAnswer: (id: string, position: number, choice: number | null) =>
    post<SoloAnswerResult>(`/api/solo/games/${id}/answers`, { position, choice }),
  soloResults: (id: string) => get<SoloResults>(`/api/solo/games/${id}/results`),

  createMulti: (category: string, options: { name?: string; isPublic?: boolean } = {}) =>
    post<{ gameId: string; code: string; name: string }>('/api/games', { category, ...options }),
  openGames: (signal?: AbortSignal) => get<{ games: OpenGame[] }>('/api/games', signal).then((r) => r.games),
  joinMulti: (code: string) => post<{ code: string; alreadyJoined: boolean }>('/api/games/join', { code }),
  multiState: (code: string, signal?: AbortSignal, afterMessageId?: number) =>
    get<MultiGameState>(
      `/api/games/${code}${afterMessageId !== undefined ? `?afterMessageId=${afterMessageId}` : ''}`,
      signal,
    ),
  /** Envoyé à la fermeture de l'onglet : « je pars » (le serveur laisse quelques secondes pour revenir). */
  markAway: (code: string) => {
    void apiRequest(`/api/games/${code}/away`, { method: 'POST', body: {}, keepalive: true }).catch(() => undefined);
  },
  sendChat: (code: string, text: string) => post<{ id: number }>(`/api/games/${code}/messages`, { text }),
  startMulti: (code: string) => post<{ started: boolean }>(`/api/games/${code}/start`),
  leaveMulti: (code: string) => post<{ left: boolean }>(`/api/games/${code}/leave`),
  answerMulti: (code: string, position: number, choice: number) =>
    post<{ accepted: boolean }>(`/api/games/${code}/answers`, { position, choice }),
};

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return 'Une erreur inattendue est survenue.';
}
