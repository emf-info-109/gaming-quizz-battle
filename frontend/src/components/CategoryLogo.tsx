import counterStrike from '../assets/logos/counter-strike.svg';
import fortnite from '../assets/logos/fortnite.svg';
import gamingCulture from '../assets/logos/gaming-culture.svg';
import leagueOfLegends from '../assets/logos/league-of-legends.svg';
import minecraft from '../assets/logos/minecraft.svg';
import pokemon from '../assets/logos/pokemon.svg';
import worldOfWarcraft from '../assets/logos/world-of-warcraft.svg';

/**
 * Logo officiel du jeu de chaque catégorie (sources et licences : assets/logos/README.md).
 * Les logos sont affichés via <img> : un SVG chargé ainsi ne peut exécuter aucun script.
 */
const LOGOS: Record<string, string> = {
  minecraft,
  'league-of-legends': leagueOfLegends,
  'counter-strike': counterStrike,
  fortnite,
  pokemon,
  'world-of-warcraft': worldOfWarcraft,
  'gaming-culture': gamingCulture,
};

const SIZES = {
  xs: { box: 'h-5 w-5 rounded', img: 'h-3.5 w-3.5', emoji: 'text-xs' },
  sm: { box: 'h-7 w-7 rounded-md', img: 'h-5 w-5', emoji: 'text-base' },
  md: { box: 'h-11 w-11 rounded-md', img: 'h-7 w-7', emoji: 'text-2xl' },
  lg: { box: 'h-16 w-16 rounded-md', img: 'h-10 w-10', emoji: 'text-4xl' },
};

interface Props {
  /** slug de la catégorie, ou null / "all" pour « Toutes catégories » */
  slug: string | null | undefined;
  name?: string;
  size?: keyof typeof SIZES;
}

export function CategoryLogo({ slug, name, size = 'md' }: Props) {
  const s = SIZES[size];
  const src = slug ? LOGOS[slug] : undefined;
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center border border-white/10 bg-ink-950/60 ${s.box}`}
      title={name}
    >
      {src ? (
        <img src={src} alt={name ? `Logo ${name}` : ''} className={`${s.img} object-contain`} draggable={false} />
      ) : (
        <span className={s.emoji} aria-hidden="true">
          {slug === 'global' ? '🌍' : '🎲'}
        </span>
      )}
    </span>
  );
}
