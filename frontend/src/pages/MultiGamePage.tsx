import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { AnswerGrid } from '../components/AnswerGrid';
import { Avatar } from '../components/Avatar';
import { Button, LinkButton } from '../components/Button';
import { Alert, Spinner } from '../components/Feedback';
import { TimerBar } from '../components/TimerBar';
import { usePlayer } from '../hooks/PlayerContext';
import { useCountdown } from '../hooks/useCountdown';
import { api, ApiError, errorMessage } from '../lib/api';
import { difficultyLabel, formatNumber } from '../lib/format';
import type { MultiGameState, PlayerStanding } from '../lib/types';

/**
 * Partie multijoueur pilotée par POLLING HTTP.
 * Toutes les ~1 s, le navigateur demande l'état de la partie à l'API. HAProxy
 * peut envoyer chaque requête vers une instance différente : c'est sans
 * importance, puisque l'état est calculé à partir de MySQL.
 */
const POLL_LOBBY_MS = 1500;
const POLL_GAME_MS = 1000;

export function MultiGamePage() {
  const { code = '' } = useParams();
  const { player } = usePlayer();
  const navigate = useNavigate();
  const [game, setGame] = useState<MultiGameState | null>(null);
  const [syncKey, setSyncKey] = useState(0);
  const [fatal, setFatal] = useState<string | null>(null);
  const [connectionLost, setConnectionLost] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ index: number; choice: number } | null>(null);
  const [starting, setStarting] = useState(false);
  const triedJoin = useRef(false);
  const pollNow = useRef<() => void>(() => {});

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();

    const schedule = (ms: number) => {
      clearTimeout(timer);
      timer = setTimeout(poll, ms);
    };

    async function poll() {
      try {
        const state = await api.multiState(code, controller.signal);
        if (!alive) return;
        setGame(state);
        setSyncKey((k) => k + 1);
        setConnectionLost(false);
        if (state.phase === 'finished' || state.phase === 'cancelled') return;
        const base = state.phase === 'lobby' ? POLL_LOBBY_MS : POLL_GAME_MS;
        // Petit raccourci : on revient dès la fin de la phase pour une transition plus réactive.
        const untilPhaseEnd = state.phase === 'lobby' ? base : state.phaseRemainingMs + 120;
        schedule(Math.max(250, Math.min(base, untilPhaseEnd)));
      } catch (err) {
        if (!alive || (err as Error).name === 'AbortError') return;
        if (err instanceof ApiError && err.code === 'NOT_IN_GAME' && !triedJoin.current) {
          // Lien partagé : on tente de rejoindre automatiquement.
          triedJoin.current = true;
          try {
            await api.joinMulti(code);
            return schedule(0);
          } catch (joinErr) {
            return setFatal(errorMessage(joinErr));
          }
        }
        if (err instanceof ApiError && err.status > 0 && err.status < 500 && err.status !== 429) {
          return setFatal(errorMessage(err));
        }
        // Erreur réseau / 5xx / 429 : on garde le dernier état et on réessaie.
        setConnectionLost(true);
        schedule(2000);
      }
    }

    pollNow.current = () => schedule(0);
    void poll();
    return () => {
      alive = false;
      controller.abort();
      clearTimeout(timer);
    };
  }, [code]);

  const answer = useCallback(
    async (choice: number) => {
      if (!game || game.phase !== 'question' || pending?.index === game.questionIndex || game.myAnswer) return;
      const index = game.questionIndex;
      setPending({ index, choice });
      setActionError(null);
      try {
        await api.answerMulti(code, index, choice);
      } catch (err) {
        if (!(err instanceof ApiError && err.code === 'ALREADY_ANSWERED')) {
          setActionError(errorMessage(err));
          setPending(null);
        }
      }
      pollNow.current();
    },
    [code, game, pending],
  );

  const start = async () => {
    setStarting(true);
    setActionError(null);
    try {
      await api.startMulti(code);
      pollNow.current();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setStarting(false);
    }
  };

  const leave = async () => {
    try {
      await api.leaveMulti(code);
    } catch {
      /* ignore : on quitte la page dans tous les cas */
    }
    navigate('/');
  };

  const left = useCountdown(game?.phaseRemainingMs ?? 0, syncKey, Boolean(game));

  if (fatal)
    return (
      <div className="mx-auto max-w-md space-y-4 text-center">
        <Alert>{fatal}</Alert>
        <div className="flex justify-center gap-3">
          <LinkButton to="/multi/join" variant="secondary">Autre code</LinkButton>
          <LinkButton to="/" variant="ghost">Accueil</LinkButton>
        </div>
      </div>
    );
  if (!game) return <Spinner label="Connexion à la partie…" />;

  const myChoice = game.myAnswer?.choice ?? (pending?.index === game.questionIndex ? pending.choice : null);

  return (
    <div className="mx-auto max-w-4xl">
      {connectionLost && (
        <div className="mb-4">
          <Alert tone="info">Connexion perdue avec le serveur… nouvelle tentative en cours (la partie continue côté serveur).</Alert>
        </div>
      )}
      {actionError && (
        <div className="mb-4">
          <Alert>{actionError}</Alert>
        </div>
      )}

      {game.phase === 'lobby' && (
        <Lobby game={game} meId={player?.id} onStart={start} onLeave={leave} starting={starting} />
      )}

      {game.phase === 'countdown' && (
        <div className="flex flex-col items-center py-16 text-center">
          <p className="font-display text-sm uppercase tracking-[0.3em] text-slate-400">
            {game.categoryIcon} {game.category}
          </p>
          <p key={Math.ceil(left / 1000)} className="mt-6 animate-pop font-display text-8xl font-black text-gradient sm:text-9xl">
            {Math.max(1, Math.ceil(left / 1000))}
          </p>
          <p className="mt-6 text-slate-400">Prépare-toi…</p>
        </div>
      )}

      {(game.phase === 'question' || game.phase === 'reveal') && game.question && (
        <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
          <div>
            <div className="mb-4 flex items-center justify-between text-sm">
              <span className="font-display uppercase tracking-widest text-slate-400">
                Question <span className="text-white">{game.questionIndex + 1}</span>/{game.questionCount}
              </span>
              <span className="text-slate-400">
                {game.answeredCount}/{game.players.length} ont répondu
              </span>
            </div>
            <div key={game.questionIndex} className="card animate-pop p-5 sm:p-7">
              <div className="mb-4 flex flex-wrap gap-2 text-xs">
                <span
                  className="rounded-md px-2 py-1 font-semibold"
                  style={{ background: `${game.question.category.color}22`, color: game.question.category.color }}
                >
                  {game.question.category.icon} {game.question.category.name}
                </span>
                <span className="rounded-md bg-white/5 px-2 py-1 text-slate-400">{difficultyLabel[game.question.difficulty]}</span>
              </div>
              <h2 className="mb-6 text-xl font-bold leading-snug sm:text-2xl">{game.question.prompt}</h2>

              {game.phase === 'question' ? (
                <>
                  <div className="mb-6">
                    <TimerBar remainingMs={left} totalMs={game.questionDurationMs} />
                  </div>
                  <AnswerGrid
                    answers={game.question.answers}
                    onSelect={(i) => void answer(i)}
                    selected={myChoice}
                    disabled={myChoice !== null || left <= 0}
                  />
                  <p className="mt-4 h-5 text-center text-sm text-slate-400">
                    {myChoice !== null ? '✓ Réponse enregistrée — attends la fin du chrono !' : left <= 0 ? 'Temps écoulé…' : ''}
                  </p>
                </>
              ) : (
                <>
                  <RevealBanner game={game} />
                  <AnswerGrid
                    answers={game.question.answers}
                    selected={game.myAnswer?.choice ?? null}
                    correctIndex={game.reveal?.correctIndex ?? null}
                    distribution={game.reveal?.distribution ?? null}
                  />
                  <p className="mt-4 text-center text-sm text-slate-400">
                    {game.questionIndex + 1 < game.questionCount ? 'Question suivante' : 'Résultats'} dans{' '}
                    <span className="font-display text-neon-cyan">{Math.ceil(left / 1000)}</span> s
                  </p>
                </>
              )}
            </div>
          </div>
          <MiniLeaderboard players={game.players} meId={player?.id} showDelta={game.phase === 'reveal'} />
        </div>
      )}

      {game.phase === 'finished' && <FinalResults game={game} meId={player?.id} />}

      {game.phase === 'cancelled' && (
        <div className="card mx-auto max-w-md p-8 text-center">
          <p className="text-4xl">🚪</p>
          <h2 className="mt-3 font-display text-xl font-bold">Partie annulée</h2>
          <p className="mt-2 text-slate-400">L’organisateur a quitté la salle d’attente.</p>
          <LinkButton to="/" className="mt-6">Retour à l’accueil</LinkButton>
        </div>
      )}
    </div>
  );
}

