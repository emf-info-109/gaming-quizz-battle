import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { RefreshIcon } from './Icons';
import { api } from '../lib/api';
import { instanceColor } from '../lib/metrics';

/**
 * Affiche l'instance backend qui a répondu à une requête /api/instance.
 * Le nom provient TOUJOURS de l'API (le frontend est un build statique identique
 * sur toutes les VM) : cliquer sur ↻ refait une requête, que HAProxy peut
 * envoyer vers une autre instance.
 */
export function InstanceBadge() {
  const [instance, setInstance] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [bump, setBump] = useState(0);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.instance();
      setInstance(res.data.instance);
      setFailed(false);
      setBump((b) => b + 1);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="flex items-center gap-2 text-xs text-slate-400">
      <span className="hidden sm:inline">Serveur API :</span>
      <span className="sm:hidden">API :</span>
      <span
        key={bump}
        className="inline-flex animate-pop items-center gap-1.5 rounded-md border border-white/10 bg-ink-800 px-2 py-0.5 font-mono text-slate-100"
        data-testid="instance-name"
      >
        <span
          className="h-2 w-2 rounded-full"
          style={{ background: failed ? '#ff4d6d' : instanceColor(instance) }}
          aria-hidden="true"
        />
        {failed ? 'injoignable' : (instance ?? '…')}
      </span>
      <button
        type="button"
        onClick={refresh}
        disabled={loading}
        className="rounded-md p-1 text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-100 disabled:opacity-50"
        title="Nouvelle requête vers l’API (observer le changement d’instance)"
        aria-label="Interroger à nouveau le serveur API"
      >
        <span className={`block ${loading ? 'animate-spin' : ''}`}>
          <RefreshIcon className="h-4 w-4" />
        </span>
      </button>
      <Link to="/cloud-dashboard" className="hidden text-slate-500 underline-offset-2 hover:text-slate-200 hover:underline sm:inline">
        Tableau de bord Cloud
      </Link>
    </div>
  );
}
