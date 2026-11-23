# 🐧 Guide apprenti – Installer Gaming Quiz Battle sur Ubuntu (sans conteneur)

Ce guide installe l'application sur **une VM web** Ubuntu Server 24.04.
Suivez les étapes **dans l'ordre** et vérifiez chaque ✅ avant de passer à la suite.

> 🔁 Vous avez deux VM web (WEB-01 et WEB-02) ? Faites **tout le guide sur chacune**.
> Une seule différence : le nom de l'instance (étape 5). L'étape 6 ne se fait qu'**une fois**.

Durée estimée : 20 à 30 minutes par VM.

---

## Avant de commencer

Notez ces informations, vous en aurez besoin :

| Information | Exemple | Votre valeur |
|---|---|---|
| Nom de cette VM | `WEB-01` | |
| IP privée de la VM base de données | `10.0.2.4` | |
| Mot de passe MySQL de l'utilisateur `quiz_app` | `3f9c…` | |
| Adresse du dépôt Git | `https://…/gaming-quiz-battle.git` | |

La base de données doit déjà exister sur la VM DATABASE (MySQL 8). Si ce n'est pas le cas, voir
l'[annexe](#annexe--préparer-la-base-mysql).

Connectez-vous à la VM web en SSH, par exemple : `ssh azureuser@<IP_DE_LA_VM>`.

---

## Étape 1 – Installer Node.js

```bash
sudo apt update
sudo apt install -y ca-certificates curl git rsync
curl -fsSL https://deb.nodesource.com/setup_24.x -o /tmp/nodesource_setup.sh
sudo bash /tmp/nodesource_setup.sh
sudo apt install -y nodejs
```

✅ **Vérification** : `node -v` affiche `v24.…`

---

## Étape 2 – Installer Nginx

```bash
sudo apt install -y nginx
```

✅ **Vérification** : `systemctl is-active nginx` affiche `active`

---

## Étape 3 – Télécharger l'application

```bash
# Utilisateur technique qui fera tourner l'API (sans mot de passe, sans shell)
sudo useradd --system --no-create-home --shell /usr/sbin/nologin gamingquiz

# Dossier de l'application
sudo mkdir -p /opt/gaming-quiz-battle
sudo chown "$USER": /opt/gaming-quiz-battle
git clone <ADRESSE_DU_DEPOT> /opt/gaming-quiz-battle
cd /opt/gaming-quiz-battle
```

✅ **Vérification** : `ls` affiche `backend  database  deployment  docs  frontend …`

---

## Étape 4 – Installer les dépendances et compiler

```bash
cd /opt/gaming-quiz-battle
npm ci
npm run build
```

Puis copier le site web dans le dossier servi par Nginx :

```bash
sudo mkdir -p /var/www/gaming-quiz
sudo rsync -a --delete frontend/dist/ /var/www/gaming-quiz/
```

✅ **Vérification** : `ls /var/www/gaming-quiz` affiche `assets  favicon.svg  index.html`

---

## Étape 5 – Configurer l'application

```bash
sudo mkdir -p /etc/gaming-quiz
sudo cp /opt/gaming-quiz-battle/.env.example /etc/gaming-quiz/gaming-quiz.env
sudo nano /etc/gaming-quiz/gaming-quiz.env
```

Modifiez **ces lignes** (laissez les autres telles quelles) :

```ini
INSTANCE_NAME=WEB-01
NODE_ENV=production
DB_HOST=10.0.2.4
DB_PASSWORD=le-mot-de-passe-mysql
```

- `INSTANCE_NAME` : `WEB-01` sur la première VM, `WEB-02` sur la deuxième.
- `DB_HOST` : l'IP privée de **votre** VM DATABASE.

> ⚠️ Pas d'espace autour du `=`, pas de guillemets, et pas de commentaire en fin de ligne.

Enregistrez (`Ctrl+O`, `Entrée`, `Ctrl+X`), puis protégez le fichier (il contient un mot de passe) :

```bash
sudo chown root:gamingquiz /etc/gaming-quiz/gaming-quiz.env
sudo chmod 640 /etc/gaming-quiz/gaming-quiz.env
```

✅ **Vérification** : `ls -l /etc/gaming-quiz/` affiche `-rw-r----- 1 root gamingquiz`

---

## Étape 6 – Créer les tables et les questions (⚠️ UNE SEULE FOIS)

À faire **uniquement sur WEB-01** :

```bash
cd /opt/gaming-quiz-battle/backend
sudo -u gamingquiz node --env-file=/etc/gaming-quiz/gaming-quiz.env dist/cli/db.js setup
```

✅ **Vérification** : la commande se termine par `Terminé.` et affiche `migration appliquée` et
`seed exécuté`.

