import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { usePlayer } from '../hooks/PlayerContext';
import { Spinner } from './Feedback';

/** Redirige vers la création de profil si le joueur n'en a pas encore. */
export function RequireProfile({ children }: { children: ReactNode }) {
  const { player, checking } = usePlayer();
  const location = useLocation();
  if (!player && checking) return <Spinner />;
  if (!player) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/profile?next=${next}`} replace />;
  }
  return <>{children}</>;
}
