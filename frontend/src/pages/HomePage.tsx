import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Avatar } from '../components/Avatar';
import { LinkButton } from '../components/Button';
import { ArrowRightIcon, PlayIcon } from '../components/Icons';
import { LogoMark } from '../components/Logo';
import { usePlayer } from '../hooks/PlayerContext';
import { api } from '../lib/api';
import { formatNumber } from '../lib/format';
import type { GlobalStats } from '../lib/types';

/** Modes de jeu, présentés comme dans un launcher (sans icône : numéro + titre). */
const MODES = [
  {
    to: '/solo',
    tag: 'Solo',
    title: 'Entraînement',
    text: '10 questions, 15 secondes chacune. Plus tu es rapide, plus tu marques.',
    accent: 'from-neon-cyan/25',
    bar: 'bg-neon-cyan',
  },
  {
    to: '/multi/create',
    tag: 'Multijoueur',
    title: 'Créer une partie',
    text: 'Nomme ta salle, discute avec les joueurs qui arrivent et défie jusqu’à 29 adversaires.',
    accent: 'from-neon-violet/25',
    bar: 'bg-neon-violet',
  },
  {
    to: '/multi/join',
    tag: 'Multijoueur',
    title: 'Rejoindre une partie',
    text: 'Choisis une salle dans la liste des parties en attente, ou entre son code.',
    accent: 'from-neon-blue/25',
    bar: 'bg-neon-blue',
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

  return (
    <div className="space-y-10 sm:space-y-14">
      {/* --- Bandeau principal ------------------------------------------------ */}
      <section className="card relative overflow-hidden px-5 py-8 sm:px-10 sm:py-14">
        {/* Décor : faisceaux diagonaux, grand éclair en filigrane */}
        <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,transparent_30%,rgb(45_226_230/0.10)_45%,transparent_60%),linear-gradient(115deg,transparent_55%,rgb(139_92_246/0.14)_68%,transparent_80%)]" aria-hidden="true" />
        <LogoMark className="pointer-events-none absolute -right-10 -top-6 h-72 w-72 rotate-12 opacity-[0.07] sm:-right-4 sm:h-96 sm:w-96" />
        <span className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-neon-cyan/0 via-neon-cyan/60 to-neon-violet/0" aria-hidden="true" />

        <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-end">
          <div className="animate-fade-up">
            <p className="mb-3 flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-[0.3em] text-neon-cyan">
              <span className="h-0.5 w-8 bg-neon-cyan" aria-hidden="true" />
              Quiz gaming compétitif
            </p>
            <h1 className="font-display text-5xl font-bold uppercase leading-[0.9] tracking-wide text-white sm:text-7xl">
              Gaming Quiz
              <span className="block text-gradient">Battle</span>
            </h1>
            <p className="mt-5 max-w-xl text-base text-slate-300 sm:text-lg">
              Minecraft, LoL, CS, Fortnite, Pokémon, WoW… Prouve que tu es le vrai{' '}
              <span className="font-semibold text-neon-cyan">pro du gaming</span>.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <LinkButton to="/solo" size="lg">
                <PlayIcon className="h-5 w-5" />
                Jouer en solo
              </LinkButton>
              <LinkButton to="/multi/join" variant="secondary" size="lg">
                Multijoueur
              </LinkButton>
            </div>
          </div>

          {/* Panneau « en direct » */}
          <div className="animate-fade-up space-y-3 [animation-delay:120ms]">
            <div className="rounded-md border border-white/10 bg-ink-950/60 p-4">
              <p className="label-caps flex items-center gap-2">
                <span className="h-2 w-2 animate-pulse rounded-full bg-neon-green" aria-hidden="true" />
                En direct
              </p>
              <p className="mt-2 font-display text-4xl font-bold leading-none text-white tabular-nums">
                {stats ? formatNumber(stats.onlinePlayers) : statsError ? '—' : '…'}
              </p>
              <p className="text-sm text-slate-400">
                joueur{stats && stats.onlinePlayers > 1 ? 's' : ''} connecté{stats && stats.onlinePlayers > 1 ? 's' : ''}
              </p>
              {stats && (
                <div className="mt-3 grid grid-cols-2 gap-3 border-t border-white/[0.07] pt-3">
                  <div>
                    <p className="font-display text-xl font-bold leading-none text-white tabular-nums">{stats.questionCount}</p>
                    <p className="text-xs text-slate-500">questions</p>
                  </div>
                  <div>
                    <p className="font-display text-xl font-bold leading-none text-white tabular-nums">
                      {formatNumber(stats.finishedGames)}
                    </p>
                    <p className="text-xs text-slate-500">parties jouées</p>
                  </div>
                </div>
              )}
            </div>

            {player ? (
              <Link
                to="/profile"
                className="flex items-center gap-3 rounded-md border border-white/10 bg-ink-950/60 p-3 transition hover:border-neon-cyan/50"
              >
                <Avatar id={player.avatar} size="sm" />
                <span className="min-w-0 text-left">
                  <span className="label-caps block text-[0.65rem]">Connecté</span>
                  <span className="block truncate font-display text-lg font-bold leading-tight text-white">{player.pseudo}</span>
                </span>
                <ArrowRightIcon className="ml-auto h-4 w-4 text-slate-500" />
              </Link>
            ) : (
              <LinkButton to="/profile" variant="secondary" className="w-full">
                Choisir mon pseudo
              </LinkButton>
            )}
          </div>
        </div>
      </section>

      {/* --- Modes de jeu ------------------------------------------------------ */}
      <section aria-labelledby="modes-title">
        <h2 id="modes-title" className="label-caps mb-4 flex items-center gap-3">
          Modes de jeu
          <span className="h-px flex-1 bg-white/[0.07]" aria-hidden="true" />
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          {MODES.map((m, i) => (
            <Link
              key={m.to}
              to={m.to}
              className="card group relative flex min-h-52 animate-fade-up flex-col overflow-hidden p-6 transition duration-300 hover:-translate-y-1 hover:border-white/20 hover:glow-border"
              style={{ animationDelay: `${120 + i * 80}ms` }}
            >
              <span
                className={`absolute inset-0 bg-gradient-to-br ${m.accent} to-transparent opacity-50 transition group-hover:opacity-100`}
                aria-hidden="true"
              />
              {/* Barre de couleur à gauche, qui s'allonge au survol */}
              <span className={`absolute left-0 top-6 h-10 w-1 ${m.bar} transition-all duration-300 group-hover:h-[calc(100%-3rem)]`} aria-hidden="true" />
              <span
                className="absolute -right-2 -top-6 font-display text-8xl font-bold leading-none text-white/[0.04] transition group-hover:text-white/[0.08]"
                aria-hidden="true"
              >
                0{i + 1}
              </span>
              <span className="label-caps relative">{m.tag}</span>
              <h3 className="relative mt-1 font-display text-3xl font-bold uppercase leading-none tracking-wide text-white">
                {m.title}
              </h3>
              <p className="relative mt-3 text-sm text-slate-300">{m.text}</p>
              <span className="relative mt-auto inline-flex items-center gap-2 pt-5 font-display text-sm font-bold uppercase tracking-[0.2em] text-neon-cyan">
                C’est parti <ArrowRightIcon className="h-4 w-4 transition group-hover:translate-x-1" />
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* --- Classement et infrastructure ------------------------------------- */}
      <section className="grid gap-4 md:grid-cols-2">
        <Link to="/leaderboard" className="card group flex items-center gap-4 overflow-hidden p-5 transition hover:border-neon-amber/40">
          <span className="absolute inset-y-0 left-0 w-1 bg-neon-amber" aria-hidden="true" />
          <span className="min-w-0">
            <span className="label-caps block text-neon-amber">Hall of fame</span>
            <span className="block font-display text-2xl font-bold uppercase leading-tight text-white">Classement général</span>
            <span className="text-sm text-slate-400">Les meilleurs joueurs, au global et par catégorie.</span>
          </span>
          <ArrowRightIcon className="ml-auto h-5 w-5 shrink-0 text-slate-500 transition group-hover:translate-x-1 group-hover:text-neon-amber" />
        </Link>
        <Link to="/cloud-dashboard" className="card group flex items-center gap-4 overflow-hidden p-5 transition hover:border-neon-cyan/40">
          <span className="absolute inset-y-0 left-0 w-1 bg-neon-cyan" aria-hidden="true" />
          <span className="min-w-0">
            <span className="label-caps block text-neon-cyan">Infrastructure</span>
            <span className="block font-display text-2xl font-bold uppercase leading-tight text-white">Tableau de bord Cloud</span>
            <span className="text-sm text-slate-400">Quelle instance répond ? Observe le load balancing en direct.</span>
          </span>
          <ArrowRightIcon className="ml-auto h-5 w-5 shrink-0 text-slate-500 transition group-hover:translate-x-1 group-hover:text-neon-cyan" />
        </Link>
      </section>
    </div>
  );
}
