import { useEffect, useRef, useState } from 'react';
import { Button } from '../components/Button';
import { Alert, PageTitle, StatTile } from '../components/Feedback';
import { useMetrics } from '../hooks/useMetrics';
import { api, ApiError } from '../lib/api';
import { formatMs, formatUptime } from '../lib/format';
import { instanceColor, resetMetrics, type RequestRecord } from '../lib/metrics';
import type { InstanceInfo } from '../lib/types';

/** Limites de sécurité du générateur de requêtes */
const RUN_SIZES = [10, 50, 100] as const;
const CONCURRENCY = 4;
const COOLDOWN_MS = 3000;

interface RunResult {
  size: number;
  done: number;
  byInstance: Record<string, number>;
  errors: number;
  totalMs: number;
  stoppedReason: string | null;
  running: boolean;
}

function DistributionBars({ counts, total }: { counts: Record<string, number>; total: number }) {
  const entries = Object.entries(counts).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) return <p className="text-sm text-slate-500">Aucune requête observée pour l’instant.</p>;
  return (
    <ul className="space-y-3">
      {entries.map(([name, n]) => {
        const pct = total > 0 ? (n / total) * 100 : 0;
        return (
          <li key={name}>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 font-mono font-semibold">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: instanceColor(name) }} aria-hidden="true" />
                {name}
              </span>
              <span className="tabular-nums text-slate-400">
                {n} · {pct.toFixed(1)} %
              </span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-ink-700">
              <div
                className="h-full rounded-full transition-[width] duration-500"
                style={{ width: `${pct}%`, background: instanceColor(name) }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function connectionState(last: RequestRecord | null, now: number) {
  if (!last) return { label: 'Inconnu', tone: 'text-slate-400', dot: '#64748b' };
  if (last.status === 0) return { label: 'Injoignable', tone: 'text-neon-red', dot: '#ff4d6d' };
  if (last.status >= 500) return { label: 'Dégradé', tone: 'text-neon-amber', dot: '#ffc94d' };
  if (now - last.at > 60_000) return { label: 'Inactif', tone: 'text-slate-300', dot: '#94a3b8' };
  return { label: 'Connecté', tone: 'text-neon-green', dot: '#2ee59d' };
}

export function CloudDashboardPage() {
  const metrics = useMetrics();
  const [now, setNow] = useState(Date.now());
  const [info, setInfo] = useState<InstanceInfo | null>(null);
  const [readyResult, setReadyResult] = useState<{ status: number; instance: string | null; body: string } | null>(null);
  const [run, setRun] = useState<RunResult | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [monitoring, setMonitoring] = useState(false);
  const [timeline, setTimeline] = useState<Array<{ at: number; instance: string | null; ok: boolean }>>([]);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    api.instance().then((r) => setInfo(r.data)).catch(() => setInfo(null));
    return () => abortRef.current?.abort();
  }, []);

  // Surveillance continue : 1 requête par seconde, idéale pour observer un failover.
  useEffect(() => {
    if (!monitoring) return;
    let alive = true;
    const tick = async () => {
      let entry: { at: number; instance: string | null; ok: boolean };
      try {
        const r = await api.instance();
        entry = { at: Date.now(), instance: r.instance, ok: true };
        setInfo(r.data);
      } catch {
        entry = { at: Date.now(), instance: null, ok: false };
      }
      if (alive) setTimeline((t) => [...t, entry].slice(-60));
    };
    void tick();
    const id = setInterval(tick, 1000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [monitoring]);

  async function checkReady() {
    try {
      const res = await fetch('/ready', { cache: 'no-store' });
      setReadyResult({ status: res.status, instance: res.headers.get('X-Instance-Name'), body: await res.text() });
    } catch {
      setReadyResult({ status: 0, instance: null, body: 'Aucune réponse (réseau)' });
    }
  }

  async function startRun(size: number) {
    if (run?.running || Date.now() < cooldownUntil) return;
    const controller = new AbortController();
    abortRef.current = controller;
    const result: RunResult = { size, done: 0, byInstance: {}, errors: 0, totalMs: 0, stoppedReason: null, running: true };
    setRun({ ...result });
    let next = 0;

    const worker = async () => {
      while (next < size && !controller.signal.aborted) {
        next++;
        try {
          const r = await api.diagPing(controller.signal);
          const key = r.instance ?? 'inconnue';
          result.byInstance[key] = (result.byInstance[key] ?? 0) + 1;
          result.totalMs += r.durationMs;
        } catch (err) {
          if ((err as Error).name === 'AbortError') return;
          result.errors++;
          if (err instanceof ApiError && err.status === 429) {
            result.stoppedReason = 'Limite de débit atteinte (HTTP 429) : génération interrompue.';
            controller.abort();
          }
        }
        result.done++;
        setRun({ ...result, byInstance: { ...result.byInstance } });
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    if (controller.signal.aborted && !result.stoppedReason) result.stoppedReason = 'Interrompu.';
    setRun({ ...result, byInstance: { ...result.byInstance }, running: false });
    setCooldownUntil(Date.now() + COOLDOWN_MS);
  }

  const conn = connectionState(metrics.lastRecord, now);
  const runOk = run ? Object.values(run.byInstance).reduce((a, b) => a + b, 0) : 0;
  const coolingDown = now < cooldownUntil;
  const recent = [...metrics.recent].reverse().slice(0, 12);

  return (
    <div className="space-y-6">
      <PageTitle kicker="Infrastructure" title="Tableau de bord Cloud">
        Observe quelle instance du backend traite tes requêtes : chaque réponse de l’API contient l’en-tête{' '}
        <code className="rounded bg-white/10 px-1.5 py-0.5 text-neon-cyan">X-Instance-Name</code>.
      </PageTitle>

      <Alert tone="info">
        Ces mesures sont calculées <strong>uniquement</strong> à partir des réponses reçues par <strong>ce navigateur</strong>{' '}
        (depuis l’ouverture de l’onglet). Elles ne représentent pas le trafic global de l’infrastructure : les autres joueurs,
        les health checks de HAProxy, etc. n’y figurent pas.
      </Alert>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatTile
          label="Dernière instance"
          value={
            <span className="flex items-center gap-2 font-mono text-xl">
              <span className="h-3 w-3 rounded-full" style={{ background: instanceColor(metrics.lastInstance) }} aria-hidden="true" />
              {metrics.lastInstance ?? '—'}
            </span>
          }
        />
        <StatTile label="Requêtes (navigateur)" value={metrics.total} accent="text-neon-cyan" />
        <StatTile label="Temps de réponse moyen" value={metrics.total ? formatMs(metrics.avgDurationMs) : '—'} hint="mesuré par le navigateur" />
        <StatTile
          label="Erreurs HTTP"
          value={metrics.httpErrors}
          accent={metrics.httpErrors ? 'text-neon-red' : 'text-white'}
          hint={`+ ${metrics.networkErrors} erreur(s) réseau`}
        />
        <StatTile
          label="Connexion backend"
          value={
            <span className={`flex items-center gap-2 text-xl ${conn.tone}`}>
              <span className="h-3 w-3 rounded-full" style={{ background: conn.dot }} aria-hidden="true" />
              {conn.label}
            </span>
          }
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card min-w-0 p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="font-display text-xl font-semibold text-white">Répartition observée</h2>
            <Button variant="ghost" size="sm" onClick={resetMetrics}>Réinitialiser</Button>
          </div>
          <DistributionBars counts={metrics.byInstance} total={metrics.total} />
        </section>

        <section className="card min-w-0 p-5">
          <h2 className="mb-1 font-display text-xl font-semibold text-white">Générateur de requêtes</h2>
          <p className="mb-4 text-sm text-slate-400">
            Envoie des requêtes <code className="text-slate-300">GET /api/diag/ping</code> ({CONCURRENCY} en parallèle, 100 max par
            série, pause de {COOLDOWN_MS / 1000} s entre deux séries, limite de débit côté serveur).
          </p>
          <div className="flex flex-wrap gap-2">
            {RUN_SIZES.map((n) => (
              <Button key={n} variant="secondary" onClick={() => void startRun(n)} disabled={run?.running || coolingDown}>
                {n} requêtes
              </Button>
            ))}
            {run?.running && (
              <Button variant="danger" onClick={() => abortRef.current?.abort()}>
                Stop
              </Button>
            )}
          </div>
          {coolingDown && !run?.running && <p className="mt-2 text-xs text-slate-500">Pause de sécurité…</p>}
          {run && (
            <div className="mt-5 space-y-4">
              <div>
                <div className="mb-1 flex justify-between text-xs text-slate-400">
                  <span>
                    {run.done}/{run.size} terminées
                  </span>
                  <span>
                    {runOk > 0 ? `moyenne ${formatMs(run.totalMs / runOk)}` : ''} {run.errors > 0 && `· ${run.errors} erreur(s)`}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-ink-700">
                  <div className="h-full bg-neon-cyan transition-[width]" style={{ width: `${(run.done / run.size) * 100}%` }} />
                </div>
              </div>
              <DistributionBars counts={run.byInstance} total={runOk} />
              {run.stoppedReason && <Alert tone="info">{run.stoppedReason}</Alert>}
            </div>
          )}
        </section>
      </div>

      <section className="card p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-semibold text-white">Surveillance continue</h2>
            <p className="text-sm text-slate-400">
              1 requête par seconde. Arrête une instance (<code className="text-slate-300">systemctl stop gaming-quiz</code>) et
              observe la bascule.
            </p>
          </div>
          <Button variant={monitoring ? 'danger' : 'secondary'} onClick={() => setMonitoring((m) => !m)}>
            {monitoring ? '■ Arrêter' : '▶ Démarrer'}
          </Button>
        </div>
        <div className="flex min-h-8 flex-wrap gap-1" aria-label="Chronologie des réponses">
          {timeline.length === 0 && <span className="text-sm text-slate-500">Aucune donnée.</span>}
          {timeline.map((t, i) => (
            <span
              key={`${t.at}-${i}`}
              title={`${new Date(t.at).toLocaleTimeString('fr-CH')} – ${t.ok ? t.instance : 'erreur'}`}
              className="h-6 w-3 animate-pop rounded-sm"
              style={{ background: t.ok ? instanceColor(t.instance) : '#ff4d6d', opacity: t.ok ? 1 : 0.8 }}
            />
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-400">
          {[...new Set(timeline.map((t) => (t.ok ? t.instance : 'erreur')))].map((name) => (
            <span key={name ?? 'null'} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: name === 'erreur' ? '#ff4d6d' : instanceColor(name) }} />
              {name}
            </span>
          ))}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card min-w-0 p-5">
          <h2 className="mb-4 font-display text-xl font-semibold text-white">Instance interrogée</h2>
          {info ? (
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
              <dt className="text-slate-400">Instance</dt>
              <dd className="font-mono font-semibold">{info.instance}</dd>
              <dt className="text-slate-400">Hôte</dt>
              <dd className="truncate font-mono">{info.hostname}</dd>
              <dt className="text-slate-400">Uptime du processus</dt>
              <dd>{formatUptime(info.uptime)}</dd>
              <dt className="text-slate-400">Node.js / version app</dt>
              <dd className="font-mono">
                {info.nodeVersion} / {info.appVersion}
              </dd>
            </dl>
          ) : (
            <p className="text-sm text-slate-500">Indisponible.</p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => api.instance().then((r) => setInfo(r.data)).catch(() => setInfo(null))}>
              ↻ Nouvelle requête
            </Button>
            <Button variant="secondary" size="sm" onClick={() => void checkReady()}>
              Tester /ready
            </Button>
          </div>
          {readyResult && (
            <pre className="mt-3 overflow-x-auto rounded-lg bg-ink-950 p-3 text-xs text-slate-300">
              HTTP {readyResult.status} {readyResult.instance ? `(${readyResult.instance})` : ''}
              {'\n'}
              {readyResult.body}
            </pre>
          )}
        </section>

        <section className="card min-w-0 p-5">
          <h2 className="mb-4 font-display text-xl font-semibold text-white">Dernières requêtes</h2>
          {recent.length === 0 ? (
            <p className="text-sm text-slate-500">Aucune requête.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs sm:min-w-[420px]">
                <thead className="text-left text-slate-500">
                  <tr>
                    <th className="hidden pb-2 font-medium sm:table-cell">Heure</th>
                    <th className="pb-2 font-medium">Requête</th>
                    <th className="pb-2 font-medium">Statut</th>
                    <th className="pb-2 font-medium">Instance</th>
                    <th className="pb-2 text-right font-medium">Durée</th>
                  </tr>
                </thead>
                <tbody className="font-mono">
                  {recent.map((r, i) => (
                    <tr key={`${r.at}-${i}`} className="border-t border-white/5">
                      <td className="hidden py-1.5 text-slate-500 sm:table-cell">{new Date(r.at).toLocaleTimeString('fr-CH')}</td>
                      <td className="max-w-32 truncate py-1.5 pr-2 sm:max-w-40">
                        {r.method} {r.path}
                      </td>
                      <td className={`py-1.5 ${r.status === 0 || r.status >= 400 ? 'text-neon-red' : 'text-neon-green'}`}>
                        {r.status || 'ERR'}
                      </td>
                      <td className="py-1.5" style={{ color: instanceColor(r.instance) }}>
                        {r.instance ?? '—'}
                      </td>
                      <td className="py-1.5 text-right text-slate-400">{formatMs(r.durationMs)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