❌ Si vous voyez `ECONNREFUSED`, `ETIMEDOUT` ou `Access denied` : la VM web n'arrive pas à se
connecter à MySQL (voir [En cas de problème](#en-cas-de-problème)).

---

## Étape 7 – Démarrer l'API avec systemd

```bash
sudo cp /opt/gaming-quiz-battle/deployment/systemd/gaming-quiz.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now gaming-quiz
```

✅ **Vérification** :

```bash
systemctl is-active gaming-quiz          # active
curl -s http://127.0.0.1:3000/health     # {"status":"UP","instance":"WEB-01",...}
```

---

## Étape 8 – Configurer Nginx

```bash
sudo cp /opt/gaming-quiz-battle/deployment/nginx/gaming-quiz.conf /etc/nginx/sites-available/gaming-quiz
sudo ln -sf /etc/nginx/sites-available/gaming-quiz /etc/nginx/sites-enabled/gaming-quiz
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

✅ **Vérification** : `sudo nginx -t` affiche `syntax is ok` et `test is successful`

---

## Étape 9 – Tester

```bash
curl -s http://127.0.0.1/health
curl -s http://127.0.0.1/ready
curl -s http://127.0.0.1/api/instance
```

✅ **Résultat attendu** :

```text
{"status":"UP","instance":"WEB-01",...}
{"status":"READY",...,"checks":{"database":"UP",...}}
{"instance":"WEB-01","hostname":"...",...}
```

Dans un navigateur (si le réseau le permet) : `http://<IP_DE_LA_VM>/`. Le pied de page affiche
**Serveur API : WEB-01**. 🎉

---

## ✔️ Check-list finale

- [ ] `node -v` → v24
- [ ] `systemctl is-active gaming-quiz` → active
- [ ] `systemctl is-active nginx` → active
- [ ] `curl http://127.0.0.1/ready` → `READY`
- [ ] Le pied de page du site affiche le bon nom d'instance
- [ ] Après `sudo reboot`, tout redémarre tout seul

**Et ensuite ?** Configurez HAProxy pour répartir le trafic entre WEB-01 et WEB-02 (health check :
`GET /ready`), puis suivez les scénarios de [multi-instance-testing.md](multi-instance-testing.md).

---

## Commandes utiles

| Je veux… | Commande |
|---|---|
| Voir l'état de l'API | `systemctl status gaming-quiz` |
| Voir les logs de l'API en direct | `journalctl -u gaming-quiz -f` |
| Redémarrer l'API | `sudo systemctl restart gaming-quiz` |
| Arrêter l'API (test de panne) | `sudo systemctl stop gaming-quiz` |
| Voir les requêtes reçues par Nginx | `sudo tail -f /var/log/nginx/access.log` |
| Modifier la configuration | `sudo nano /etc/gaming-quiz/gaming-quiz.env` puis `sudo systemctl restart gaming-quiz` |

## Mettre à jour l'application

```bash
cd /opt/gaming-quiz-battle
git pull
npm ci
npm run build
sudo rsync -a --delete frontend/dist/ /var/www/gaming-quiz/
sudo systemctl restart gaming-quiz
```

## En cas de problème

| Problème | Que vérifier |
|---|---|
| `gaming-quiz` est `failed` | `journalctl -u gaming-quiz -n 30` : lisez le message (souvent une faute dans le fichier `.env`) |
| `/ready` affiche `"database":"DOWN"` | Depuis la VM web : `nc -vz <IP_DB> 3306`. Si ça échoue : pare-feu/NSG, ou MySQL n'écoute que sur 127.0.0.1 (`bind-address`) |
| `Access denied for user 'quiz_app'` | Mauvais mot de passe, ou utilisateur MySQL créé pour un autre réseau (voir l'annexe) |
| `502 Bad Gateway` | L'API ne tourne pas : `systemctl status gaming-quiz` |
| Le pied de page affiche « injoignable » | Nginx ne relaie pas `/api/` : refaites l'étape 8 |

---

## Annexe – Préparer la base MySQL

Sur la **VM DATABASE**, avec MySQL 8 installé (`sudo apt install -y mysql-server`), ouvrez la
console `sudo mysql` et exécutez (remplacez le réseau et le mot de passe) :

```sql
CREATE DATABASE gaming_quiz CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE USER 'quiz_app'@'10.0.1.%' IDENTIFIED BY 'le-mot-de-passe-mysql';
GRANT ALL PRIVILEGES ON gaming_quiz.* TO 'quiz_app'@'10.0.1.%';
```

`10.0.1.%` = toutes les adresses du sous-réseau de vos VM web. Pour générer un mot de passe sûr :
`openssl rand -hex 24`.

Rendre MySQL joignable depuis les VM web (et **seulement** depuis elles) fait partie de votre
travail de laboratoire.
