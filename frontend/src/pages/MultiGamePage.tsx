import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useBlocker, useNavigate, useParams } from 'react-router';
import { AnswerGrid } from '../components/AnswerGrid';
import { CategoryLogo } from '../components/CategoryLogo';
import { Avatar } from '../components/Avatar';
import { Button, LinkButton } from '../components/Button';
import { Alert, Spinner } from '../components/Feedback';
import { TimerBar } from '../components/TimerBar';
import { usePlayer } from '../hooks/PlayerContext';
import { useCountdown } from '../hooks/useCountdown';
import { api, ApiError, errorMessage } from '../lib/api';
import { difficultyLabel, formatNumber } from '../lib/format';
import type { ChatMessage, MultiGameState, PlayerStanding } from '../lib/types';

/**
 * Partie multijoueur pilotée par POLLING HTTP.
 * Toutes les ~1 s, le navigateur demande l'état de la partie à l'API. HAProxy
 * peut envoyer chaque requête vers une instance différente : c'est sans
 * importance, puisque l'état est calculé à partir de MySQL.
 */
const POLL_LOBBY_MS = 1500;
const POLL_GAME_MS = 1000;
const HOST_LEAVE_CONFIRM =
  'Tu es l’organisateur : si tu quittes la salle d’attente, la partie est annulée pour tous les joueurs.\n\nQuitter quand même ?';

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
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  /** Dernier message reçu : le polling ne redemande que les suivants. */
  const lastMessageId = useRef<number | undefined>(undefined);
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
        const state = await api.multiState(code, controller.signal, lastMessageId.current);
        if (!alive) return;
        if (state.messages.length > 0) {
          const fresh = state.messages;
          lastMessageId.current = fresh[fresh.length - 1]!.id;
          setMessages((prev) => {
            const known = new Set(prev.map((m) => m.id));
            return [...prev, ...fresh.filter((m) => !known.has(m.id))].slice(-200);
          });
        } else if (lastMessageId.current === undefined) {
          lastMessageId.current = 0;
        }
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

  // ---------------------------------------------------------------------------
  //  Quitter la salle d'attente = la quitter pour de bon (et l'annuler si on est
  //  l'organisateur). Le serveur le détecte aussi tout seul si l'onglet disparaît.
  // ---------------------------------------------------------------------------
  const inLobby = game?.phase === 'lobby';
  const isHost = Boolean(game?.isHost);
  /** true pendant un départ volontaire : on ne bloque plus la navigation. */
  const leaving = useRef(false);

  const leave = async () => {
    if (isHost && !window.confirm(HOST_LEAVE_CONFIRM)) return;
    leaving.current = true;
    try {
      await api.leaveMulti(code);
    } catch {
      /* ignore : on quitte la page dans tous les cas */
    }
    navigate('/');
  };

  // Navigation dans l'application (menu, logo, bouton retour) depuis la salle.
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      inLobby && !leaving.current && currentLocation.pathname !== nextLocation.pathname,
  );
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    if (isHost && !window.confirm(HOST_LEAVE_CONFIRM)) {
      blocker.reset();
      return;
    }
    leaving.current = true;
    void api
      .leaveMulti(code)
      .catch(() => undefined)
      .finally(() => blocker.proceed());
  }, [blocker, isHost, code]);

  // Fermeture ou rechargement de l'onglet.
  useEffect(() => {
    if (!inLobby) return;
    // Le serveur laisse quelques secondes pour revenir (un rechargement n'annule rien).
    const onPageHide = () => {
      if (!leaving.current) api.markAway(code);
    };
    // L'organisateur est prévenu par le navigateur avant de fermer l'onglet.
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isHost && !leaving.current) e.preventDefault();
    };
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [inLobby, isHost, code]);

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
        <Lobby
          game={game}
          meId={player?.id}
          onStart={start}
          onLeave={leave}
          starting={starting}
          messages={messages}
          onMessageSent={() => pollNow.current()}
        />
      )}

      {game.phase === 'countdown' && (
        <div className="flex flex-col items-center py-16 text-center">
          <p className="mb-3 max-w-full truncate px-4 text-lg font-semibold text-white">{game.name}</p>
          <p className="flex items-center gap-3 font-display text-sm uppercase tracking-[0.3em] text-slate-400">
            <CategoryLogo slug={game.categorySlug} name={game.category} size="sm" /> {game.category}
          </p>
          <p key={Math.ceil(left / 1000)} className="mt-6 animate-pop font-display text-8xl font-black text-gradient sm:text-9xl">
            {Math.max(1, Math.ceil(left / 1000))}
          </p>
          <p className="mt-6 text-slate-400">Prépare-toi…</p>
        </div>
      )}

      {(game.phase === 'question' || game.phase === 'reveal') && game.question && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="min-w-0">
            <div className="mb-4 flex items-center justify-between gap-3 text-sm">
              <span className="font-display uppercase tracking-wider text-slate-400 sm:tracking-widest">
                Question <span className="text-white">{game.questionIndex + 1}</span>/{game.questionCount}
              </span>
              <span className="text-right text-slate-400">
                {game.answeredCount}/{game.players.length} ont répondu
              </span>
            </div>
            <div key={game.questionIndex} className="card animate-pop p-5 sm:p-7">
              <div className="mb-4 flex flex-wrap gap-2 text-xs">
                <span
                  className="inline-flex items-center gap-1.5 rounded-md py-0.5 pl-0.5 pr-2 font-semibold"
                  style={{ background: `${game.question.category.color}22`, color: game.question.category.color }}
                >
                  <CategoryLogo slug={game.question.category.slug} name={game.question.category.name} size="xs" />{' '}
                  {game.question.category.name}
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
  messages,
  onMessageSent,
}: {
  game: MultiGameState;
  meId?: string;
  onStart: () => void;
  onLeave: () => void;
  starting: boolean;
  messages: ChatMessage[];
  onMessageSent: () => void;
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
      <div className="card relative overflow-hidden p-5 text-center sm:p-8">
        <span className="absolute inset-0 bg-gradient-to-br from-neon-blue/15 via-transparent to-neon-violet/15" aria-hidden="true" />
        <p className="relative font-display text-xs uppercase tracking-[0.3em] text-neon-cyan">Salle d’attente</p>
        <h1 className="relative mt-2 break-words font-display text-2xl font-bold sm:text-3xl">{game.name}</h1>
        <p className="relative mt-3 flex flex-wrap items-center justify-center gap-2 text-sm text-slate-400">
          <CategoryLogo slug={game.categorySlug} name={game.category} size="sm" />
          {game.category} · {game.questionCount} questions · {game.questionDurationMs / 1000} s par question
          <span className="rounded-full bg-white/5 px-2 py-0.5 text-xs text-slate-300">
            {game.isPublic ? '🌍 Publique' : '🔒 Privée'}
          </span>
        </p>
        <div className="relative mx-auto mt-5 inline-flex flex-col items-center rounded-2xl border border-white/10 bg-ink-950/50 px-5 py-3">
          <span className="text-xs uppercase tracking-[0.3em] text-slate-400">Code</span>
          <span
            className="select-all font-display text-3xl font-black tracking-[0.2em] text-gradient min-[400px]:text-4xl sm:text-5xl sm:tracking-[0.25em]"
            data-testid="game-code"
          >
            {game.code}
          </span>
        </div>
        <div>
          <button type="button" onClick={copy} className="relative mt-3 text-sm text-neon-cyan hover:underline">
            {copied ? '✓ Lien copié !' : '🔗 Copier le lien d’invitation'}
          </button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card min-w-0 p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display font-bold uppercase tracking-wide">Joueurs</h2>
            <span className="rounded-full bg-white/5 px-3 py-1 text-sm tabular-nums text-slate-300">
              {game.players.length}/{game.maxPlayers}
            </span>
          </div>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
            {game.players.map((p) => (
              <li key={p.id} className="flex min-w-0 animate-pop items-center gap-2 rounded-xl bg-ink-800/80 p-2">
                <Avatar id={p.avatar} size="sm" ring={p.id === meId} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{p.pseudo}</span>
                  {p.isHost && <span className="block truncate text-xs text-neon-amber">👑 Organisateur</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <LobbyChat code={game.code} messages={messages} meId={meId} onSent={onMessageSent} />
      </div>

      {game.isHost && (
        <p className="text-center text-sm text-neon-amber/90 sm:text-right">
          ⚠️ Garde cette page ouverte : si tu la quittes, la partie est annulée pour tous les joueurs.
        </p>
      )}

      <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
        <Button variant="ghost" onClick={onLeave}>
          {game.isHost ? 'Annuler la partie' : 'Quitter la salle'}
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

const CHAT_MAX = 200;
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' });

function LobbyChat({
  code,
  messages,
  meId,
  onSent,
}: {
  code: string;
  messages: ChatMessage[];
  meId?: string;
  onSent: () => void;
}) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  // Défile vers le dernier message, sauf si le joueur est remonté lire l'historique.
  useEffect(() => {
    const el = listRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  async function send(e: FormEvent) {
    e.preventDefault();
    const value = text.trim();
    if (!value || sending) return;
    setSending(true);
    setError(null);
    try {
      await api.sendChat(code, value);
      setText('');
      stickToBottom.current = true;
      onSent();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="card flex min-w-0 flex-col p-5 sm:p-6" aria-labelledby="chat-title">
      <h2 id="chat-title" className="mb-3 font-display font-bold uppercase tracking-wide">
        Chat
      </h2>
      <div
        ref={listRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
        }}
        className="-mx-2 h-64 space-y-2 overflow-y-auto overscroll-contain px-2 sm:h-72"
        role="log"
        aria-live="polite"
        aria-label="Messages de la salle d’attente"
      >
        {messages.length === 0 && (
          <p className="py-10 text-center text-sm text-slate-500">Aucun message. Dis bonjour aux autres joueurs 👋</p>
        )}
        {messages.map((m) => {
          if (m.kind === 'system')
            return (
              <p key={m.id} className="text-center text-xs text-slate-500">
                {m.text} · {timeOf(m.createdAt)}
              </p>
            );
          const mine = m.playerId === meId;
          return (
            <div key={m.id} className={`flex items-end gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
              {!mine && <Avatar id={m.avatar ?? ''} size="xs" />}
              <div
                className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                  mine ? 'rounded-br-md bg-neon-blue/25 text-white' : 'rounded-bl-md bg-ink-800 text-slate-100'
                }`}
              >
                {!mine && <p className="mb-0.5 text-xs font-semibold text-neon-cyan">{m.pseudo}</p>}
                <p className="whitespace-pre-wrap break-words">{m.text}</p>
                <p className={`mt-0.5 text-[0.65rem] ${mine ? 'text-blue-200/70' : 'text-slate-500'}`}>{timeOf(m.createdAt)}</p>
              </div>
            </div>
          );
        })}
      </div>
      <form onSubmit={send} className="mt-3 flex gap-2">
        <label htmlFor="chat-input" className="sr-only">
          Écrire un message
        </label>
        <input
          id="chat-input"
          className="input min-w-0 flex-1 py-2.5"
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, CHAT_MAX))}
          maxLength={CHAT_MAX}
          placeholder="Écris un message…"
          autoComplete="off"
          enterKeyHint="send"
        />
        <Button type="submit" variant="secondary" loading={sending} disabled={!text.trim()} aria-label="Envoyer le message">
          <span aria-hidden="true">➤</span>
          <span className="hidden sm:inline">Envoyer</span>
        </Button>
      </form>
      {error && <p className="mt-2 text-xs text-neon-red">{error}</p>}
    </section>
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
    <aside className="card h-fit min-w-0 p-4">
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
        <p className="mt-1 truncate text-slate-400">{game.name}</p>
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
          <div key={place} className="flex min-w-0 flex-1 flex-col items-center">
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
            <span className="min-w-0 flex-1 truncate font-medium">{p.pseudo}</span>
            <span className="shrink-0 text-xs text-slate-400">{p.correctCount}/{game.questionCount}</span>
            <span className="w-16 shrink-0 text-right font-display text-sm font-bold tabular-nums sm:w-20">{formatNumber(p.score)}</span>
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
