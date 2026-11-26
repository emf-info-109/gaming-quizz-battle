import { NavLink, Outlet } from 'react-router';
import { usePlayer } from '../hooks/PlayerContext';
import { Avatar } from './Avatar';
import { PlayIcon, ServerIcon, TrophyIcon } from './Icons';
import { InstanceBadge } from './InstanceBadge';
import { Logo } from './Logo';

/** Onglet de navigation : capitales espacées, soulignement cyan lumineux quand actif. */
const tabClass = ({ isActive }: { isActive: boolean }) =>
  `relative inline-flex h-16 min-w-9 items-center justify-center gap-2 px-1.5 font-display text-sm font-semibold uppercase tracking-[0.18em] transition sm:px-3.5 ${
    isActive
      ? 'text-white after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:bg-neon-cyan after:shadow-[0_0_12px] after:shadow-neon-cyan'
      : 'text-slate-400 hover:text-white'
  }`;

export function Layout() {
  const { player } = usePlayer();
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 border-b border-white/[0.06] bg-ink-950/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-1 px-4 min-[400px]:gap-2 sm:gap-4">
          <NavLink to="/" aria-label="Accueil Gaming Quiz Battle" className="shrink-0">
            <Logo compact />
          </NavLink>

          {/* Grand bouton JOUER, comme dans un launcher */}
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `chamfer ml-1 inline-flex h-10 shrink-0 items-center gap-1.5 bg-gradient-to-r from-neon-cyan to-[#4fb8ff] px-3 font-display text-base font-bold uppercase tracking-[0.12em] text-ink-950 transition hover:brightness-110 sm:ml-3 sm:px-5 sm:tracking-[0.2em] ${
                isActive ? 'shadow-[0_0_24px_-4px] shadow-neon-cyan' : ''
              }`
            }
          >
            <PlayIcon />
            Jouer
          </NavLink>

          <nav className="ml-auto flex h-16 items-center sm:ml-2" aria-label="Navigation principale">
            <NavLink to="/leaderboard" className={tabClass} aria-label="Classement">
              <TrophyIcon className="h-5 w-5 sm:hidden" />
              <span className="hidden sm:inline">Classement</span>
            </NavLink>
            <NavLink to="/cloud-dashboard" className={tabClass} aria-label="Tableau de bord Cloud">
              <ServerIcon className="h-5 w-5 sm:hidden" />
              <span className="hidden sm:inline">Cloud</span>
            </NavLink>
          </nav>

          <NavLink
            to="/profile"
            className={({ isActive }) =>
              `${tabClass({ isActive })} shrink-0 normal-case tracking-normal sm:ml-auto`
            }
            aria-label="Mon profil"
          >
            {player ? (
              <>
                <span className="relative">
                  <Avatar id={player.avatar} size="xs" />
                  <span
                    className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-ink-950 bg-neon-green"
                    aria-hidden="true"
                  />
                </span>
                <span className="hidden min-w-0 flex-col leading-tight md:flex">
                  <span className="max-w-32 truncate font-display text-base font-bold text-white">{player.pseudo}</span>
                  <span className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-neon-green">En ligne</span>
                </span>
              </>
            ) : (
              <span className="font-display font-semibold uppercase tracking-[0.18em]">Profil</span>
            )}
          </NavLink>
        </div>
        {/* Filet lumineux sous la barre */}
        <div className="h-px bg-gradient-to-r from-transparent via-neon-cyan/35 to-transparent" aria-hidden="true" />
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:py-10">
        <Outlet />
      </main>

      <footer className="border-t border-white/[0.06] bg-ink-950/70">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-3 sm:flex-row">
          <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            Gaming Quiz Battle · Laboratoire Cloud – module 109
          </p>
          <InstanceBadge />
        </div>
      </footer>
    </div>
  );
}
