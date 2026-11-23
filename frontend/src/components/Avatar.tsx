import { avatarOf } from '../lib/avatars';

const SIZES = { xs: 'h-7 w-7 text-sm', sm: 'h-9 w-9 text-lg', md: 'h-12 w-12 text-2xl', lg: 'h-16 w-16 text-3xl', xl: 'h-24 w-24 text-5xl' };

export function Avatar({ id, size = 'md', ring = false }: { id: string; size?: keyof typeof SIZES; ring?: boolean }) {
  const a = avatarOf(id);
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full ${SIZES[size]} ${ring ? 'ring-2 ring-neon-cyan ring-offset-2 ring-offset-ink-900' : ''}`}
      style={{ background: `linear-gradient(135deg, ${a.from}, ${a.to})` }}
      role="img"
      aria-label={a.label}
    >
      <span className="drop-shadow">{a.emoji}</span>
    </span>
  );
}
