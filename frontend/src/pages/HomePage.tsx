import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Avatar } from '../components/Avatar';
import { LinkButton } from '../components/Button';
import { Logo } from '../components/Logo';
import { usePlayer } from '../hooks/PlayerContext';
import { api } from '../lib/api';
import { formatNumber } from '../lib/format';
import type { GlobalStats } from '../lib/types';

const ACTIONS = [
  {
    to: '/solo',
    icon: '🎯',
    title: 'Jouer en solo',
    text: '10 questions, 15 secondes chacune. Plus tu es rapide, plus tu marques.',
    accent: 'from-neon-cyan/30',
  },
  {
    to: '/multi/create',
    icon: '⚔️',
    title: 'Créer une partie',
    text: 'Deviens l’organisateur, partage le code et défie jusqu’à 29 adversaires.',
    accent: 'from-neon-blue/30',
  },
  {
    to: '/multi/join',
    icon: '🚀',
    title: 'Rejoindre une partie',
    text: 'Entre le code à 6 caractères donné par l’organisateur.',
    accent: 'from-neon-violet/30',
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
      <section className="relative flex flex-col items-center pt-4 text-center sm:pt-8">
        <Logo size="lg" />
        <p className="mt-6 max-w-xl animate-fade-up text-base text-slate-300 sm:text-lg">
          Minecraft, LoL, CS, Fortnite, Pokémon, WoW… Prouve que tu es le vrai <span className="text-neon-cyan">pro du gaming</span>.
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3 text-sm">
          <span className="inline-flex items-center gap-2 rounded-full border border-neon-green/30 bg-neon-green/10 px-3 py-1 text-emerald-200">
            <span className="h-2 w-2 animate-pulse rounded-full bg-neon-green" aria-hidden="true" />
            {stats ? (
              <>
                <strong className="tabular-nums">{formatNumber(stats.onlinePlayers)}</strong>
                joueur{stats.onlinePlayers > 1 ? 's' : ''} connecté{stats.onlinePlayers > 1 ? 's' : ''}
              </>
            ) : statsError ? (
              'Statistiques indisponibles'
            ) : (
              'Connexion…'
            )}
          </span>
          {stats && (
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-slate-300">
              {stats.questionCount} questions · {formatNumber(stats.finishedGames)} parties jouées
            </span>
          )}
        </div>

        {player ? (
          <Link
            to="/profile"
            className="mt-6 inline-flex items-center gap-3 rounded-2xl border border-white/10 bg-ink-850/70 px-4 py-2 transition hover:border-neon-cyan/50"
          >
            <Avatar id={player.avatar} size="sm" />
            <span className="text-left text-sm">
              <span className="block text-slate-400">Connecté en tant que</span>
              <span className="font-semibold">{player.pseudo}</span>
            </span>
          </Link>
        ) : (
          <div className="mt-6">
            <LinkButton to="/profile" variant="secondary">
              ✨ Choisir mon pseudo et mon avatar
            </LinkButton>
          </div>
        )}
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {ACTIONS.map((a, i) => (
          <Link
            key={a.to}
            to={a.to}
            className="card group relative animate-fade-up overflow-hidden p-6 transition duration-300 hover:-translate-y-1 hover:glow-border"
            style={{ animationDelay: `${120 + i * 80}ms` }}
          >
            <span className={`absolute inset-0 bg-gradient-to-br ${a.accent} to-transparent opacity-60 transition group-hover:opacity-100`} aria-hidden="true" />
            <span className="relative block text-4xl transition group-hover:scale-110">{a.icon}</span>
            <h2 className="relative mt-4 font-display text-lg font-bold uppercase tracking-wide">{a.title}</h2>
            <p className="relative mt-2 text-sm text-slate-300">{a.text}</p>
            <span className="relative mt-5 inline-flex items-center gap-1 text-sm font-semibold text-neon-cyan">
              C’est parti <span className="transition group-hover:translate-x-1">→</span>
            </span>
          </Link>
        ))}
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <Link to="/leaderboard" className="card group flex items-center gap-4 p-5 transition hover:border-neon-amber/40">
          <span className="text-4xl">🏆</span>
          <span>
            <span className="block font-display font-bold uppercase tracking-wide">Classement général</span>
            <span className="text-sm text-slate-400">Les meilleurs joueurs, au global et par catégorie.</span>
          </span>
          <span className="ml-auto text-slate-500 transition group-hover:translate-x-1 group-hover:text-neon-amber">→</span>
        </Link>
        <Link to="/cloud-dashboard" className="card group flex items-center gap-4 p-5 transition hover:border-neon-cyan/40">
          <span className="text-4xl">☁️</span>
          <span>
            <span className="block font-display font-bold uppercase tracking-wide">Tableau de bord Cloud</span>
            <span className="text-sm text-slate-400">Quelle instance répond ? Observe le load balancing en direct.</span>
          </span>
          <span className="ml-auto text-slate-500 transition group-hover:translate-x-1 group-hover:text-neon-cyan">→</span>
        </Link>
      </section>
    </div>
  );
}