function Lobby({
  game,
  meId,
  onStart,
  onLeave,
  starting,
}: {
  game: MultiGameState;
  meId?: string;
  onStart: () => void;
  onLeave: () => void;
  starting: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const shareUrl = `${window.location.origin}/multi/join?code=${game.code}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* presse-papiers indisponible (HTTP non sécurisé) */
    }
  };

  return (
    <div className="space-y-6">
      <div className="card relative overflow-hidden p-6 text-center sm:p-10">
        <span className="absolute inset-0 bg-gradient-to-br from-neon-blue/15 via-transparent to-neon-violet/15" aria-hidden="true" />
        <p className="relative text-sm uppercase tracking-[0.3em] text-slate-400">Code de la partie</p>
        <p className="relative mt-3 select-all font-display text-5xl font-black tracking-[0.25em] text-gradient sm:text-7xl" data-testid="game-code">
          {game.code}
        </p>
        <p className="relative mt-3 text-slate-400">
          {game.categoryIcon} {game.category} · {game.questionCount} questions · {game.questionDurationMs / 1000} s par question
        </p>
        <button type="button" onClick={copy} className="relative mt-4 text-sm text-neon-cyan hover:underline">
          {copied ? '✓ Lien copié !' : '🔗 Copier le lien d’invitation'}
        </button>
      </div>

      <div className="card p-5 sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display font-bold uppercase tracking-wide">Joueurs</h2>
          <span className="rounded-full bg-white/5 px-3 py-1 text-sm tabular-nums text-slate-300">
            {game.players.length}/{game.maxPlayers}
          </span>
        </div>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
          {game.players.map((p) => (
            <li key={p.id} className="flex animate-pop items-center gap-2 rounded-xl bg-ink-800/80 p-2">
              <Avatar id={p.avatar} size="sm" ring={p.id === meId} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{p.pseudo}</span>
                {p.isHost && <span className="text-xs text-neon-amber">👑 Organisateur</span>}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
        <Button variant="ghost" onClick={onLeave}>
          {game.isHost ? 'Annuler la partie' : 'Quitter'}
        </Button>
        {game.isHost ? (
          <Button size="lg" onClick={onStart} loading={starting} className="animate-pulse-glow">
            Lancer la partie ▶
          </Button>
        ) : (
          <p className="flex items-center gap-2 text-slate-400">
            <span className="h-2 w-2 animate-pulse rounded-full bg-neon-cyan" aria-hidden="true" />
            En attente du lancement par l’organisateur…
          </p>
        )}
      </div>
    </div>
  );
}

function RevealBanner({ game }: { game: MultiGameState }) {
  const mine = game.myAnswer;
  if (!mine)
    return (
      <div className="mb-5 rounded-xl border border-white/10 bg-white/5 px-4 py-3 font-display font-bold uppercase text-slate-300">
        ⏱ Pas de réponse
      </div>
    );
  return mine.isCorrect ? (
    <div className="mb-5 flex animate-pop items-center justify-between rounded-xl border border-neon-green/40 bg-neon-green/10 px-4 py-3">
      <span className="font-display font-bold uppercase text-neon-green">✓ Bonne réponse !</span>
      <span className="font-display font-bold text-neon-green">+{mine.points} pts</span>
    </div>
  ) : (
    <div className="mb-5 animate-pop rounded-xl border border-neon-red/40 bg-neon-red/10 px-4 py-3 font-display font-bold uppercase text-neon-red">
      ✗ Raté
    </div>
  );
}

function MiniLeaderboard({ players, meId, showDelta }: { players: PlayerStanding[]; meId?: string; showDelta: boolean }) {
  const top = players.slice(0, 8);
  const me = players.find((p) => p.id === meId);
  const meOutside = me && !top.some((p) => p.id === me.id);
  const row = (p: PlayerStanding) => (
    <li
      key={p.id}
      className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-all duration-500 ${p.id === meId ? 'bg-neon-cyan/10' : ''}`}
    >
      <span className="w-5 text-center font-display text-xs text-slate-400">{p.rank}</span>
      <Avatar id={p.avatar} size="xs" />
      <span className="min-w-0 flex-1 truncate">{p.pseudo}</span>
      {p.answeredCurrent && !showDelta && <span className="text-xs text-neon-cyan" title="A répondu">●</span>}
      {showDelta && p.lastPoints !== null && p.lastPoints > 0 && (
        <span className="text-xs font-semibold text-neon-green">+{p.lastPoints}</span>
      )}
      <span className="font-display text-xs font-bold tabular-nums">{formatNumber(p.score)}</span>
    </li>
  );
  return (
    <aside className="card h-fit p-4">
      <h3 className="mb-3 font-display text-sm font-bold uppercase tracking-wide text-slate-300">Classement</h3>
      <ol className="space-y-1">{top.map(row)}</ol>
      {meOutside && me && <ol className="mt-2 border-t border-white/5 pt-2">{row(me)}</ol>}
    </aside>
  );
}

