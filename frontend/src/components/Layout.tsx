import { NavLink, Outlet } from 'react-router';
import { usePlayer } from '../hooks/PlayerContext';
import { Avatar } from './Avatar';
import { PlayIcon, ServerIcon, TrophyIcon } from './Icons';
import { InstanceBadge } from './InstanceBadge';
import { Logo } from './Logo';

/** Onglet de navigation (le menu garde ses capitales) : soulignement cyan quand actif. */
const tabClass = ({ isActive }: { isActive: boolean }) =>
  `relative inline-flex h-16 min-w-9 items-center justify-center gap-2 px-1.5 font-display text-base font-semibold uppercase tracking-wider transition-colors sm:px-3 ${
    isActive ? 'text-white after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:bg-neon-cyan' : 'text-slate-400 hover:text-white'
  }`;

export function Layout() {
  const { player } = usePlayer();
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 border-b border-white/[0.08] bg-ink-950/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-1 px-4 min-[400px]:gap-2 sm:gap-4">
          <NavLink to="/" aria-label="Accueil Gaming Quiz Battle" className="shrink-0">
            <Logo compact />
          </NavLink>

          {/* Bouton JOUER, comme dans un launcher : la seule touche d'accent de la barre */}
          <NavLink
            to="/"
            end
            className="chamfer ml-1 inline-flex h-9 shrink-0 items-center gap-1.5 bg-neon-cyan px-3 font-display text-base font-semibold uppercase tracking-wider text-ink-950 transition-colors hover:bg-neon-cyan-hover sm:ml-3 sm:px-4"
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
              `relative inline-flex h-16 shrink-0 items-center gap-2 px-1.5 text-sm transition-colors sm:ml-auto sm:px-3 ${
                isActive ? 'text-white after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:bg-neon-cyan' : 'text-slate-400 hover:text-white'
              }`
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
                  <span className="max-w-32 truncate font-display text-base font-semibold text-white">{player.pseudo}</span>
                  <span className="text-xs font-normal text-slate-400">En ligne</span>
                </span>
              </>
            ) : (
              <span>Profil</span>
            )}
          </NavLink>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:py-12">
        <Outlet />
      </main>

      <footer className="border-t border-white/[0.08]">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-4 sm:flex-row">
          <p className="text-xs text-slate-500">
            Gaming Quiz Battle · Laboratoire Cloud – module 109
          </p>
          <InstanceBadge />
        </div>
      </footer>
    </div>
  );
}
