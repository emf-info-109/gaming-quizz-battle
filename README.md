# ⚡ Gaming Quiz Battle

Application web de quiz gaming (solo et multijoueur) conçue pour le **laboratoire Cloud du module 109**.

Le jeu est volontairement simple : l'objectif est de disposer d'une application **réaliste** à
déployer, sécuriser, superviser et rendre **hautement disponible** sur une infrastructure Azure
(ou Exoscale, ou locale).

```text
                   INTERNET
                      |
                HAProxy (HTTPS)          ← à configurer par les apprentis
                      |
             +--------+--------+
             v                 v
        VM WEB-01          VM WEB-02     ← Nginx (React statique) + Node/Express (systemd)
             |                 |
             +--------+--------+
                      v
                 VM DATABASE              ← MySQL 8
```

## Fonctionnalités

| Domaine | Contenu |
|---|---|
| Jeu | Mode solo (10 questions, 15 s, bonus de rapidité), multijoueur jusqu'à 30 joueurs avec code à 6 caractères, salle d'attente, chrono commun, classement après chaque question, podium |
| Contenu | 7 catégories, **140 questions** (20 par catégorie, 3 niveaux de difficulté) |
| Joueurs | Pseudo + avatar, sans compte ni donnée personnelle, identifiant UUID généré par le serveur |
| Classements | Global et par catégorie : parties jouées, bonnes réponses, score cumulé, taux de réussite |
| Cloud | `X-Instance-Name` sur chaque réponse, `GET /api/instance`, `GET /health`, `GET /ready`, page `/cloud-dashboard` avec générateur de requêtes et surveillance continue |
| Sécurité | Validation zod, requêtes SQL paramétrées, CORS restrictif, rate limiting, Helmet + CSP Nginx, aucune stack trace exposée, scores calculés uniquement côté serveur |

## Démarrage rapide (développement)

Prérequis : **Node.js ≥ 22.22** (24 LTS recommandé), **Docker** (pour le MySQL de développement).

Deux méthodes de déploiement sont documentées : **sans conteneur** (Node + Nginx + systemd,
méthode de référence) ou **avec Docker Compose** — voir les guides apprentis ci-dessous.

## Installation sur une VM Ubuntu (assistant)

Prérequis : une base MySQL et un utilisateur créés, Nginx installé. Puis, sur la VM web :

```bash
curl -fsSL https://raw.githubusercontent.com/emf-info-109/gaming-quizz-battle/main/install.sh | sudo bash
```

`install.sh` télécharge l'application dans `/opt/gaming-quiz-battle` et lance l'assistant
`setup.sh` (fenêtres `whiptail`) : nom du serveur, connexion MySQL **testée avant l'installation**,
puis installation de Node.js, compilation, service systemd et Nginx, avec barre de progression.
Au premier démarrage, l'application crée les tables et insère les 140 questions
(`AUTO_MIGRATE=true`). Relancer la même commande met l'application à jour en conservant la
configuration. Mode texte : `… | sudo bash -s -- --text`.

```bash
cp .env.example .env               # puis DB_PASSWORD=devpassword
docker compose up -d               # MySQL 8 de développement (+ base de test)
npm install                        # installe backend + frontend (npm workspaces)
npm run db:setup                   # migrations + 140 questions (facultatif : l'API le fait au démarrage)

npm run dev:backend                # terminal 1 → API sur http://127.0.0.1:3000
npm run dev:frontend               # terminal 2 → http://localhost:5173
```

Tests automatisés (unitaires + intégration sur MySQL, deux instances simulées) :

```bash
npm test
```

Détails : [docs/installation.md](docs/installation.md).

## Documentation

| Document | Pour quoi faire |
|---|---|
| 🐧 [docs/guide-apprenti-ubuntu.md](docs/guide-apprenti-ubuntu.md) | **Guide apprenti** : prérequis (MySQL, Nginx) puis installation en une commande avec l'assistant |
| 🐳 [docs/guide-apprenti-docker.md](docs/guide-apprenti-docker.md) | **Guide apprenti pas à pas** : installation avec Docker et Docker Compose |
| [docs/architecture.md](docs/architecture.md) | Comment l'application reste *stateless* : identification des joueurs, horloge des parties, concurrence MySQL, sécurité |
| [docs/installation.md](docs/installation.md) | Référence complète : développement local, déploiement Ubuntu détaillé, mises à jour, dépannage |
| [docs/multi-instance-testing.md](docs/multi-instance-testing.md) | Scénarios pour vérifier le load balancing, la tolérance aux pannes et l'absence de perte de session |

## Structure du dépôt

