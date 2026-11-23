# Installation – référence

> 👉 Pour une installation guidée pas à pas, utilisez plutôt le script `sudo ./setup.sh` décrit
> dans les guides apprentis :
> [sans conteneur (Ubuntu)](guide-apprenti-ubuntu.md) ou [avec Docker](guide-apprenti-docker.md).
> Ce document est la référence détaillée (développement local, explications, dépannage).

- [Partie A – Développement local](#partie-a--développement-local)
- [Partie B – Production sur Ubuntu Server 24.04 LTS (sans Docker)](#partie-b--production-sur-ubuntu-server-2404-lts-sans-docker)
- [Partie C – Mise à jour de l'application](#partie-c--mise-à-jour-de-lapplication)
- [Dépannage](#dépannage)

---

## Partie A – Développement local

### Prérequis

- Node.js **≥ 22.22** (24 LTS recommandé) : `node -v`
- Git
- Docker (uniquement pour lancer un MySQL jetable) **ou** un MySQL 8 déjà installé

### 1. Dépendances

```bash
git clone <URL_DU_DEPOT> gaming-quiz-battle
cd gaming-quiz-battle
npm install          # installe backend/ et frontend/ (npm workspaces)
```

### 2. MySQL

**Option Docker (recommandée en dev)** :

```bash
docker compose up -d
```

Cela crée la base `gaming_quiz`, l'utilisateur `quiz_app` / `devpassword` et la base de test
`gaming_quiz_test` (port 3306).

**Option MySQL déjà installé** :

```sql
CREATE DATABASE gaming_quiz CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE DATABASE gaming_quiz_test CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE USER 'quiz_app'@'localhost' IDENTIFIED BY 'devpassword';
GRANT ALL PRIVILEGES ON gaming_quiz.* TO 'quiz_app'@'localhost';
GRANT ALL PRIVILEGES ON gaming_quiz_test.* TO 'quiz_app'@'localhost';
```

### 3. Configuration

```bash
cp .env.example .env
# éditer .env : DB_PASSWORD=devpassword (et DB_PORT si besoin)
```

### 4. Initialisation de la base

```bash
npm run db:setup     # applique les migrations puis insère catégories et 140 questions
npm run db:status    # liste les migrations appliquées
```

La commande est **idempotente** : la relancer ne crée aucun doublon.

### 5. Démarrage

```bash
npm run dev:backend   # terminal 1 : API sur http://127.0.0.1:3000 (rechargement auto)
npm run dev:frontend  # terminal 2 : http://localhost:5173
```

Vite relaie `/api`, `/health` et `/ready` vers le port 3000 : le frontend utilise toujours des URL
relatives, exactement comme en production.

### 6. Tests

```bash
npm test
```

Les tests d'intégration **recréent entièrement** la base `gaming_quiz_test` (ne jamais pointer
`TEST_DB_NAME` vers une base utile). Si MySQL est inaccessible, ils sont ignorés avec un
avertissement ; `REQUIRE_DB_TESTS=1 npm test` les rend obligatoires.

### Simuler deux instances en local

```bash
cd backend && npm run build
INSTANCE_NAME=WEB-01 PORT=3000 node dist/server.js &
INSTANCE_NAME=WEB-02 PORT=3001 node dist/server.js &
curl -si http://127.0.0.1:3000/api/instance | grep -i x-instance   # WEB-01
curl -si http://127.0.0.1:3001/api/instance | grep -i x-instance   # WEB-02
```

---

## Partie B – Production sur Ubuntu Server 24.04 LTS (sans Docker)

> Ce guide installe **l'application** sur une VM web. La création des VM, du réseau, des NSG, de
> HAProxy, du HTTPS, des sauvegardes et la sécurisation de MySQL font partie de **votre travail**
> de laboratoire et ne sont pas détaillées ici.

Les étapes 1 à 9 sont à répéter **à l'identique sur chaque VM web** (WEB-01, WEB-02).
Seules différences : la valeur de `INSTANCE_NAME`, et l'initialisation de la base qui ne se fait
**qu'une seule fois**.

### Ce que l'application attend de la VM DATABASE

L'application a besoin d'un serveur MySQL 8 joignable depuis les VM web, avec une base et un
utilisateur dédiés. Par exemple, sur la VM DATABASE :

```sql
CREATE DATABASE gaming_quiz CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
-- Remplacer 10.0.1.% par le sous-réseau de VOS serveurs web
CREATE USER 'quiz_app'@'10.0.1.%' IDENTIFIED BY '<MOT_DE_PASSE_FORT>';
GRANT ALL PRIVILEGES ON gaming_quiz.* TO 'quiz_app'@'10.0.1.%';
```

À vous de rendre MySQL accessible depuis le réseau privé (et **uniquement** depuis celui-ci).
Astuce pour générer un mot de passe sans caractère problématique : `openssl rand -hex 24`.

### 1. Installer Node.js LTS

```bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg git rsync
curl -fsSL https://deb.nodesource.com/setup_24.x -o /tmp/nodesource_setup.sh
sudo bash /tmp/nodesource_setup.sh
sudo apt install -y nodejs
node -v    # v24.x
npm -v
```

### 2. Installer Nginx

```bash
sudo apt install -y nginx
systemctl status nginx --no-pager
```

### 3. Récupérer le projet depuis Git

On crée un utilisateur système **sans shell ni droits** qui exécutera l'API :

```bash
sudo useradd --system --no-create-home --shell /usr/sbin/nologin gamingquiz
```

Le code est placé dans `/opt/gaming-quiz-battle` (appartenant à votre compte d'administration,
lisible par tous, modifiable par personne d'autre) :

```bash
sudo mkdir -p /opt/gaming-quiz-battle
sudo chown "$USER": /opt/gaming-quiz-battle
git clone <URL_DU_DEPOT> /opt/gaming-quiz-battle
cd /opt/gaming-quiz-battle
```

### 4. Installer les dépendances

```bash
cd /opt/gaming-quiz-battle
npm ci       # installation exacte selon package-lock.json
```

### 5. Compiler l'application

```bash
npm run build
```

- `backend/dist/` : API compilée en JavaScript
- `frontend/dist/` : site statique React

Publier le frontend dans le dossier servi par Nginx :

```bash
sudo mkdir -p /var/www/gaming-quiz
sudo rsync -a --delete frontend/dist/ /var/www/gaming-quiz/
```

### 6. Configurer les variables d'environnement

Les secrets ne sont **jamais** dans le dépôt Git : ils vont dans `/etc/gaming-quiz/`.

```bash
sudo mkdir -p /etc/gaming-quiz
sudo cp /opt/gaming-quiz-battle/.env.example /etc/gaming-quiz/gaming-quiz.env
sudo nano /etc/gaming-quiz/gaming-quiz.env
```

Valeurs à adapter au minimum :

```ini
# WEB-02 sur la deuxième VM
INSTANCE_NAME=WEB-01
NODE_ENV=production
# Seul Nginx (local) parle à Express
HOST=127.0.0.1
PORT=3000
# IP privée de la VM DATABASE
DB_HOST=10.0.2.4
DB_PASSWORD=<MOT_DE_PASSE_FORT>
# debug = une ligne de log par requête
LOG_LEVEL=info
```

Restreindre l'accès au fichier (lisible par root et par le service uniquement) :

```bash
sudo chown root:gamingquiz /etc/gaming-quiz/gaming-quiz.env
sudo chmod 640 /etc/gaming-quiz/gaming-quiz.env
```

> ⚠️ Le format est celui de systemd : `CLE=valeur`, sans `export`, sans espaces autour du `=`,
> et les commentaires uniquement sur leur **propre ligne** (`# ...`) — jamais en fin de ligne.
> Évitez les guillemets, `#`, `$` et espaces dans les mots de passe.

#### Initialiser la base (facultatif)

Avec `AUTO_MIGRATE=true` (valeur par défaut), **l'API crée elle-même les tables et les questions
à son premier démarrage** : cette étape peut être sautée. Elle reste utile pour tester la
configuration avant de démarrer le service :

```bash
cd /opt/gaming-quiz-battle/backend
sudo -u gamingquiz node --env-file=/etc/gaming-quiz/gaming-quiz.env dist/cli/db.js check
```

Ou pour initialiser la base manuellement, depuis une seule VM :

```bash
cd /opt/gaming-quiz-battle/backend
sudo -u gamingquiz node --env-file=/etc/gaming-quiz/gaming-quiz.env dist/cli/db.js setup
```

Résultat attendu :

```text
→ Base quiz_app@10.0.2.4:3306/gaming_quiz
  ✔ migration appliquée : 001_initial_schema.sql
  ✔ seed exécuté      : 001_categories.sql
  ✔ seed exécuté      : 002_questions.sql
Terminé.
```

Relancer la commande sur l'autre VM est sans danger (rien n'est appliqué deux fois, et un verrou
MySQL empêche deux exécutions simultanées).

### 7. Créer le service systemd du backend

```bash
sudo cp /opt/gaming-quiz-battle/deployment/systemd/gaming-quiz.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now gaming-quiz
systemctl status gaming-quiz --no-pager
```

Le service redémarre automatiquement en cas de crash et au démarrage de la VM.

### 8. Configurer Nginx

```bash
sudo cp /opt/gaming-quiz-battle/deployment/nginx/gaming-quiz.conf /etc/nginx/sites-available/gaming-quiz
sudo ln -sf /etc/nginx/sites-available/gaming-quiz /etc/nginx/sites-enabled/gaming-quiz
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

### 9. Démarrer et vérifier

```bash
# API directement (sans Nginx)
curl -s http://127.0.0.1:3000/health

# À travers Nginx
curl -si http://127.0.0.1/health | grep -iE "HTTP/|x-instance"
curl -s  http://127.0.0.1/ready
curl -s  http://127.0.0.1/api/instance
curl -s  http://127.0.0.1/api/stats

# Logs
journalctl -u gaming-quiz -n 50 --no-pager
sudo tail -f /var/log/nginx/access.log
```

Résultats attendus :

```json
{"status":"UP","instance":"WEB-01","uptime":12}
{"status":"READY","instance":"WEB-01","uptime":12,"checks":{"database":"UP","databaseLatencyMs":1}}
```

Si `/ready` renvoie `503` avec `"database":"DOWN"`, l'API tourne mais ne joint pas MySQL
(voir [Dépannage](#dépannage)).

Enfin, ouvrez `http://<IP_DE_LA_VM>/` dans un navigateur (si votre réseau l'autorise) : le pied de
page doit afficher `Serveur API : WEB-01`.

### Ce que l'application attend du load balancer (HAProxy)

À configurer par vos soins ; l'application est prête pour :

- **Backends** : port **80** (Nginx) de chaque VM web, **round-robin**, **sans sticky session**.
- **Health check** : `GET /ready` → doit répondre `200`. (`/health` ne vérifie pas MySQL.)
- **En-têtes** : transmettre l'IP du client (`X-Forwarded-For`) et le protocole d'origine
  (`X-Forwarded-Proto: https`).
- **HTTPS** : terminé sur HAProxy ; Nginx et Express restent en HTTP sur le réseau privé.
- **Vérification** : l'en-tête `X-Instance-Name` de chaque réponse indique quelle VM a répondu.

Les scénarios de test sont décrits dans [multi-instance-testing.md](multi-instance-testing.md).

---

## Partie C – Mise à jour de l'application

Sur **chaque** VM web, l'une après l'autre (pour éviter toute interruption) :

```bash
cd /opt/gaming-quiz-battle
git pull
npm ci
npm run build
sudo rsync -a --delete frontend/dist/ /var/www/gaming-quiz/

# Une seule fois (depuis une seule VM) si de nouvelles migrations existent :
(cd backend && sudo -u gamingquiz node --env-file=/etc/gaming-quiz/gaming-quiz.env dist/cli/db.js migrate)

sudo systemctl restart gaming-quiz
curl -s http://127.0.0.1/ready
```

---

## Dépannage

| Symptôme | Piste |
|---|---|
| `systemctl status` : `failed` | `journalctl -u gaming-quiz -n 50` : souvent « Configuration invalide » (variable mal écrite) |
| `/ready` → 503, `database: DOWN` | Depuis la VM web : `nc -vz <DB_HOST> 3306`. Vérifier `bind-address` MySQL, le pare-feu/NSG, l'hôte autorisé dans `CREATE USER`, le mot de passe |
| `502 Bad Gateway` (Nginx) | Le service n'écoute pas sur 127.0.0.1:3000 : `ss -ltnp \| grep 3000`, `systemctl status gaming-quiz` |
| Le pied de page affiche « injoignable » | `/api/` n'est pas relayé : vérifier la configuration Nginx (`nginx -t`) |
| Rafraîchir une page (`/leaderboard`) donne 404 | Le `try_files … /index.html` manque dans Nginx |
| `ER_ACCESS_DENIED_ERROR` | Utilisateur MySQL créé pour un autre hôte (`'quiz_app'@'localhost'` ≠ `'quiz_app'@'10.0.1.%'`) |
| Erreurs 429 | Limites de débit atteintes : ajuster `RATE_LIMIT_*` dans le fichier d'environnement puis redémarrer |
| Mauvaise IP client dans les logs | Vérifier `TRUST_PROXY` et que HAProxy ajoute `X-Forwarded-For` |
