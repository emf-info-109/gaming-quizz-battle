export function LogoMark({ className = 'h-10 w-10' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="gqb-logo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#22d3ee" />
          <stop offset=".5" stopColor="#2f7bff" />
          <stop offset="1" stopColor="#9b5cff" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="16" fill="#0b1030" stroke="url(#gqb-logo)" strokeWidth="2.5" />
      <path d="M36 9 17 36h13l-4 20 21-30H34z" fill="url(#gqb-logo)" />
    </svg>
  );
}

export function Logo({ size = 'md' }: { size?: 'md' | 'lg' }) {
  const big = size === 'lg';
  return (
    <span className="inline-flex items-center gap-3">
      <LogoMark className={big ? 'h-16 w-16 sm:h-20 sm:w-20 animate-float' : 'h-9 w-9'} />
      <span className={`font-display font-black uppercase leading-none tracking-wider ${big ? 'text-3xl sm:text-5xl' : 'text-base sm:text-lg'}`}>
        <span className="text-gradient">Gaming Quiz</span>
        <span className={`block text-slate-100 ${big ? 'mt-1 text-xl tracking-[0.5em] sm:text-2xl' : 'text-[0.65rem] tracking-[0.45em]'}`}>Battle</span>
      </span>
    </span>
  );
}
