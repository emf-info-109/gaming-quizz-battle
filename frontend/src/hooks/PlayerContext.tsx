import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, ApiError } from '../lib/api';
import { getCachedPlayer, getToken, saveSession } from '../lib/session';
import type { Player } from '../lib/types';

interface PlayerContextValue {
  player: Player | null;
  /** true tant que le profil stocké n'a pas été vérifié auprès du serveur */
  checking: boolean;
  createProfile(pseudo: string, avatar: string): Promise<Player>;
  updateProfile(changes: Partial<Pick<Player, 'pseudo' | 'avatar'>>): Promise<Player>;
  forget(): void;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [player, setPlayer] = useState<Player | null>(() => (getToken() ? getCachedPlayer() : null));
  const [checking, setChecking] = useState<boolean>(() => Boolean(getToken()));

  useEffect(() => {
    if (!getToken()) return;
    let cancelled = false;
    api
      .me()
      .then((p) => {
        if (cancelled) return;
        setPlayer(p);
        saveSession(getToken(), p);
      })
      .catch((err) => {
        if (cancelled) return;
        // Jeton inconnu (ex : base réinitialisée) → on oublie le profil local.
        if (err instanceof ApiError && err.status === 401) {
          saveSession(null, null);
          setPlayer(null);
        }
      })
      .finally(() => !cancelled && setChecking(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const createProfile = useCallback(async (pseudo: string, avatar: string) => {
    const { player: p, token } = await api.createPlayer(pseudo, avatar);
    saveSession(token, p);
    setPlayer(p);
    return p;
  }, []);

  const updateProfile = useCallback(async (changes: Partial<Pick<Player, 'pseudo' | 'avatar'>>) => {
    const p = await api.updateMe(changes);
    saveSession(getToken(), p);
    setPlayer(p);
    return p;
  }, []);

  const forget = useCallback(() => {
    saveSession(null, null);
    setPlayer(null);
  }, []);

  const value = useMemo(
    () => ({ player, checking, createProfile, updateProfile, forget }),
    [player, checking, createProfile, updateProfile, forget],
  );
  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayer(): PlayerContextValue {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer doit être utilisé dans <PlayerProvider>');
  return ctx;
}
