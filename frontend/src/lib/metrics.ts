/**
 * Mesures RÉELLEMENT observées par ce navigateur.
 *
 * Chaque appel à l'API (lib/api.ts) enregistre : l'instance qui a répondu
 * (en-tête X-Instance-Name), le code HTTP et le temps de réponse mesuré.
 * Rien n'est inventé : si une réponse n'a pas d'en-tête, l'instance est "inconnue".
 *
 * ⚠️ Ces chiffres ne concernent que les requêtes de CE navigateur : ils ne
 * représentent pas le trafic global de l'infrastructure.
 */
export interface RequestRecord {
  at: number;
  method: string;
  path: string;
  status: number; // 0 = erreur réseau (aucune réponse)
  durationMs: number;
  instance: string | null;
}

export interface MetricsSnapshot {
  total: number;
  httpErrors: number;
  networkErrors: number;
  avgDurationMs: number;
  byInstance: Record<string, number>;
  lastInstance: string | null;
  lastRecord: RequestRecord | null;
  recent: RequestRecord[];
}

const STORAGE_KEY = 'gqb.metrics.v1';
const MAX_RECENT = 200;

interface PersistedState {
  total: number;
  httpErrors: number;
  networkErrors: number;
  totalDurationMs: number;
  timedCount: number;
  byInstance: Record<string, number>;
  recent: RequestRecord[];
}

function emptyState(): PersistedState {
  return { total: 0, httpErrors: 0, networkErrors: 0, totalDurationMs: 0, timedCount: 0, byInstance: {}, recent: [] };
}

function load(): PersistedState {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) return { ...emptyState(), ...(JSON.parse(raw) as PersistedState) };
  } catch {
    /* stockage indisponible : on repart de zéro */
  }
  return emptyState();
}

let state: PersistedState = load();
let snapshot: MetricsSnapshot = computeSnapshot();
const listeners = new Set<() => void>();
let persistTimer: ReturnType<typeof setTimeout> | undefined;

function computeSnapshot(): MetricsSnapshot {
  const last = state.recent[state.recent.length - 1] ?? null;
  const lastWithInstance = [...state.recent].reverse().find((r) => r.instance);
  return {
    total: state.total,
    httpErrors: state.httpErrors,
    networkErrors: state.networkErrors,
    avgDurationMs: state.timedCount > 0 ? state.totalDurationMs / state.timedCount : 0,
    byInstance: { ...state.byInstance },
    lastInstance: lastWithInstance?.instance ?? null,
    lastRecord: last,
    recent: state.recent,
  };
}

function emit() {
  snapshot = computeSnapshot();
  listeners.forEach((l) => l());
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }, 300);
}

export function recordRequest(record: RequestRecord): void {
  state.total += 1;
  if (record.status === 0) state.networkErrors += 1;
  else if (record.status >= 400) state.httpErrors += 1;
  if (record.status !== 0) {
    state.totalDurationMs += record.durationMs;
    state.timedCount += 1;
  }
  const key = record.instance ?? (record.status === 0 ? 'aucune réponse' : 'inconnue');
  state.byInstance[key] = (state.byInstance[key] ?? 0) + 1;
  state.recent = [...state.recent, record].slice(-MAX_RECENT);
  emit();
}

export function resetMetrics(): void {
  state = emptyState();
  emit();
}

export function subscribeMetrics(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getMetricsSnapshot(): MetricsSnapshot {
  return snapshot;
}

/** Couleur stable par nom d'instance (WEB-01 = cyan, WEB-02 = violet...). */
const PALETTE = ['#22d3ee', '#9b5cff', '#2f7bff', '#f050c8', '#2ee59d', '#ffc94d'];
export function instanceColor(name: string | null): string {
  if (!name || name === 'inconnue' || name === 'aucune réponse') return '#64748b';
  const m = /(\d+)\s*$/.exec(name);
  if (m) return PALETTE[(Number(m[1]) - 1 + PALETTE.length) % PALETTE.length]!;
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length]!;
}
