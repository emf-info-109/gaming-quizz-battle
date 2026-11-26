import { useState } from 'react';
import { Avatar } from '../components/Avatar';
import { CategoryLogo } from '../components/CategoryLogo';
import { Alert, PageTitle, Spinner } from '../components/Feedback';
import { usePlayer } from '../hooks/PlayerContext';
import { useAsync } from '../hooks/useAsync';
import { api } from '../lib/api';
import { formatNumber, formatPercent } from '../lib/format';

const MEDALS = ['🥇', '🥈', '🥉'];

export function LeaderboardPage() {
  const { player } = usePlayer();
  const [category, setCategory] = useState('all');
  const categories = useAsync(() => api.categories(), []);
  const board = useAsync(() => api.leaderboard(category), [category]);

  const tabs = [{ slug: 'all', name: 'Global' }, ...(categories.data ?? [])];

  return (
    <div>
      <PageTitle kicker="Hall of fame" title="Classement">
        Calculé à partir des parties terminées (solo et multijoueur). Une question sans réponse compte comme une erreur.
      </PageTitle>

      {/* Filtres par jeu : grille régulière (2 colonnes sur mobile, 4 ensuite), sans défilement horizontal. */}
      <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4" role="tablist" aria-label="Filtrer par jeu">
        {tabs.map((t) => (
          <button
            key={t.slug}
            role="tab"
            aria-selected={category === t.slug}
            onClick={() => setCategory(t.slug)}
            className={`flex min-w-0 items-center gap-2 rounded-md border p-1.5 pr-2.5 text-left text-xs leading-tight font-medium transition sm:pr-3 sm:text-sm ${
              category === t.slug
                ? 'border-neon-cyan bg-neon-cyan/10 text-white'
                : 'border-white/10 text-slate-400 hover:border-white/20 hover:text-white'
            }`}
          >
            <CategoryLogo slug={t.slug === 'all' ? 'global' : t.slug} name={t.name} size="sm" />
            {t.name}
          </button>
        ))}
      </div>

      {board.error && <Alert>{board.error}</Alert>}
      {board.loading && !board.data && <Spinner />}
      {board.data && board.data.entries.length === 0 && (
        <div className="card p-10 text-center text-slate-400">Aucune partie terminée pour l’instant. Sois le premier !</div>
      )}
      {board.data && board.data.entries.length > 0 && (
        <div className={`card overflow-hidden transition ${board.loading ? 'opacity-60' : ''}`}>
          {/* Sur mobile : rang, joueur et score ; le détail passe sous le pseudo. */}
          <table className="w-full table-fixed text-sm sm:table-auto">
            <thead className="bg-white/5 text-left text-xs uppercase tracking-wider text-slate-400">
              <tr>
                <th className="w-11 py-3 pl-4 pr-1 sm:w-auto sm:px-4">#</th>
                <th className="px-2 py-3 sm:px-4">Joueur</th>
                <th className="hidden px-4 py-3 text-right sm:table-cell">Parties</th>
                <th className="hidden px-4 py-3 text-right md:table-cell">Bonnes réponses</th>
                <th className="hidden px-4 py-3 text-right sm:table-cell">Réussite</th>
                <th className="w-[5.5rem] py-3 pl-2 pr-4 text-right sm:w-auto sm:px-4">Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {board.data.entries.map((e) => {
                const me = e.playerId === player?.id;
                return (
                  <tr key={e.playerId} className={me ? 'bg-neon-cyan/10' : 'hover:bg-white/[0.03]'}>
                    <td className="py-3 pl-4 pr-1 font-display font-bold text-slate-300 sm:px-4">{MEDALS[e.rank - 1] ?? e.rank}</td>
                    <td className="px-2 py-3 sm:px-4">
                      <span className="flex min-w-0 items-center gap-2.5 sm:gap-3">
                        <Avatar id={e.avatar} size="sm" />
                        <span className="min-w-0">
                          <span className="flex items-baseline gap-2 font-semibold">
                            <span className="truncate">{e.pseudo}</span>
                            {me && <span className="shrink-0 text-xs text-neon-cyan">(toi)</span>}
                          </span>
                          <span className="block truncate text-xs text-slate-400 sm:hidden">
                            {e.gamesPlayed} partie{e.gamesPlayed > 1 ? 's' : ''} · {formatPercent(e.successRate)}
                          </span>
                        </span>
                      </span>
                    </td>
                    <td className="hidden px-4 py-3 text-right tabular-nums text-slate-300 sm:table-cell">{e.gamesPlayed}</td>
                    <td className="hidden px-4 py-3 text-right tabular-nums text-slate-300 md:table-cell">
                      {e.correctAnswers}
                      <span className="text-slate-500">/{e.questionsSeen}</span>
                    </td>
                    <td className="hidden px-4 py-3 text-right tabular-nums text-slate-300 sm:table-cell">{formatPercent(e.successRate)}</td>
                    <td className="py-3 pl-2 pr-4 text-right font-display font-bold tabular-nums text-neon-cyan sm:px-4">
                      {formatNumber(e.totalScore)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
