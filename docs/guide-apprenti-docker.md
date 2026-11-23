# 🐳 Guide apprenti – Installer Gaming Quiz Battle avec Docker

Ce guide installe l'application sur **une VM web** Ubuntu Server 24.04 à l'aide de **conteneurs
Docker**. C'est une alternative à l'[installation sans conteneur](guide-apprenti-ubuntu.md) :
choisissez **l'une ou l'autre** méthode sur une même VM, pas les deux.

> 🔁 Vous avez deux VM web (WEB-01 et WEB-02) ? Faites **tout le guide sur chacune**.
> Une seule différence : le nom de l'instance (étape 3).

Au **premier démarrage**, l'application crée elle-même les tables et les **140 questions** dans la
base : il suffit que la base et l'utilisateur MySQL existent.

Durée estimée : 20 minutes par VM (la première construction des images prend quelques minutes).
Prévoir une VM avec **au moins 2 Go de RAM** pour construire les images.

---

## Ce que vous allez obtenir

```text
              VM WEB-01 (Ubuntu + Docker)
   port 80   ┌──────────────────────────────────────────────┐
  ──────────►│ conteneur "frontend"  (Nginx + site React)    │
             │        │ /api, /health, /ready                │
             │        ▼                                      │
             │ conteneur "backend"   (API Node.js, port 3000)│──► MySQL (VM DATABASE)
             └──────────────────────────────────────────────┘
```

Seul le port **80** est ouvert sur la VM. Le backend n'est joignable que par le conteneur
`frontend`, via le réseau interne de Docker.

| Fichier | Rôle |
|---|---|
| `deployment/docker/backend.Dockerfile` | Recette de l'image de l'API |
| `deployment/docker/frontend.Dockerfile` | Recette de l'image Nginx + site React |
| `deployment/docker/nginx.conf` | Configuration Nginx utilisée dans le conteneur |
| `deployment/docker/compose.web.yml` | Lance les 2 conteneurs d'une VM web |
| `deployment/docker/compose.database.yml` | (Optionnel) MySQL en conteneur pour la VM DATABASE |

---

## Avant de commencer

| Information | Exemple | Votre valeur |
|---|---|---|
| Nom de cette VM | `WEB-01` | |
| IP privée de la VM base de données | `10.0.2.4` | |
| Mot de passe MySQL de l'utilisateur `quiz_app` | `3f9c…` | |

