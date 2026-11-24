import { NavLink, Outlet } from 'react-router';
import { usePlayer } from '../hooks/PlayerContext';
import { Avatar } from './Avatar';
import { InstanceBadge } from './InstanceBadge';
import { Logo } from './Logo';

const navClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-lg px-3 py-1.5 text-sm font-medium transition ${isActive ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white'}`;

export function Layout() {
  const { player } = usePlayer();
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 border-b border-white/5 bg-ink-950/75 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <NavLink to="/" aria-label="Accueil Gaming Quiz Battle">
            <Logo />
          </NavLink>
          <nav className="flex items-center gap-1">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `mr-1 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold text-white shadow-md shadow-neon-blue/20 transition hover:brightness-110 ${
                  isActive
                    ? 'bg-gradient-to-r from-neon-blue to-neon-violet ring-1 ring-white/30'
                    : 'bg-gradient-to-r from-neon-blue/80 to-neon-violet/80'
                }`
              }
            >
              <span aria-hidden="true">▶</span>
              <span>Jouer</span>
            </NavLink>
            <NavLink to="/leaderboard" className={navClass}>
              <span className="hidden sm:inline">Classement</span>
              <span className="sm:hidden" aria-label="Classement">🏆</span>
            </NavLink>
            <NavLink to="/cloud-dashboard" className={navClass}>
              <span className="hidden sm:inline">Cloud</span>
              <span className="sm:hidden" aria-label="Tableau de bord Cloud">☁️</span>
            </NavLink>
            <NavLink to="/profile" className={({ isActive }) => `${navClass({ isActive })} flex items-center gap-2`}>
              {player ? (
                <>
                  <Avatar id={player.avatar} size="xs" />
                  <span className="hidden max-w-28 truncate md:inline">{player.pseudo}</span>
                </>
              ) : (
                <span>Profil</span>
              )}
            </NavLink>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:py-10">
        <Outlet />
      </main>

      <footer className="border-t border-white/5 bg-ink-950/60">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-3 sm:flex-row">
          <p className="text-xs text-slate-500">Gaming Quiz Battle · Laboratoire Cloud – module 109</p>
          <InstanceBadge />
        </div>
      </footer>
    </div>
  );
}
