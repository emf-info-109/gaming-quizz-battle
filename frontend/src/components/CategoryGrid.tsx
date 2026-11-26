import type { Category } from '../lib/types';
import { CategoryLogo } from './CategoryLogo';

interface Props {
  categories: Category[];
  onPick: (slug: string) => void;
  busySlug?: string | null;
}

/** Grille de sélection de catégorie (+ « Toutes catégories »). */
export function CategoryGrid({ categories, onPick, busySlug }: Props) {
  const all: Category = {
    id: 0,
    slug: 'all',
    name: 'Toutes catégories',
    description: 'Un mélange de tous les univers',
    icon: '🎲',
    color: '#22d3ee',
    questionCount: categories.reduce((n, c) => n + c.questionCount, 0),
  };
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {[all, ...categories].map((c, i) => (
        <button
          key={c.slug}
          type="button"
          onClick={() => onPick(c.slug)}
          disabled={Boolean(busySlug)}
          className="card group relative animate-fade-up overflow-hidden p-5 text-left transition duration-200 hover:-translate-y-1 hover:border-white/20 disabled:opacity-60"
          style={{ animationDelay: `${i * 40}ms` }}
        >
          <span
            className="absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-20 blur-2xl transition group-hover:opacity-40"
            style={{ background: c.color }}
            aria-hidden="true"
          />
          <CategoryLogo slug={c.slug} name={c.name} size="lg" />
          <h3 className="mt-3 font-display text-xl font-bold uppercase leading-tight tracking-wide text-white">{c.name}</h3>
          <p className="mt-1 text-sm text-slate-400">{c.description}</p>
          <p className="mt-3 text-xs text-slate-500">{c.questionCount} questions</p>
          {busySlug === c.slug && (
            <span className="absolute inset-0 flex items-center justify-center bg-ink-900/70">
              <span className="h-6 w-6 animate-spin rounded-full border-2 border-neon-cyan border-t-transparent" />
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
