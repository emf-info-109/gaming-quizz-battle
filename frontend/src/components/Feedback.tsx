import type { ReactNode } from 'react';

export function Spinner({ label = 'Chargement…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-400" role="status">
      <span className="h-10 w-10 animate-spin rounded-full border-2 border-white/10 border-t-neon-cyan" />
      <span className="font-display text-sm font-semibold uppercase tracking-[0.2em]">{label}</span>
    </div>
  );
}

export function Alert({ children, tone = 'error' }: { children: ReactNode; tone?: 'error' | 'info' | 'success' }) {
  const tones = {
    error: 'border-neon-red/40 bg-neon-red/10 text-red-200',
    info: 'border-neon-blue/40 bg-neon-blue/10 text-blue-100',
    success: 'border-neon-green/40 bg-neon-green/10 text-emerald-100',
  };
  return (
    <div className={`rounded-md border-l-2 border-y-0 border-r-0 px-4 py-3 text-sm ${tones[tone]}`} role={tone === 'error' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}

export function PageTitle({ kicker, title, children }: { kicker?: string; title: string; children?: ReactNode }) {
  return (
    <header className="mb-6 animate-fade-up sm:mb-8">
      {kicker && (
        <p className="mb-2 flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-[0.3em] text-neon-cyan">
          <span className="h-0.5 w-6 bg-neon-cyan" aria-hidden="true" />
          {kicker}
        </p>
      )}
      <h1 className="font-display text-3xl font-bold uppercase leading-none tracking-wide text-white sm:text-5xl">{title}</h1>
      {children && <p className="mt-3 max-w-2xl text-slate-400">{children}</p>}
    </header>
  );
}

export function StatTile({ label, value, hint, accent = 'text-white' }: { label: string; value: ReactNode; hint?: string; accent?: string }) {
  return (
    <div className="card p-4">
      <p className="label-caps">{label}</p>
      <p className={`mt-1 font-display text-3xl font-bold leading-tight ${accent}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}