La base MySQL doit exister. Deux possibilités :
- MySQL installé normalement sur la VM DATABASE → [Prérequis 1 du guide Ubuntu](guide-apprenti-ubuntu.md#prérequis-1--la-base-de-données-vm-database) ;
- MySQL **en conteneur** sur la VM DATABASE → [annexe de ce guide](#annexe--mysql-en-conteneur-sur-la-vm-database).

---

## Étape 1 – Installer Docker

Installation depuis le dépôt officiel de Docker :

```bash
sudo apt update
sudo apt install -y ca-certificates curl git
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

✅ **Vérification** :

```bash
sudo docker run --rm hello-world     # affiche "Hello from Docker!"
sudo docker compose version          # affiche "Docker Compose version v2.…"
```

> 💡 Dans ce guide, toutes les commandes Docker sont lancées avec `sudo`. (Ajouter son compte au
> groupe `docker` évite `sudo`, mais donne l'équivalent des droits root.)

---

## Étape 2 – Télécharger l'application

```bash
sudo mkdir -p /opt/gaming-quiz-battle
sudo chown "$USER": /opt/gaming-quiz-battle
git clone https://github.com/emf-info-109/gaming-quizz-battle.git /opt/gaming-quiz-battle
```

✅ **Vérification** : `ls /opt/gaming-quiz-battle/deployment/docker` affiche les fichiers
`compose.web.yml`, `backend.Dockerfile`, …

---

## Étape 3 – Configurer l'application

Le fichier de configuration (avec le mot de passe) reste **en dehors** du dossier Git :

```bash
sudo mkdir -p /etc/gaming-quiz
sudo cp /opt/gaming-quiz-battle/.env.example /etc/gaming-quiz/gaming-quiz.env
sudo nano /etc/gaming-quiz/gaming-quiz.env
```

Modifiez **ces lignes** :

```ini
INSTANCE_NAME=WEB-01
DB_HOST=10.0.2.4
DB_PASSWORD=le-mot-de-passe-mysql
```

- `INSTANCE_NAME` : `WEB-01` sur la première VM, `WEB-02` sur la deuxième.
- `DB_HOST` : l'IP privée de **votre** VM DATABASE.
- Inutile de modifier `HOST`, `PORT` et `NODE_ENV` : ils sont imposés par `compose.web.yml`.

> ⚠️ Pas d'espace autour du `=`, pas de guillemets, pas de commentaire en fin de ligne.

Protégez le fichier :

```bash
sudo chmod 600 /etc/gaming-quiz/gaming-quiz.env
```

---

## Étape 4 – Construire les images

```bash
cd /opt/gaming-quiz-battle/deployment/docker
sudo docker compose -f compose.web.yml build
```

Docker télécharge Node.js et Nginx, installe les dépendances et compile l'application.

✅ **Vérification** : `sudo docker image ls | grep gaming-quiz` affiche deux images :
`gaming-quiz-backend` et `gaming-quiz-frontend`.

---

## Étape 5 – Démarrer les conteneurs

```bash
cd /opt/gaming-quiz-battle/deployment/docker
sudo docker compose -f compose.web.yml up -d
```

`-d` = en arrière-plan. Les conteneurs redémarrent automatiquement après un crash ou un
redémarrage de la VM (`restart: unless-stopped`).

Au premier démarrage, le backend crée les tables et insère les questions. Vous pouvez le voir dans
les logs : `sudo docker compose -f compose.web.yml logs backend | grep database_` →
`database_initialized` (ou `database_up_to_date` si c'était déjà fait).

✅ **Vérification** (attendre ~20 secondes) :

```bash
sudo docker compose -f compose.web.yml ps
```

Les deux services `backend` et `frontend` sont `Up … (healthy)`.

---

## Étape 6 – Tester

```bash
curl -s http://127.0.0.1/health
curl -s http://127.0.0.1/ready
curl -s http://127.0.0.1/api/instance
```

✅ **Résultat attendu** :

```text
{"status":"UP","instance":"WEB-01",...}
{"status":"READY",...,"checks":{"database":"UP",...}}
{"instance":"WEB-01","hostname":"<id du conteneur>",...}
```

> 💡 Le champ `hostname` affiche l'identifiant du conteneur, pas le nom de la VM : chaque
> conteneur a son propre nom d'hôte. C'est pour cela qu'on utilise `INSTANCE_NAME`.

Dans un navigateur : `http://<IP_DE_LA_VM>/`. Le pied de page affiche
**Serveur API : WEB-01**. 🎉

---

## ✔️ Check-list finale

- [ ] `sudo docker compose -f compose.web.yml ps` → 2 services `healthy`
- [ ] `curl http://127.0.0.1/ready` → `READY`
- [ ] Le pied de page du site affiche le bon nom d'instance
- [ ] Après `sudo reboot`, les conteneurs redémarrent tout seuls
- [ ] `sudo ss -ltnp | grep 3000` ne montre **rien** (le backend n'est pas exposé sur la VM)

**Et ensuite ?** Configurez HAProxy pour répartir le trafic entre WEB-01 et WEB-02 (health check :
`GET /ready` sur le port 80), puis suivez les scénarios de
[multi-instance-testing.md](multi-instance-testing.md).

---

## Commandes utiles

Toutes depuis `/opt/gaming-quiz-battle/deployment/docker` :

| Je veux… | Commande |
|---|---|
| Voir l'état des conteneurs | `sudo docker compose -f compose.web.yml ps` |
| Voir les logs de l'API en direct | `sudo docker compose -f compose.web.yml logs -f backend` |
| Voir les logs Nginx | `sudo docker compose -f compose.web.yml logs -f frontend` |
| Redémarrer l'API | `sudo docker compose -f compose.web.yml restart backend` |
| Arrêter l'API (test de panne) | `sudo docker compose -f compose.web.yml stop backend` |
| Relancer l'API | `sudo docker compose -f compose.web.yml start backend` |
| Ouvrir un shell dans le conteneur API | `sudo docker compose -f compose.web.yml exec backend sh` |
| Tout arrêter et supprimer les conteneurs | `sudo docker compose -f compose.web.yml down` |
| Appliquer une modification de la configuration | `sudo docker compose -f compose.web.yml up -d --force-recreate backend` |

> 💡 Raccourci pratique : `alias gq='sudo docker compose -f /opt/gaming-quiz-battle/deployment/docker/compose.web.yml'`
> puis `gq ps`, `gq logs -f backend`…

## Mettre à jour l'application

```bash
cd /opt/gaming-quiz-battle
git pull
cd deployment/docker
sudo docker compose -f compose.web.yml build
sudo docker compose -f compose.web.yml up -d
```

Docker ne recrée que les conteneurs dont l'image a changé.

## En cas de problème

| Problème | Que vérifier |
|---|---|
| `backend` redémarre en boucle | `sudo docker compose -f compose.web.yml logs backend` : souvent « Configuration invalide » (faute dans le fichier `.env`) |
| `/ready` affiche `"INITIALIZING"` | La base n'a pas encore pu être initialisée : `logs backend`, la ligne `database_init_failed` contient un conseil (`hint`) qui explique le problème |
| `/ready` affiche `"database":"DOWN"` | Depuis la VM : `nc -vz <IP_DB> 3306`. Pare-feu/NSG, `bind-address` de MySQL, mot de passe, réseau autorisé pour `quiz_app` |
| `Bind for 0.0.0.0:80 failed: port is already allocated` | Un autre service utilise le port 80, souvent un Nginx installé avec l'autre méthode : `sudo systemctl disable --now nginx` |
| `502 Bad Gateway` | Le conteneur `backend` n'est pas démarré : `ps` puis `logs backend` |
| La construction échoue (`killed`, `out of memory`) | La VM manque de RAM : utiliser une taille avec au moins 2 Go |
| `env file /etc/gaming-quiz/gaming-quiz.env not found` | L'étape 3 n'a pas été faite (ou le fichier a un autre nom) |

---

## Docker ou installation classique : qu'est-ce qui change ?

| | Sans conteneur | Avec Docker |
|---|---|---|
| Node.js et Nginx | Installés sur la VM | Inclus dans les images |
| Lancer l'API | `systemctl start gaming-quiz` | `docker compose … up -d` |
| Redémarrage auto | systemd (`Restart=on-failure`) | Docker (`restart: unless-stopped`) |
| Logs de l'API | `journalctl -u gaming-quiz -f` | `docker compose … logs -f backend` |
| Configuration | `/etc/gaming-quiz/gaming-quiz.env` | Le même fichier, lu par Docker Compose |
| Mise à jour | `git pull`, `npm ci`, `npm run build`, copie, restart | `git pull`, `build`, `up -d` |
| Health check du conteneur | — | Docker vérifie `/health` toutes les 15 s |

Dans les deux cas, **l'application est la même** : l'état est dans MySQL, et HAProxy voit
simplement un serveur web sur le port 80 de chaque VM.

---

## Annexe – MySQL en conteneur sur la VM DATABASE

Optionnel : à la place d'une installation classique de MySQL.

1. Installez Docker sur la VM DATABASE (étape 1) et récupérez le dépôt (étape 2).
2. Créez le fichier de secrets :

   ```bash
   cd /opt/gaming-quiz-battle/deployment/docker
   cp database.env.example database.env
   nano database.env            # changez les deux mots de passe (openssl rand -hex 24)
   chmod 600 database.env
   ```

   `MYSQL_PASSWORD` est le mot de passe à reporter dans `DB_PASSWORD` sur les VM web.

3. Démarrez MySQL :

   ```bash
   sudo docker compose -f compose.database.yml up -d
   sudo docker compose -f compose.database.yml ps      # attendre "(healthy)"
   ```

La base `gaming_quiz` et l'utilisateur `quiz_app` sont créés automatiquement au premier démarrage.
Les données sont dans le volume Docker `gaming-quiz-db_mysql-data` : elles survivent à
`docker compose down`, mais **pas** à `docker compose down -v` (qui supprime les volumes).

> ⚠️ L'utilisateur `quiz_app` créé par l'image accepte les connexions depuis **n'importe quelle
> adresse**, et le port 3306 est ouvert sur la VM. Limitez l'accès au port 3306 aux seules VM web
> (NSG / pare-feu) : c'est à vous de le faire. Les sauvegardes aussi !
