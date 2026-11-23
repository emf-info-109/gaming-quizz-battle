import { useState } from 'react';
import { Avatar } from '../components/Avatar';
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

  const tabs = [{ slug: 'all', name: 'Global', icon: '🌍' }, ...(categories.data ?? [])];

  return (
    <div>
      <PageTitle kicker="Hall of fame" title="Classement">
        Calculé à partir des parties terminées (solo et multijoueur). Une question sans réponse compte comme une erreur.
      </PageTitle>

      <div className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-2" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.slug}
            role="tab"
            aria-selected={category === t.slug}
            onClick={() => setCategory(t.slug)}
            className={`shrink-0 rounded-xl border px-3 py-2 text-sm font-medium transition ${
              category === t.slug
                ? 'border-neon-cyan bg-neon-cyan/10 text-white'
                : 'border-white/10 text-slate-400 hover:border-white/20 hover:text-white'
            }`}
          >
            <span className="mr-1.5">{t.icon}</span>
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
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-white/5 text-left text-xs uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-4 py-3">#</th>
                  <th className="px-4 py-3">Joueur</th>
                  <th className="px-4 py-3 text-right">Parties</th>
                  <th className="px-4 py-3 text-right">Bonnes réponses</th>
                  <th className="px-4 py-3 text-right">Réussite</th>
                  <th className="px-4 py-3 text-right">Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {board.data.entries.map((e) => {
                  const me = e.playerId === player?.id;
                  return (
                    <tr key={e.playerId} className={me ? 'bg-neon-cyan/10' : 'hover:bg-white/[0.03]'}>
                      <td className="px-4 py-3 font-display font-bold text-slate-300">{MEDALS[e.rank - 1] ?? e.rank}</td>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-3">
                          <Avatar id={e.avatar} size="sm" />
                          <span className="font-semibold">
                            {e.pseudo}
                            {me && <span className="ml-2 text-xs text-neon-cyan">(toi)</span>}
                          </span>
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-300">{e.gamesPlayed}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-300">
                        {e.correctAnswers}
                        <span className="text-slate-500">/{e.questionsSeen}</span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-300">{formatPercent(e.successRate)}</td>
                      <td className="px-4 py-3 text-right font-display font-bold tabular-nums text-neon-cyan">
                        {formatNumber(e.totalScore)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
