/**
 * Collection prédéfinie d'avatars. Le frontend possède le rendu (emoji),
 * le backend n'accepte que ces identifiants.
 */
export const AVATARS = [
  'dragon', 'robot', 'ninja', 'alien',
  'wizard', 'knight', 'ghost', 'fox',
  'cat', 'skull', 'unicorn', 'wolf',
  'invader', 'octopus', 'panda', 'tiger',
  // Archétypes de comics et de manga (aucun personnage protégé)
  'superhero', 'supervillain', 'vampire', 'zombie',
  'oni', 'tengu', 'genie', 'onigiri',
  // Pour rire
  'moai', 'clown', 'duck', 'potato', 'nerd', 'chicken',
] as const;

export type AvatarId = (typeof AVATARS)[number];

export function isAvatarId(value: string): value is AvatarId {
  return (AVATARS as readonly string[]).includes(value);
}
