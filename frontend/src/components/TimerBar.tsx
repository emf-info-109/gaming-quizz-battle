/** Barre de temps + compteur en secondes. */
export function TimerBar({ remainingMs, totalMs }: { remainingMs: number; totalMs: number }) {
  const ratio = totalMs > 0 ? Math.max(0, Math.min(1, remainingMs / totalMs)) : 0;
  const seconds = Math.ceil(remainingMs / 1000);
  const danger = remainingMs <= 5000;
  return (
    <div className="flex items-center gap-3" aria-label={`${seconds} secondes restantes`}>
      <div className="h-3 flex-1 overflow-hidden rounded-full bg-ink-700">
        <div
          className={`h-full rounded-full transition-[width] duration-100 ease-linear ${
            danger ? 'bg-gradient-to-r from-neon-red to-neon-pink' : 'bg-gradient-to-r from-neon-cyan via-neon-blue to-neon-violet'
          }`}
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
      <span
        className={`w-12 text-right font-display text-xl font-bold tabular-nums ${danger ? 'text-neon-red' : 'text-neon-cyan'}`}
      >
        {seconds}
      </span>
    </div>
  );
}
