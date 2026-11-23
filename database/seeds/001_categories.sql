-- =============================================================================
--  Seed 001 – Catégories (idempotent : peut être rejoué sans doublon)
-- =============================================================================
SET NAMES utf8mb4;

INSERT INTO categories (id, slug, name, description, icon, color, sort_order) VALUES
  (1, 'minecraft',        'Minecraft',              'Blocs, creepers et redstone',             '⛏️', '#22c55e', 1),
  (2, 'league-of-legends','League of Legends',      'La Faille de l’invocateur et son univers', '⚔️', '#eab308', 2),
  (3, 'counter-strike',   'Counter-Strike',         'Terroristes contre antiterroristes',       '🎯', '#f97316', 3),
  (4, 'fortnite',         'Fortnite',               'Battle Royale, constructions et emotes',   '🪂', '#a855f7', 4),
  (5, 'pokemon',          'Pokémon',                'Attrapez-les tous !',                      '⚡', '#ef4444', 5),
  (6, 'world-of-warcraft','World of Warcraft',      'Pour l’Alliance ou pour la Horde',         '🐉', '#3b82f6', 6),
  (7, 'gaming-culture',   'Culture gaming générale','Consoles, studios et légendes du jeu vidéo','🎮', '#06b6d4', 7)
AS new
ON DUPLICATE KEY UPDATE
  slug = new.slug, name = new.name, description = new.description,
  icon = new.icon, color = new.color, sort_order = new.sort_order;
