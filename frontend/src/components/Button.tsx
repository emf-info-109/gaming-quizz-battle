import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

/**
 * primary = action principale : cyan plein, texte sombre, coin coupé (la signature).
 * secondary = surface relevée avec un filet ; ghost = texte seul ; danger = rouge discret.
 */
const VARIANTS: Record<Variant, string> = {
  primary: 'chamfer bg-neon-cyan text-ink-950 hover:bg-neon-cyan-hover',
  secondary: 'rounded-lg bg-ink-800 text-slate-100 ring-1 ring-inset ring-white/10 hover:bg-ink-700',
  ghost: 'rounded-lg text-slate-400 hover:bg-white/5 hover:text-slate-100',
  danger: 'rounded-lg bg-neon-red/10 text-neon-red ring-1 ring-inset ring-neon-red/30 hover:bg-neon-red/15',
};
const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-5 text-base',
  lg: 'h-12 px-6 text-lg',
};

export function buttonClass(variant: Variant = 'primary', size: Size = 'md', extra = '') {
  return `inline-flex items-center justify-center gap-2 font-display font-semibold leading-none tracking-wide transition-[color,background-color,transform] duration-150 ease-out-soft active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 ${VARIANTS[variant]} ${SIZES[size]} ${extra}`;
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
