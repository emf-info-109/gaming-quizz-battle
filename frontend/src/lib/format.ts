export const formatNumber = (n: number) => new Intl.NumberFormat('fr-CH').format(Math.round(n));

export const formatMs = (ms: number) => (ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`);

export const formatPercent = (n: number) => `${n.toLocaleString('fr-CH', { maximumFractionDigits: 1 })} %`;

export const difficultyLabel: Record<string, string> = { easy: 'Facile', medium: 'Moyen', hard: 'Difficile' };

export const ANSWER_LETTERS = ['A', 'B', 'C', 'D'] as const;

export function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h} h ${m} min`;
  if (m > 0) return `${m} min ${s} s`;
  return `${s} s`;
}
