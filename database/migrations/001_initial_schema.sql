-- =============================================================================
--  Migration 001 – Schéma initial de Gaming Quiz Battle
--  MySQL 8.0+ / InnoDB / utf8mb4
--
--  Principe : TOUT l'état applicatif (joueurs, parties, réponses, scores) vit
--  ici. Les instances web (WEB-01, WEB-02, ...) ne gardent rien en mémoire.
-- =============================================================================

-- -----------------------------------------------------------------------------
--  Catégories de quiz (identifiants fixes, insérées par les seeds)
-- -----------------------------------------------------------------------------
CREATE TABLE categories (
  id           SMALLINT UNSIGNED NOT NULL,
  slug         VARCHAR(40)  NOT NULL,
  name         VARCHAR(60)  NOT NULL,
  description  VARCHAR(255) NOT NULL DEFAULT '',
  icon         VARCHAR(16)  NOT NULL DEFAULT '',
  color        CHAR(7)      NOT NULL DEFAULT '#3b82f6',
  sort_order   SMALLINT     NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_categories_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------------------------
--  Questions : 4 réponses, une seule correcte (index 0..3)
-- -----------------------------------------------------------------------------
CREATE TABLE questions (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  code           VARCHAR(16)  NOT NULL COMMENT 'Identifiant stable (ex: MC-01) utilisé par les seeds',
  category_id    SMALLINT UNSIGNED NOT NULL,
  difficulty     ENUM('easy','medium','hard') NOT NULL,
  prompt         VARCHAR(500) NOT NULL,
  answer_1       VARCHAR(200) NOT NULL,
  answer_2       VARCHAR(200) NOT NULL,
  answer_3       VARCHAR(200) NOT NULL,
  answer_4       VARCHAR(200) NOT NULL,
  correct_index  TINYINT UNSIGNED NOT NULL,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_questions_code (code),
  KEY idx_questions_category (category_id, is_active),
  CONSTRAINT fk_questions_category FOREIGN KEY (category_id) REFERENCES categories (id),
  CONSTRAINT chk_questions_correct_index CHECK (correct_index BETWEEN 0 AND 3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------------------------
--  Joueurs anonymes
--  token_hash = SHA-256 du jeton secret remis au navigateur. Le jeton en clair
--  n'est jamais stocké : n'importe quelle instance peut vérifier un joueur
--  en recalculant le hash (aucune session en mémoire).
-- -----------------------------------------------------------------------------
CREATE TABLE players (
  id            CHAR(36)    NOT NULL COMMENT 'UUID généré par le serveur',
  pseudo        VARCHAR(20) NOT NULL,
  avatar        VARCHAR(32) NOT NULL,
  token_hash    CHAR(64)    NOT NULL,
  created_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_seen_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_players_token_hash (token_hash),
  KEY idx_players_last_seen (last_seen_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------------------------
--  Parties (solo et multijoueur)
--  Les durées sont copiées dans la partie au moment de sa création : l'état
--  courant d'une partie multijoueur se calcule uniquement avec started_at,
--  ces durées et l'heure du serveur MySQL (NOW(3)).
-- -----------------------------------------------------------------------------
CREATE TABLE games (
  id                          CHAR(36) NOT NULL,
  code                        CHAR(6)  NULL COMMENT 'Code à 6 caractères (multijoueur uniquement)',
  mode                        ENUM('solo','multi') NOT NULL,
  host_player_id              CHAR(36) NOT NULL,
  category_id                 SMALLINT UNSIGNED NULL COMMENT 'NULL = toutes catégories',
  status                      ENUM('lobby','in_progress','finished','cancelled') NOT NULL,
  question_count              TINYINT UNSIGNED NOT NULL,
  question_duration_ms        INT UNSIGNED NOT NULL,
  reveal_duration_ms          INT UNSIGNED NOT NULL,
  countdown_ms                INT UNSIGNED NOT NULL,
  max_players                 SMALLINT UNSIGNED NOT NULL,
  current_position            TINYINT UNSIGNED NULL COMMENT 'Solo : question en cours',
  current_question_started_at DATETIME(3) NULL COMMENT 'Solo : heure serveur d''affichage de la question en cours',
  created_at                  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  started_at                  DATETIME(3) NULL,
  finished_at                 DATETIME(3) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_games_code (code),
  KEY idx_games_status_created (status, created_at),
  KEY idx_games_host (host_player_id),
  CONSTRAINT fk_games_host FOREIGN KEY (host_player_id) REFERENCES players (id),
  CONSTRAINT fk_games_category FOREIGN KEY (category_id) REFERENCES categories (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------------------------
--  Questions tirées pour une partie (même ordre pour tous les joueurs)
-- -----------------------------------------------------------------------------
CREATE TABLE game_questions (
  game_id      CHAR(36) NOT NULL,
  position     TINYINT UNSIGNED NOT NULL,
  question_id  INT UNSIGNED NOT NULL,
  PRIMARY KEY (game_id, position),
  KEY idx_game_questions_question (question_id),
  CONSTRAINT fk_game_questions_game FOREIGN KEY (game_id) REFERENCES games (id) ON DELETE CASCADE,
  CONSTRAINT fk_game_questions_question FOREIGN KEY (question_id) REFERENCES questions (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------------------------
--  Participants et score de chaque joueur dans une partie
--  Le score n'est modifié QUE par le serveur, dans la même transaction que
--  l'insertion de la réponse.
-- -----------------------------------------------------------------------------
CREATE TABLE game_players (
  game_id         CHAR(36) NOT NULL,
  player_id       CHAR(36) NOT NULL,
  joined_at       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  score           INT UNSIGNED NOT NULL DEFAULT 0,
  correct_count   TINYINT UNSIGNED NOT NULL DEFAULT 0,
  answered_count  TINYINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (game_id, player_id),
  KEY idx_game_players_player (player_id),
  CONSTRAINT fk_game_players_game FOREIGN KEY (game_id) REFERENCES games (id) ON DELETE CASCADE,
  CONSTRAINT fk_game_players_player FOREIGN KEY (player_id) REFERENCES players (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------------------------
--  Réponses : la contrainte UNIQUE empêche physiquement un joueur de répondre
--  deux fois à la même question, même si deux requêtes arrivent en même temps
--  sur deux instances différentes.
-- -----------------------------------------------------------------------------
CREATE TABLE answers (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  game_id         CHAR(36) NOT NULL,
  player_id       CHAR(36) NOT NULL,
  position        TINYINT UNSIGNED NOT NULL,
  question_id     INT UNSIGNED NOT NULL,
  selected_index  TINYINT UNSIGNED NULL COMMENT 'NULL = temps écoulé sans réponse',
  is_correct      BOOLEAN NOT NULL,
  response_ms     INT UNSIGNED NOT NULL,
  points          INT UNSIGNED NOT NULL,
  answered_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_answers_one_per_question (game_id, player_id, position),
  KEY idx_answers_player (player_id),
  KEY idx_answers_question (question_id),
  CONSTRAINT fk_answers_game_player FOREIGN KEY (game_id, player_id) REFERENCES game_players (game_id, player_id) ON DELETE CASCADE,
  CONSTRAINT fk_answers_question FOREIGN KEY (question_id) REFERENCES questions (id),
  CONSTRAINT chk_answers_selected CHECK (selected_index IS NULL OR selected_index BETWEEN 0 AND 3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
