-- =============================================================================
--  Migration 002 – Salle d'attente : nom de partie, liste publique et chat
--
--  - games.name        : nom donné par l'organisateur (multijoueur uniquement)
--  - games.is_public   : la partie apparaît dans la liste « Parties en attente »
--  - game_players.last_seen_at : dernière requête du joueur sur la partie ;
--    sert à ne lister que les salles dont l'organisateur est encore là.
--  - game_messages     : messages du chat de la salle d'attente (et annonces
--    automatiques « X a rejoint la salle »).
-- =============================================================================

ALTER TABLE games
  ADD COLUMN name      VARCHAR(40) NULL COMMENT 'Nom de la partie (multijoueur)' AFTER code,
  ADD COLUMN is_public BOOLEAN NOT NULL DEFAULT TRUE COMMENT 'Visible dans la liste des parties en attente' AFTER name;

ALTER TABLE game_players
  ADD COLUMN last_seen_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Dernière requête du joueur sur cette partie';

CREATE TABLE game_messages (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  game_id     CHAR(36) NOT NULL,
  player_id   CHAR(36) NULL COMMENT 'NULL = message automatique',
  kind        ENUM('chat','system') NOT NULL DEFAULT 'chat',
  body        VARCHAR(200) NOT NULL,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_game_messages_game (game_id, id),
  CONSTRAINT fk_game_messages_game FOREIGN KEY (game_id) REFERENCES games (id) ON DELETE CASCADE,
  CONSTRAINT fk_game_messages_player FOREIGN KEY (player_id) REFERENCES players (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