function FinalResults({ game, meId }: { game: MultiGameState; meId?: string }) {
  const [first, second, third] = game.players;
  const me = game.players.find((p) => p.id === meId);
  const podium: Array<{ p: PlayerStanding | undefined; place: number; height: string; color: string }> = [
    { p: second, place: 2, height: 'h-24 sm:h-32', color: 'from-slate-300/40' },
    { p: first, place: 1, height: 'h-32 sm:h-44', color: 'from-neon-amber/50' },
    { p: third, place: 3, height: 'h-16 sm:h-24', color: 'from-orange-500/40' },
  ];
  return (
    <div className="space-y-8">
      <div className="text-center">
        <p className="font-display text-sm uppercase tracking-[0.3em] text-neon-cyan">Partie terminée</p>
        <h1 className="mt-2 font-display text-3xl font-black sm:text-4xl">Podium</h1>
        {me && (
          <p className="mt-3 text-slate-300">
            Tu termines <strong className="text-white">{me.rank === 1 ? '1er 🏆' : `${me.rank}e`}</strong> avec{' '}
            <strong className="text-neon-cyan">{formatNumber(me.score)} pts</strong>
          </p>
        )}
      </div>

      <div className="mx-auto flex max-w-xl items-end justify-center gap-3 sm:gap-5">
        {podium.map(({ p, place, height, color }) => (
          <div key={place} className="flex flex-1 flex-col items-center">
            {p ? (
              <>
                <span className={place === 1 ? 'animate-float' : ''}>
                  <Avatar id={p.avatar} size={place === 1 ? 'xl' : 'lg'} ring={p.id === meId} />
                </span>
                <span className="mt-2 max-w-full truncate text-center text-sm font-semibold">{p.pseudo}</span>
                <span className="font-display text-xs text-neon-cyan">{formatNumber(p.score)} pts</span>
              </>
            ) : (
              <span className="h-16" />
            )}
            <div className={`mt-2 flex w-full items-start justify-center rounded-t-xl border border-white/10 bg-gradient-to-b ${color} to-ink-800 pt-2 ${height}`}>
              <span className="font-display text-2xl font-black">{place}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="card mx-auto max-w-xl divide-y divide-white/5">
        {game.players.map((p) => (
          <div key={p.id} className={`flex items-center gap-3 px-4 py-2.5 ${p.id === meId ? 'bg-neon-cyan/10' : ''}`}>
            <span className="w-6 text-center font-display text-sm text-slate-400">{p.rank}</span>
            <Avatar id={p.avatar} size="sm" />
            <span className="flex-1 truncate font-medium">{p.pseudo}</span>
            <span className="text-xs text-slate-400">{p.correctCount}/{game.questionCount}</span>
            <span className="w-20 text-right font-display text-sm font-bold tabular-nums">{formatNumber(p.score)}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap justify-center gap-3">
        <LinkButton to="/multi/create" size="lg">Nouvelle partie</LinkButton>
        <LinkButton to="/leaderboard" variant="secondary" size="lg">Classement général</LinkButton>
      </div>
    </div>
  );
}
