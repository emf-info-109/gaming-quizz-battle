import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Avatar } from '../components/Avatar';
import { Button, LinkButton } from '../components/Button';
import { CategoryLogo } from '../components/CategoryLogo';
import { Alert, PageTitle, Spinner } from '../components/Feedback';
import { api, errorMessage } from '../lib/api';
import type { OpenGame } from '../lib/types';

const ALLOWED = /[^ABCDEFGHJKMNPQRSTUVWXYZ23456789]/g;
/** Rafraîchissement de la liste des parties en attente */
const LIST_REFRESH_MS = 4000;

export function JoinGamePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [code, setCode] = useState((params.get('code') ?? '').toUpperCase().replace(ALLOWED, '').slice(0, 6));
  const [joining, setJoining] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function join(target: string) {
    setJoining(target);
    setError(null);
    try {
      const res = await api.joinMulti(target);
      navigate(`/game/${res.code}`);
    } catch (err) {
      setError(errorMessage(err));
      setJoining(null);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (code.length === 6) void join(code);
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageTitle kicker="Multijoueur" title="Rejoindre une partie">
        Choisis une salle dans la liste, ou entre le code à 6 caractères donné par l’organisateur.
      </PageTitle>

      <form onSubmit={onSubmit} className="card mb-8 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:p-5">
        <label htmlFor="code" className="text-sm font-medium text-slate-300 sm:w-28 sm:shrink-0">
          J’ai un code
        </label>
        <input
          id="code"
          className="input min-w-0 flex-1 text-center font-display text-2xl font-bold uppercase tracking-[0.35em] sm:text-left"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(ALLOWED, '').slice(0, 6))}
          placeholder="ABC234"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          inputMode="text"
          aria-label="Code de la partie"
        />
        <Button type="submit" size="lg" loading={joining === code && code.length === 6} disabled={code.length !== 6 || Boolean(joining)}>
          Rejoindre 🚀
        </Button>
      </form>

      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}

      <OpenGamesList onJoin={(c) => void join(c)} joining={joining} />
    </div>
  );
}

function OpenGamesList({ onJoin, joining }: { onJoin: (code: string) => void; joining: string | null }) {
  const [games, setGames] = useState<OpenGame[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    const load = async () => {
      // Onglet masqué : on ne rafraîchit pas (économise des requêtes)
      if (document.visibilityState === 'visible') {
        try {
          const list = await api.openGames(controller.signal);
          if (!alive) return;
          setGames(list);
          setFailed(false);
        } catch (err) {
          if (!alive || (err as Error).name === 'AbortError') return;
          setFailed(true);
        }
      }
      timer = setTimeout(load, LIST_REFRESH_MS);
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        clearTimeout(timer);
        void load();
      }
    };
    void load();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      controller.abort();
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return (
    <section aria-labelledby="open-games-title">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id="open-games-title" className="font-display text-lg font-bold uppercase tracking-wide">
          Parties en attente
        </h2>
        <span className="flex items-center gap-2 text-xs text-slate-500">
          <span className="h-2 w-2 animate-pulse rounded-full bg-neon-green" aria-hidden="true" />
          en direct
        </span>
      </div>

      {failed && !games && <Alert>Impossible de charger la liste des parties. Nouvelle tentative…</Alert>}
      {!failed && !games && <Spinner label="Recherche des parties…" />}
      {games && games.length === 0 && (
        <div className="card flex flex-col items-center gap-4 p-8 text-center">
          <p className="text-4xl" aria-hidden="true">🛋️</p>
          <p className="text-slate-300">Aucune partie publique n’attend de joueurs pour l’instant.</p>
          <LinkButton to="/multi/create" variant="secondary">
            ⚔️ Créer la mienne
          </LinkButton>
        </div>
      )}
      {games && games.length > 0 && (
        <ul className="space-y-3" aria-live="polite">
          {games.map((g) => {
            const full = g.playerCount >= g.maxPlayers && !g.joined;
            return (
              <li key={g.code} className="card flex animate-fade-up items-center gap-3 p-3 sm:gap-4 sm:p-4">
                <CategoryLogo slug={g.categorySlug} name={g.category} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-white" title={g.name}>
                    {g.name}
                  </p>
                  <p className="truncate text-xs text-slate-400">
                    {g.category} · {g.questionCount}&nbsp;questions
                  </p>
                  <p className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-slate-400">
                    <Avatar id={g.host.avatar} size="xs" />
                    <span className="truncate">{g.host.pseudo}</span>
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-center sm:gap-3">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums ${
                      full ? 'bg-neon-red/15 text-neon-red' : 'bg-white/5 text-slate-300'
                    }`}
                    title="Joueurs dans la salle"
                  >
                    👥 {g.playerCount}/{g.maxPlayers}
                  </span>
                  <Button
                    size="sm"
                    variant={g.joined ? 'secondary' : 'primary'}
                    onClick={() => onJoin(g.code)}
                    disabled={full || Boolean(joining)}
                    loading={joining === g.code}
                  >
                    {g.joined ? 'Revenir' : full ? 'Complète' : 'Rejoindre'}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
