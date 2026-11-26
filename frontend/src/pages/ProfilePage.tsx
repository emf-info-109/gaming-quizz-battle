import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { Alert, PageTitle, StatTile } from '../components/Feedback';
import { usePlayer } from '../hooks/PlayerContext';
import { api, errorMessage } from '../lib/api';
import { AVATAR_GROUPS, AVATAR_IDS, avatarOf } from '../lib/avatars';
import { formatNumber, formatPercent } from '../lib/format';
import type { PlayerStats } from '../lib/types';

/** Seules les redirections internes sont autorisées (pas de redirection ouverte). */
function safeNext(raw: string | null): string | null {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return null;
  return raw;
}

export function ProfilePage() {
  const { player, createProfile, updateProfile, forget } = usePlayer();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const navigate = useNavigate();

  const [pseudo, setPseudo] = useState(player?.pseudo ?? '');
  const [avatar, setAvatar] = useState(player?.avatar ?? AVATAR_IDS[0]!);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [stats, setStats] = useState<PlayerStats | null>(null);

  useEffect(() => {
    if (player) {
      setPseudo(player.pseudo);
      setAvatar(player.avatar);
      api.myStats().then(setStats).catch(() => setStats(null));
    }
  }, [player]);

  const trimmed = pseudo.trim();
  const valid = trimmed.length >= 3 && trimmed.length <= 20;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      if (player) {
        await updateProfile({ pseudo: trimmed, avatar });
        setSaved(true);
      } else {
        await createProfile(trimmed, avatar);
      }
      if (next) navigate(next, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageTitle kicker={player ? 'Mon profil' : 'Nouveau joueur'} title={player ? 'Ton profil de joueur' : 'Choisis ton identité'}>
        Aucun compte, aucune donnée personnelle : juste un pseudo et un avatar.
      </PageTitle>

      <form onSubmit={onSubmit} className="card space-y-6 p-5 sm:p-7">
        <div className="flex items-center gap-4">
          <Avatar id={avatar} size="xl" ring />
          <div className="flex-1">
            <label htmlFor="pseudo" className="mb-2 block text-sm font-medium text-slate-300">
              Pseudo <span className="text-slate-500">(3 à 20 caractères)</span>
            </label>
            <input
              id="pseudo"
              className="input font-semibold"
              value={pseudo}
              onChange={(e) => setPseudo(e.target.value)}
              maxLength={20}
              placeholder="ex : CreeperSlayer"
              autoComplete="off"
              autoFocus={!player}
              required
            />
          </div>
        </div>

        <fieldset className="space-y-4">
          <legend className="mb-3 text-sm font-medium text-slate-300">Avatar</legend>
          {AVATAR_GROUPS.map((group) => (
            <div key={group.title}>
              <p className="label-caps mb-2">{group.title}</p>
              <div className="grid grid-cols-4 gap-2 min-[400px]:grid-cols-5 sm:grid-cols-6 md:grid-cols-8">
            {group.ids.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setAvatar(id)}
                className={`flex flex-col items-center gap-1 rounded-md border p-2 transition ${
                  avatar === id ? 'border-neon-cyan bg-neon-cyan/10' : 'border-transparent hover:bg-white/5'
                }`}
                aria-pressed={avatar === id}
                title={avatarOf(id).label}
              >
                <Avatar id={id} size="md" />
                <span className="w-full truncate text-center text-[0.65rem] text-slate-400">{avatarOf(id).label}</span>
              </button>
            ))}
              </div>
            </div>
          ))}
        </fieldset>

        {error && <Alert>{error}</Alert>}
        {saved && <Alert tone="success">Profil mis à jour !</Alert>}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" size="lg" loading={saving} disabled={!valid}>
            {player ? 'Enregistrer' : next ? 'Créer mon profil et continuer' : 'Créer mon profil'}
          </Button>
          {player && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                if (confirm('Oublier ce profil sur cet appareil ? Tu ne pourras plus le récupérer.')) forget();
              }}
            >
              Changer de joueur
            </Button>
          )}
        </div>
      </form>

      {player && stats && (
        <section className="mt-8">
          <h2 className="mb-4 font-display text-lg font-bold uppercase tracking-wide">Mes statistiques</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="Score cumulé" value={formatNumber(stats.totalScore)} accent="text-neon-cyan" />
            <StatTile label="Parties" value={stats.gamesPlayed} hint={`${stats.soloGames} solo · ${stats.multiGames} multi`} />
            <StatTile label="Bonnes réponses" value={`${stats.correctAnswers}/${stats.questionsSeen}`} />
            <StatTile label="Réussite" value={formatPercent(stats.successRate)} accent="text-neon-green" />
          </div>
          {stats.recentGames.length > 0 && (
            <div className="card mt-4 divide-y divide-white/5">
              {stats.recentGames.map((g) => (
                <div key={g.gameId} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  <span className="flex items-center gap-2">
                    <span className="rounded-md bg-white/5 px-2 py-0.5 text-xs uppercase text-slate-400">{g.mode}</span>
                    {g.category ?? 'Toutes catégories'}
                  </span>
                  <span className="text-slate-400">
                    {g.correctCount}/{g.questionCount} ·{' '}
                    <strong className="text-white tabular-nums">{formatNumber(g.score)} pts</strong>
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
