import { DiceIcon, GlobeIcon } from './Icons';
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
  xs: { box: 'h-5 w-5 rounded', img: 'h-3.5 w-3.5', icon: 'h-3 w-3' },
  sm: { box: 'h-7 w-7 rounded-md', img: 'h-5 w-5', icon: 'h-4 w-4' },
  md: { box: 'h-11 w-11 rounded-lg', img: 'h-7 w-7', icon: 'h-5 w-5' },
  lg: { box: 'h-14 w-14 rounded-lg', img: 'h-9 w-9', icon: 'h-7 w-7' },
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
      className={`inline-flex shrink-0 items-center justify-center border border-white/10 bg-ink-950 ${s.box}`}
      title={name}
    >
      {src ? (
        <img src={src} alt={name ? `Logo ${name}` : ''} className={`${s.img} object-contain`} draggable={false} />
      ) : (
        <span className="text-slate-400">{slug === 'global' ? <GlobeIcon className={s.icon} /> : <DiceIcon className={s.icon} />}</span>
      )}
    </span>
  );
}
