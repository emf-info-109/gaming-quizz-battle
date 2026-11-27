/** Barre de temps + compteur en secondes. */
export function TimerBar({ remainingMs, totalMs }: { remainingMs: number; totalMs: number }) {
  const ratio = totalMs > 0 ? Math.max(0, Math.min(1, remainingMs / totalMs)) : 0;
  const seconds = Math.ceil(remainingMs / 1000);
  const danger = remainingMs <= 5000;
  return (
    <div className="flex items-center gap-3" aria-label={`${seconds} secondes restantes`}>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink-700">
        <div
          className={`h-full origin-left rounded-full transition-[transform,background-color] duration-100 ease-linear ${danger ? 'bg-neon-red' : 'bg-neon-cyan'}`}
          style={{ transform: `scaleX(${ratio})` }}
        />
      </div>
      <span
        className={`w-10 text-right font-display text-2xl font-semibold leading-none tabular-nums ${danger ? 'text-neon-red' : 'text-slate-100'}`}
      >
        {seconds}
      </span>
    </div>
  );
}