```text
gaming-quiz-battle/
├── backend/                 API REST Express + TypeScript
│   ├── src/
│   │   ├── domain/          logique pure : horloge de partie, scoring, validation
│   │   ├── services/        accès MySQL : joueurs, solo, multijoueur, classements
│   │   ├── routes/          endpoints HTTP
│   │   ├── middleware/      instance, authentification, rate limiting, erreurs
│   │   ├── db/              pool MySQL, transactions, migrations
│   │   └── cli/db.ts        outil migrate / seed / setup / status
│   └── test/                tests unitaires et d'intégration (vitest + supertest)
├── frontend/                React + Vite + TypeScript + Tailwind CSS
├── database/
│   ├── migrations/          schéma SQL versionné (appliqué une seule fois)
│   ├── seeds/               catégories + 140 questions (rejouable)
│   └── docker-init/         création de la base de test (dev uniquement)
├── deployment/
│   ├── nginx/gaming-quiz.conf        Nginx (installation sans conteneur)
│   ├── systemd/gaming-quiz.service   service de l'API (installation sans conteneur)
│   └── docker/                       Dockerfiles + Compose (installation avec conteneurs)
├── docs/
├── install.sh               téléchargement de l'application + lancement de l'assistant
├── setup.sh                 assistant d'installation Ubuntu (questions, test MySQL, installation)
├── docker-compose.yml       MySQL jetable pour le développement local
└── .env.example
```

## Scripts npm (à la racine)

| Commande | Effet |
|---|---|
| `npm run dev:backend` / `npm run dev:frontend` | Serveurs de développement avec rechargement |
| `npm run build` | Compile le backend (`backend/dist`) et le frontend (`frontend/dist`) |
| `npm run db:setup` | Migrations + seeds (idempotent) |
| `npm run db:check` | Teste la connexion MySQL et le droit de créer des tables |
| `npm run db:migrate` / `npm run db:seed` | L'une ou l'autre étape seulement |
| `npm test` | Tous les tests (backend puis frontend) |
| `npm run typecheck` | Vérification TypeScript |

## API (résumé)

Toutes les routes `/api` répondent en JSON. Les routes marquées 🔒 exigent l'en-tête
`Authorization: Bearer <jeton>` reçu à la création du joueur.

| Méthode | Route | Rôle |
|---|---|---|
| GET | `/health` | Liveness : le processus répond (200) |
| GET | `/ready` | Readiness : MySQL joignable et instance pas en arrêt (200 / 503) |
| GET | `/api/instance` | Nom de l'instance, hôte, uptime |
| GET | `/api/diag/ping` | Requête légère pour le générateur de charge (rate limit dédié) |
| GET | `/api/stats` | Joueurs connectés, parties terminées, nombre de questions |
| GET | `/api/categories` | Catégories et nombre de questions |
| GET | `/api/leaderboard?category=all\|<slug>` | Classement |
| POST | `/api/players` | Créer un joueur `{pseudo, avatar}` → `{player, token}` |
| GET/PATCH | `/api/players/me` 🔒 | Lire / modifier pseudo et avatar |
| GET | `/api/players/me/stats` 🔒 | Statistiques personnelles |
| POST | `/api/solo/games` 🔒 | Nouvelle partie solo `{category}` |
| GET | `/api/solo/games/:id` 🔒 | État (reprise après rafraîchissement) |
| POST | `/api/solo/games/:id/next` 🔒 | Afficher la question suivante (démarre le chrono serveur) |
| POST | `/api/solo/games/:id/answers` 🔒 | Répondre `{position, choice}` → correction |
| GET | `/api/solo/games/:id/results` 🔒 | Récapitulatif avec bonnes réponses |
| POST | `/api/games` 🔒 | Créer une partie multijoueur → `{code}` |
| POST | `/api/games/join` 🔒 | Rejoindre `{code}` |
| GET | `/api/games/:code` 🔒 | **État de la partie (polling)** |
| POST | `/api/games/:code/start` 🔒 | Démarrer (organisateur) |
| POST | `/api/games/:code/answers` 🔒 | Répondre `{position, choice}` |
| POST | `/api/games/:code/leave` 🔒 | Quitter la salle d'attente |

## Limitations connues

- **Rate limiting par instance** : les compteurs sont en mémoire de chaque processus Node. Avec deux
  instances, la limite effective est environ doublée. Acceptable ici (ce n'est pas un état
  utilisateur) ; une limitation globale peut être ajoutée dans HAProxy.
- **Polling** : environ 1 requête/s par joueur pendant une partie multijoueur (~30 req/s pour une
  partie pleine). Les WebSockets sont volontairement hors périmètre de cette version.
- **Identité liée au navigateur** : le jeton est stocké dans `localStorage`. Vider les données du
  site = nouveau joueur (pas de récupération possible, puisqu'il n'y a pas de compte).
- **Questions** : rédigées en évitant les détails dépendant des mises à jour récentes, mais des
  formulations peuvent toujours être améliorées : modifier `database/seeds/002_questions.sql`
  puis `npm run db:seed`.
- Les migrations MySQL (DDL) ne sont pas transactionnelles : une migration interrompue doit être
  corrigée à la main.
