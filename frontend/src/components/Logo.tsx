/** Pictogramme : un éclair plein dans une tuile au filet cyan. Une seule couleur, pas de dégradé. */
export function LogoMark({ className = 'h-10 w-10' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect x="3" y="3" width="58" height="58" rx="14" fill="#111318" stroke="#2de2e6" strokeOpacity=".55" strokeWidth="2" />
      <path d="M36 11 18 36h12l-4 18 20-27H34z" fill="#2de2e6" />
    </svg>
  );
}

/**
 * `compact` (en-tête) : sur mobile, le nom passe sur deux lignes pour laisser de la place
 * au menu ; sur les petits écrans (< 375 px), seul le pictogramme est affiché.
 */
export function Logo({ size = 'md', compact = false }: { size?: 'md' | 'lg'; compact?: boolean }) {
  const big = size === 'lg';
  return (
    <span className={`inline-flex items-center ${compact ? 'gap-2 sm:gap-3' : 'gap-3'}`}>
      <LogoMark className={big ? 'h-16 w-16 sm:h-20 sm:w-20' : 'h-9 w-9'} />
      <span
        className={`font-brand font-semibold uppercase leading-none ${big ? 'text-3xl sm:text-5xl' : 'text-sm sm:text-base'} ${
          compact ? 'max-[374px]:sr-only' : ''
        }`}
      >
        <span className={`text-slate-100 ${compact ? 'max-sm:block max-sm:w-min' : ''}`}>Gaming Quiz</span>
        <span className={`block text-neon-cyan ${big ? 'mt-1 text-xl tracking-[0.4em] sm:text-2xl' : 'mt-0.5 text-[0.625rem] tracking-[0.4em]'}`}>Battle</span>
      </span>
    </span>
  );
}
