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
};

export const AVATAR_IDS = Object.keys(AVATARS);

export function avatarOf(id: string) {
  return AVATARS[id] ?? { emoji: '🎮', label: 'Joueur', from: '#2f7bff', to: '#9b5cff' };
}
