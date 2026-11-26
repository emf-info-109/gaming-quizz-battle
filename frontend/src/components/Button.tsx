import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

/**
 * Boutons façon launcher : capitales condensées, coins coupés.
 * primary = action principale (cyan plein, texte sombre) ; secondary = contour.
 */
const VARIANTS: Record<Variant, string> = {
  primary:
    'chamfer bg-gradient-to-r from-neon-cyan to-[#4fb8ff] text-ink-950 shadow-[0_0_28px_-6px] shadow-neon-cyan/60 hover:brightness-110 hover:shadow-neon-cyan',
  secondary:
    'chamfer bg-white/[0.06] text-slate-100 ring-1 ring-inset ring-white/15 hover:bg-neon-cyan/10 hover:text-neon-cyan hover:ring-neon-cyan/60',
  ghost: 'rounded-md text-slate-400 hover:bg-white/5 hover:text-white',
  danger: 'chamfer bg-neon-red/15 text-neon-red ring-1 ring-inset ring-neon-red/40 hover:bg-neon-red/25',
};
const SIZES: Record<Size, string> = {
  sm: 'px-3.5 py-1.5 text-sm tracking-[0.12em]',
  md: 'px-6 py-2.5 text-base tracking-[0.14em]',
  lg: 'px-8 py-3.5 text-lg tracking-[0.16em] sm:text-xl',
};

export function buttonClass(variant: Variant = 'primary', size: Size = 'md', extra = '') {
  return `inline-flex items-center justify-center gap-2 font-display font-bold uppercase leading-none transition duration-200 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40 ${VARIANTS[variant]} ${SIZES[size]} ${extra}`;
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export function Button({ variant = 'primary', size = 'md', loading, className = '', children, disabled, ...rest }: ButtonProps) {
  return (
    <button className={buttonClass(variant, size, className)} disabled={disabled || loading} {...rest}>
      {loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {children}
    </button>
  );
}

export function LinkButton({
  to,
  variant = 'primary',
  size = 'md',
  className = '',
  children,
}: {
  to: string;
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link to={to} className={buttonClass(variant, size, className)}>
      {children}
    </Link>
  );
}
