import type { ReactNode } from 'react';

export function Spinner({ label = 'Chargement…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-400" role="status">
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-neon-cyan" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function Alert({ children, tone = 'error' }: { children: ReactNode; tone?: 'error' | 'info' | 'success' }) {
  const tones = {
    error: 'border-neon-red/30 bg-neon-red/[0.08] text-red-200',
    info: 'border-white/10 bg-ink-800 text-slate-200',
    success: 'border-neon-green/30 bg-neon-green/[0.08] text-emerald-100',
  };
  return (
    <div className={`rounded-lg border px-4 py-3 text-sm ${tones[tone]}`} role={tone === 'error' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}

export function PageTitle({ kicker, title, children }: { kicker?: string; title: string; children?: ReactNode }) {
  return (
    <header className="mb-8 animate-fade-up">
      {kicker && <p className="mb-2 text-sm font-medium text-slate-400">{kicker}</p>}
      <h1 className="font-display text-4xl font-semibold uppercase leading-none text-white sm:text-5xl">{title}</h1>
      {children && <p className="mt-4 max-w-2xl text-slate-400">{children}</p>}
    </header>
  );
}

export function StatTile({ label, value, hint, accent = 'text-white' }: { label: string; value: ReactNode; hint?: string; accent?: string }) {
  return (
    <div className="card p-4">
      <p className="label-caps">{label}</p>
      <p className={`mt-2 font-display text-3xl font-semibold leading-none tabular-nums ${accent}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}
