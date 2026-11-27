import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Avatar } from '../components/Avatar';
import { LinkButton } from '../components/Button';
import { CategoryLogo } from '../components/CategoryLogo';
import { ArrowRightIcon, CheckIcon, PlayIcon } from '../components/Icons';
import { usePlayer } from '../hooks/PlayerContext';
import { api } from '../lib/api';
import { formatNumber } from '../lib/format';
import type { GlobalStats } from '../lib/types';

/** Modes de jeu, présentés comme dans un launcher : un numéro et un titre, pas d'icône. */
const MODES = [
  {
    to: '/solo',
    tag: 'Solo',
    title: 'Entraînement',
    text: '10 questions, 15 secondes chacune. Plus tu réponds vite, plus tu marques.',
  },
  {
    to: '/multi/create',
    tag: 'Multijoueur',
    title: 'Créer une partie',
    text: 'Nomme ta salle, discute avec les joueurs qui arrivent et défie jusqu’à 29 adversaires.',
  },
  {
    to: '/multi/join',
    tag: 'Multijoueur',
    title: 'Rejoindre une partie',
    text: 'Choisis une salle dans la liste des parties en attente, ou entre son code.',
  },
];

export function HomePage() {
  const { player } = usePlayer();
  const [stats, setStats] = useState<GlobalStats | null>(null);
  const [statsError, setStatsError] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () =>
      api
        .stats()
        .then((s) => {
          if (!alive) return;
          setStats(s);
          setStatsError(false);
        })
        .catch(() => alive && setStatsError(true));
    void load();
    const id = setInterval(load, 15_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const value = (n: number | undefined) => (n !== undefined ? formatNumber(n) : statsError ? '—' : '…');

  return (
    <div className="space-y-16">
      {/* --- Bandeau principal : texte à gauche, aperçu d'une vraie question à droite --- */}
      <section className="grid animate-fade-up items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)] lg:gap-16">
        <div>
          <p className="mb-4 text-sm font-medium text-slate-400">Quiz gaming en temps réel</p>
          <h1 className="font-display text-5xl font-semibold uppercase leading-[0.92] text-white sm:text-7xl">
            Gaming Quiz
            <span className="block text-neon-cyan">Battle</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg text-slate-300">
            Minecraft, LoL, Counter-Strike, Fortnite, Pokémon et WoW. Des questions chronométrées, en solo ou jusqu’à 30
            joueurs dans la même salle.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <LinkButton to="/solo" size="lg">
              <PlayIcon className="h-4 w-4" />
              Jouer en solo
            </LinkButton>
            <LinkButton to="/multi/join" variant="secondary" size="lg">
              Multijoueur
            </LinkButton>
          </div>

          {/* Joueur connecté (ou invitation à choisir un pseudo) */}
          {player ? (
            <Link to="/profile" className="mt-5 inline-flex items-center gap-2 text-sm text-slate-400 transition-colors hover:text-white">
              <Avatar id={player.avatar} size="xs" />
              Connecté en tant que <span className="font-medium text-slate-100">{player.pseudo}</span>
            </Link>
          ) : (
            <Link to="/profile" className="mt-5 inline-flex items-center gap-2 text-sm text-slate-400 transition-colors hover:text-white">
              Pas encore de pseudo ? <span className="font-medium text-slate-100">Choisir mon pseudo</span>
              <ArrowRightIcon />
            </Link>
          )}

          {/* Chiffres en direct, sous forme de texte calme */}
          <dl className="mt-10 grid max-w-xl grid-cols-3 gap-4 border-t border-white/[0.08] pt-6">
            <div>
              <dt className="flex items-center gap-2 text-sm text-slate-400">
                <span className="h-1.5 w-1.5 rounded-full bg-neon-green" aria-hidden="true" />
                En ligne
              </dt>
              <dd className="mt-1 font-display text-3xl font-semibold leading-none tabular-nums text-white">{value(stats?.onlinePlayers)}</dd>
            </div>
            <div>
              <dt className="text-sm text-slate-400">Questions</dt>
              <dd className="mt-1 font-display text-3xl font-semibold leading-none tabular-nums text-white">{value(stats?.questionCount)}</dd>
            </div>
            <div>
              <dt className="text-sm text-slate-400">Parties jouées</dt>
              <dd className="mt-1 font-display text-3xl font-semibold leading-none tabular-nums text-white">{value(stats?.finishedGames)}</dd>
            </div>
          </dl>
        </div>

        <QuestionPreview />
      </section>

      {/* --- Modes de jeu ------------------------------------------------------ */}
      <section aria-labelledby="modes-title">
        <h2 id="modes-title" className="mb-4 text-sm font-medium text-slate-400">
          Modes de jeu
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          {MODES.map((m, i) => (
            <Link
              key={m.to}
              to={m.to}
              className="card group flex min-h-52 flex-col p-6 transition-colors duration-150 hover:border-white/15 hover:bg-ink-850"
            >
              <span className="flex items-baseline justify-between text-sm text-slate-400">
                {m.tag}
                <span className="font-mono text-xs tabular-nums text-slate-500">0{i + 1}</span>
              </span>
              <h3 className="mt-2 font-display text-3xl font-semibold leading-none text-white">{m.title}</h3>
              <p className="mt-3 text-sm text-slate-400">{m.text}</p>
              <span className="mt-auto inline-flex items-center gap-2 pt-6 text-sm font-medium text-slate-300 transition-colors group-hover:text-neon-cyan">
                C’est parti <ArrowRightIcon className="h-4 w-4" />
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* --- Classement et infrastructure ------------------------------------- */}
      <section className="grid gap-4 md:grid-cols-2">
        <Link to="/leaderboard" className="card group flex items-center gap-4 p-5 transition-colors hover:border-white/15 hover:bg-ink-850">
          <span className="min-w-0">
            <span className="block text-sm text-neon-amber">Hall of fame</span>
            <span className="block font-display text-2xl font-semibold leading-tight text-white">Classement général</span>
            <span className="text-sm text-slate-400">Les meilleurs joueurs, au global et par catégorie</span>
          </span>
          <ArrowRightIcon className="ml-auto h-5 w-5 shrink-0 text-slate-500 transition-colors group-hover:text-slate-200" />
        </Link>
        <Link to="/cloud-dashboard" className="card group flex items-center gap-4 p-5 transition-colors hover:border-white/15 hover:bg-ink-850">
          <span className="min-w-0">
            <span className="block text-sm text-slate-400">Infrastructure</span>
            <span className="block font-display text-2xl font-semibold leading-tight text-white">Tableau de bord Cloud</span>
            <span className="text-sm text-slate-400">Quelle instance répond ? Observe le load balancing en direct</span>
          </span>
          <ArrowRightIcon className="ml-auto h-5 w-5 shrink-0 text-slate-500 transition-colors group-hover:text-slate-200" />
        </Link>
      </section>
    </div>
  );
}

/**
 * Aperçu statique d'une question au moment de la correction, avec une vraie question
 * de la base (MC-04). C'est le « moment » de la page : la seule zone riche en couleur.
 */
const PREVIEW = {
  prompt: 'Avec quel bloc construit-on le cadre d’un portail du Nether ?',
  answers: ['La bedrock', 'La netherrack', 'La pierre taillée', 'L’obsidienne'],
  votes: [2, 5, 1, 14],
  correct: 3,
};
const PREVIEW_LETTERS = [
  ['A', 'bg-neon-blue text-white'],
  ['B', 'bg-neon-violet text-white'],
  ['C', 'bg-neon-cyan text-ink-950'],
  ['D', 'bg-neon-pink text-white'],
] as const;

function QuestionPreview() {
  const total = PREVIEW.votes.reduce((a, b) => a + b, 0);
  return (
    <figure className="card p-5 sm:p-6" aria-label="Aperçu d’une question en partie multijoueur">
      <div className="flex items-center justify-between text-sm text-slate-400">
        <span className="inline-flex items-center gap-2">
          <CategoryLogo slug="minecraft" name="Minecraft" size="xs" />
          Minecraft
        </span>
        <span className="tabular-nums">Question 4/10</span>
      </div>
      <p className="mt-4 font-display text-2xl font-semibold leading-tight text-white">{PREVIEW.prompt}</p>

      <div className="mt-5 flex items-center justify-between rounded-lg border border-neon-green/30 bg-neon-green/[0.08] px-4 py-2.5 text-sm">
        <span className="inline-flex items-center gap-2 font-medium text-neon-green">
          <CheckIcon className="h-4 w-4" />
          Bonne réponse
        </span>
        <span className="font-display text-lg font-semibold tabular-nums text-neon-green">+812 pts</span>
      </div>

      <ul className="mt-3 space-y-2">
        {PREVIEW.answers.map((a, i) => {
          const correct = i === PREVIEW.correct;
          return (
            <li
              key={a}
              className={`relative flex items-center gap-3 overflow-hidden rounded-lg border px-2 py-2 ${
                correct ? 'border-neon-green/60 bg-neon-green/[0.06]' : 'border-white/[0.06] bg-ink-850 text-slate-400'
              }`}
            >
              <span className="absolute inset-y-0 left-0 bg-white/[0.04]" style={{ width: `${(PREVIEW.votes[i]! / total) * 100}%` }} aria-hidden="true" />
              <span
                className={`chamfer-sm relative flex h-8 w-8 shrink-0 items-center justify-center font-display font-semibold ${PREVIEW_LETTERS[i]![1]} ${
                  correct ? '' : 'opacity-60'
                }`}
              >
                {PREVIEW_LETTERS[i]![0]}
              </span>
              <span className={`relative flex-1 text-sm ${correct ? 'font-medium text-white' : ''}`}>{a}</span>
              <span className="relative w-6 text-right text-sm tabular-nums text-slate-500">{PREVIEW.votes[i]}</span>
            </li>
          );
        })}
      </ul>
      <figcaption className="mt-4 text-xs text-slate-500">Exemple : 22 joueurs, correction de la question 4</figcaption>
    </figure>
  );
}
