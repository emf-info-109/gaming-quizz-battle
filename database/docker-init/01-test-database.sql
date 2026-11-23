-- Exécuté automatiquement au premier démarrage du conteneur MySQL de développement.
-- Crée la base dédiée aux tests d'intégration (elle est vidée à chaque exécution de "npm test").
CREATE DATABASE IF NOT EXISTS gaming_quiz_test CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
GRANT ALL PRIVILEGES ON gaming_quiz_test.* TO 'quiz_app'@'%';
FLUSH PRIVILEGES;
