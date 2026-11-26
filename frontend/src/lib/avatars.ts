/** Rendu des avatars (les identifiants sont validés par le backend). */
export const AVATARS: Record<string, { emoji: string; label: string; from: string; to: string }> = {
  dragon: { emoji: '🐉', label: 'Dragon', from: '#16a34a', to: '#22d3ee' },
  robot: { emoji: '🤖', label: 'Robot', from: '#2f7bff', to: '#22d3ee' },
  ninja: { emoji: '🥷', label: 'Ninja', from: '#334155', to: '#9b5cff' },
  alien: { emoji: '👽', label: 'Alien', from: '#22c55e', to: '#2f7bff' },
  wizard: { emoji: '🧙', label: 'Mage', from: '#9b5cff', to: '#f050c8' },
  knight: { emoji: '🛡️', label: 'Chevalier', from: '#64748b', to: '#2f7bff' },
  ghost: { emoji: '👻', label: 'Fantôme', from: '#9b5cff', to: '#22d3ee' },
  fox: { emoji: '🦊', label: 'Renard', from: '#f97316', to: '#f050c8' },
  cat: { emoji: '🐱', label: 'Chat', from: '#ffc94d', to: '#f97316' },
  skull: { emoji: '💀', label: 'Crâne', from: '#1e293b', to: '#ff4d6d' },
  unicorn: { emoji: '🦄', label: 'Licorne', from: '#f050c8', to: '#9b5cff' },
  wolf: { emoji: '🐺', label: 'Loup', from: '#475569', to: '#22d3ee' },
  invader: { emoji: '👾', label: 'Envahisseur', from: '#9b5cff', to: '#2f7bff' },
  octopus: { emoji: '🐙', label: 'Pieuvre', from: '#f050c8', to: '#ff4d6d' },
  panda: { emoji: '🐼', label: 'Panda', from: '#334155', to: '#2ee59d' },
  tiger: { emoji: '🐯', label: 'Tigre', from: '#f97316', to: '#ffc94d' },
  // Archétypes de comics et de manga
  superhero: { emoji: '🦸', label: 'Super-héros', from: '#2f7bff', to: '#ff4d6d' },
  supervillain: { emoji: '🦹', label: 'Super-vilain', from: '#1e1b4b', to: '#9b5cff' },
  vampire: { emoji: '🧛', label: 'Vampire', from: '#450a0a', to: '#ff4d6d' },
  zombie: { emoji: '🧟', label: 'Zombie', from: '#14532d', to: '#84cc16' },
  oni: { emoji: '👹', label: 'Oni', from: '#7f1d1d', to: '#f97316' },
  tengu: { emoji: '👺', label: 'Tengu', from: '#991b1b', to: '#f050c8' },
  genie: { emoji: '🧞', label: 'Génie', from: '#0e7490', to: '#9b5cff' },
  onigiri: { emoji: '🍙', label: 'Onigiri', from: '#334155', to: '#2ee59d' },
  // Pour rire
  moai: { emoji: '🗿', label: 'Moai', from: '#57534e', to: '#a8a29e' },
  clown: { emoji: '🤡', label: 'Clown', from: '#f050c8', to: '#ffc94d' },
  duck: { emoji: '🦆', label: 'Canard', from: '#15803d', to: '#ffc94d' },
  potato: { emoji: '🥔', label: 'Patate', from: '#78350f', to: '#d97706' },
  nerd: { emoji: '🤓', label: 'Intello', from: '#2f7bff', to: '#2ee59d' },
  chicken: { emoji: '🐔', label: 'Poulet', from: '#ff4d6d', to: '#ffc94d' },
};

export const AVATAR_IDS = Object.keys(AVATARS);

/** Regroupement affiché dans le choix d'avatar (dans l'ordre de AVATARS). */
export const AVATAR_GROUPS = [
  { title: 'Classiques', ids: AVATAR_IDS.slice(0, 16) },
  { title: 'Comics & manga', ids: AVATAR_IDS.slice(16, 24) },
  { title: 'Pour rire', ids: AVATAR_IDS.slice(24) },
];

export function avatarOf(id: string) {
  return AVATARS[id] ?? { emoji: '🎮', label: 'Joueur', from: '#2f7bff', to: '#9b5cff' };
}
