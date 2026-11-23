# 🐧 Guide apprenti – Installer Gaming Quiz Battle sur Ubuntu

L'installation se fait en **3 étapes** :

1. **Prérequis 1** – préparer la base de données MySQL (sur la VM DATABASE)
2. **Prérequis 2** – installer Nginx (sur la VM web)
3. **Installation** – une seule commande, puis un **assistant** vous pose les questions
   (sur la VM web)

```text
   Navigateur ──►  VM WEB (Nginx + application)  ──►  VM DATABASE (MySQL)
```

Un seul serveur web suffit pour que l'application fonctionne. Ajouter plus tard un deuxième
serveur web derrière un load balancer est une **possibilité**, décrite à la fin de ce guide
([Pour aller plus loin](#pour-aller-plus-loin--plusieurs-serveurs-web)).

Au **premier démarrage**, l'application crée elle-même les tables et les **140 questions** dans
la base : vous n'avez rien à importer.

> 💡 Les commandes sont à **copier-coller** dans le terminal. Dans un terminal SSH, le collage se
> fait souvent avec **clic droit** ou **Ctrl+Shift+V**.

---

## Avant de commencer : notez vos informations

| Information | Comment la trouver | Votre valeur |
|---|---|---|
| IP privée de la VM DATABASE | Portail Azure, ou `hostname -I` sur la VM | |
| IP privée de la VM web | Portail Azure, ou `hostname -I` sur la VM | |
| Mot de passe MySQL (à inventer) | Lettres et chiffres, au moins 12 caractères | |

---

## Prérequis 1 – La base de données (VM DATABASE)

Connectez-vous en SSH à la **VM DATABASE**.

### 1.1 Installer MySQL

```bash
sudo apt update
sudo apt install -y mysql-server
```

✅ `systemctl is-active mysql` affiche `active`

### 1.2 Autoriser les connexions depuis le réseau

Par défaut, MySQL n'accepte que les connexions venant de la VM elle-même. On lui demande
d'écouter sur le réseau :

```bash
sudo sed -i 's/^bind-address.*/bind-address = 0.0.0.0/' /etc/mysql/mysql.conf.d/mysqld.cnf
sudo systemctl restart mysql
```

✅ `sudo ss -ltn | grep 3306` affiche `0.0.0.0:3306`

### 1.3 Créer la base et l'utilisateur

Ouvrez la console MySQL :

```bash
sudo mysql
```

Le terminal affiche maintenant `mysql>`. Copiez ces 3 lignes **après avoir remplacé** :
- `10.0.1.%` par le réseau de votre VM web : les 3 premiers nombres de son IP, suivis de `.%`
  (ex. : VM web = `10.0.1.4` → `10.0.1.%`). Ainsi, un futur 2e serveur web du même réseau
  pourra aussi se connecter ;
- `MotDePasse123` par votre mot de passe (lettres et chiffres uniquement, c'est plus simple).

```sql
CREATE DATABASE gaming_quiz CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE USER 'quiz_app'@'10.0.1.%' IDENTIFIED BY 'MotDePasse123';
GRANT ALL PRIVILEGES ON gaming_quiz.* TO 'quiz_app'@'10.0.1.%';
```

Chaque ligne doit répondre `Query OK`. Quittez la console avec :

```sql
exit
```

> ℹ️ Inutile de créer les tables : l'application s'en charge au premier démarrage.

> 🔒 Le port 3306 ne doit être accessible **que depuis votre serveur web**. Configurer cette règle
> (NSG Azure / pare-feu) fait partie de votre travail de laboratoire.

---

## Prérequis 2 – Nginx (sur la VM web)

Connectez-vous en SSH à la **VM web** :

```bash
sudo apt update
sudo apt install -y nginx
```

✅ `systemctl is-active nginx` affiche `active`.
Dans un navigateur, `http://<IP-de-la-VM>/` affiche « Welcome to nginx! » (si le réseau le permet).

> Si vous oubliez cette étape, l'assistant vous proposera d'installer Nginx.

---

## Installation (sur la VM web)

### Étape 1 – Lancer l'assistant

Sur la VM web, copiez-collez **cette seule commande** :

```bash
curl -fsSL https://raw.githubusercontent.com/emf-info-109/gaming-quizz-battle/main/install.sh | sudo bash
```

Elle télécharge l'application dans `/opt/gaming-quiz-battle`, puis ouvre l'assistant.

> 🔍 Bonne pratique : `curl … | sudo bash` exécute un script venu d'Internet avec les droits
> administrateur. On ne le fait qu'avec une source de confiance. Pour lire le script avant de
> l'exécuter : `curl -fsSL <adresse>/install.sh -o install.sh`, puis `less install.sh`, puis
> `sudo bash install.sh`.

### Étape 2 – Répondre à l'assistant

L'assistant s'affiche dans des fenêtres. On s'y déplace **au clavier** :

| Touche | Action |
|---|---|
| **Entrée** | Valider / bouton sélectionné |
| **Tab** ou **← →** | Passer d'un bouton à l'autre (`Suivant` / `Annuler`, `Oui` / `Non`) |
| **Retour arrière** | Effacer le texte proposé dans un champ |

Les fenêtres se suivent ainsi :

```text
┌──────────── Gaming Quiz Battle - installation ────────────┐
│ Bienvenue dans l'assistant d'installation…                │
│ Avant de continuer, vérifie que tu as :                   │
│   1. créé la base de données et l'utilisateur MySQL ;     │
│   2. installé Nginx sur cette VM.                         │
│                          <OK>                             │
└───────────────────────────────────────────────────────────┘
```

| Fenêtre | Que répondre |
|---|---|
| **Étape 1/5 – Nom de ce serveur** | Accepter la valeur proposée, ou `WEB-01` |
| **Étape 2/5 – Serveur de base de données** | L'IP privée de la VM DATABASE (ex. `10.0.2.4`) |
| **Étape 3/5 – Port MySQL** | Laisser `3306` → **Entrée** |
| **Étape 4/5 – Base de données** | Laisser `gaming_quiz` → **Entrée** |
| **Étape 5/5 – Utilisateur MySQL** | Laisser `quiz_app` → **Entrée** |
| **Étape 5/5 – Mot de passe MySQL** | Votre mot de passe (**rien ne s'affiche** quand vous tapez : c'est normal) |

L'assistant **teste la connexion à MySQL** avant d'installer quoi que ce soit :

- ✅ **« Connexion à MySQL réussie ! »** : un récapitulatif s'affiche, choisissez **Oui** pour
  lancer l'installation ;
- ❌ **un problème est détecté** : l'assistant explique la cause probable (voir le tableau plus bas).
  Choisissez **Corriger** : vos réponses précédentes sont reproposées, il suffit de modifier la
  valeur fausse.

### Étape 3 – Patienter

Une barre de progression s'affiche pendant **3 à 5 minutes** :

```text
┌──────────── Gaming Quiz Battle - installation ────────────┐
│ Téléchargement des dépendances (npm ci)… (2 à 3 minutes)  │
│                                                           │
│ ██████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  20%     │
└───────────────────────────────────────────────────────────┘
```

À la fin, la fenêtre **« Installation terminée ! »** indique l'adresse du site.

### Étape 4 – Vérifier

Ouvrez le site dans un navigateur : en bas de la page, vous devez voir
**Serveur API : WEB-01**.

Ou dans le terminal :

```bash
curl http://127.0.0.1/ready
```

✅ La réponse contient `"status":"READY"`.

---

## ✔️ Check-list

- [ ] `curl http://127.0.0.1/ready` → `READY`
- [ ] Le site s'affiche dans le navigateur, avec le nom du serveur en bas de page
- [ ] Une partie solo fonctionne et apparaît dans le classement
- [ ] Après `sudo reboot` de la VM web, le site refonctionne tout seul

---

## L'assistant affiche une erreur ?

| Message | Solution |
|---|---|
| `Impossible de joindre MySQL sur …` | Mauvaise IP, MySQL arrêté, `bind-address` pas modifié (Prérequis 1.2), ou port 3306 bloqué par le NSG / pare-feu |
| `Accès refusé pour l'utilisateur « quiz_app »` | Mauvais mot de passe, ou le réseau `'quiz_app'@'10.0.1.%'` ne correspond pas à l'IP de la VM web |
| `La base « gaming_quiz » n'existe pas` | Le `CREATE DATABASE` du Prérequis 1.3 n'a pas été fait (ou faute de frappe) |
| `n'a pas le droit de créer des tables` / `n'a pas accès à la base` | Le `GRANT ALL PRIVILEGES` du Prérequis 1.3 manque |
| `Téléchargement impossible depuis …` | La VM n'a pas accès à Internet (ou à GitHub) |
| `L'étape « … » a échoué` | Les dernières lignes du journal s'affichent ; le détail complet est dans `/var/log/gaming-quiz-setup.log` |
| `Ce script doit être lancé avec sudo` | Il manque `sudo` dans la commande |

Une fois le problème corrigé, **relancez simplement la même commande**.
Pour modifier une information (IP, mot de passe, nom du serveur…), relancez la commande et
répondez **Non** à « Une configuration existe déjà… La garder ? ».

---

## Mettre à jour l'application

Relancez **la même commande** que pour l'installation :

```bash
curl -fsSL https://raw.githubusercontent.com/emf-info-109/gaming-quizz-battle/main/install.sh | sudo bash
```

Elle télécharge la nouvelle version, puis l'assistant propose de garder la configuration actuelle.
Vos joueurs et leurs scores restent dans la base de données.

---

## Commandes utiles

| Je veux… | Commande |
|---|---|
| Savoir si l'application tourne | `systemctl status gaming-quiz` (quitter avec `q`) |
| Voir les logs de l'application en direct | `journalctl -u gaming-quiz -f` (quitter avec `Ctrl+C`) |
| Redémarrer l'application | `sudo systemctl restart gaming-quiz` |
| Arrêter l'application (test de panne) | `sudo systemctl stop gaming-quiz` |
| La relancer | `sudo systemctl start gaming-quiz` |
| Voir les visites reçues par Nginx | `sudo tail -f /var/log/nginx/access.log` |
| Relancer l'assistant sans retélécharger | `sudo /opt/gaming-quiz-battle/setup.sh` |
| Tester MySQL depuis la VM web | `mysql -h <IP_DB> -u quiz_app -p gaming_quiz` (le client est installé par l'assistant) |

---

## Mini-lexique Linux

| Mot | Signification |
|---|---|
| `sudo` | Exécuter une commande en tant qu'administrateur (root) |
| `curl` | Télécharger une page ou un fichier depuis le terminal |
| `\|` (« pipe ») | Envoyer le résultat d'une commande à la suivante |
| `apt install` | Installer un logiciel |
| `systemctl` | Démarrer / arrêter / voir l'état d'un **service** (programme qui tourne en arrière-plan) |
| `journalctl` | Lire les logs (journaux) des services |
| `nano fichier` | Éditer un fichier texte (`Ctrl+O` = enregistrer, `Ctrl+X` = quitter) |

---

## Que fait l'assistant exactement ?

Pour les curieux (et pour comprendre ce que vous dépannez) :

| Étape | Action |
|---|---|
| `install.sh` | Installe `git` si besoin, télécharge (ou met à jour) l'application dans `/opt/gaming-quiz-battle`, lance `setup.sh` |
| Prérequis | Vérifie Nginx (propose de l'installer), installe `curl`, `rsync` et le client `mysql` |
| Questions | Nom du serveur et connexion MySQL, puis **test réel** : connexion, identifiants, base existante, droit de créer des tables |
| 5 % | Installe Node.js 24 s'il est absent |
| 20 % – 55 % | `npm ci` puis `npm run build` (compilation) |
| 75 % | Crée l'utilisateur système `gamingquiz` et écrit la configuration dans `/etc/gaming-quiz/gaming-quiz.env` (lisible uniquement par root et `gamingquiz`) |
| 80 % | Installe et démarre le service `/etc/systemd/system/gaming-quiz.service` |
| 88 % | Copie le site dans `/var/www/gaming-quiz` et configure Nginx |
| 95 % | Attend que `http://127.0.0.1/ready` réponde `200` |

Au premier démarrage, l'application crée les tables et insère les 140 questions (message
`database_initialized` dans `journalctl -u gaming-quiz`). Si plusieurs serveurs web démarrent
en même temps, un verrou MySQL garantit que ce n'est fait qu'une seule fois.

L'installation manuelle, étape par étape, est décrite dans [installation.md](installation.md).

---

## Pour aller plus loin : plusieurs serveurs web

*Optionnel – uniquement si votre laboratoire le demande.*

L'application est conçue pour fonctionner aussi avec **plusieurs serveurs web** qui partagent la
même base de données, derrière un **load balancer** (par ex. HAProxy) :

```text
                         ┌──►  VM WEB-01  ──┐
   Navigateur ──► HAProxy                   ├──►  VM DATABASE (MySQL)
                         └──►  VM WEB-02  ──┘
```

Pour ajouter un deuxième serveur web :

1. Créez une nouvelle VM web dans le même réseau que la première.
2. Faites **Prérequis 2** et **Installation** sur cette VM, en donnant un **autre nom** à
   l'étape 1/5 (ex. `WEB-02`). Utilisez la **même** base de données : les deux serveurs
   partagent les joueurs, les parties et les scores.
3. Vérifiez que l'utilisateur MySQL est autorisé depuis l'IP de cette nouvelle VM (Prérequis 1.3)
   et que le port 3306 lui est ouvert.
4. Placez un load balancer devant les deux VM : port 80 de chaque VM, health check
   `GET /ready`, pas besoin de *sticky sessions*.

Le pied de page du site (`Serveur API : WEB-01` / `WEB-02`) et la page `/cloud-dashboard` montrent
quel serveur a répondu. Les scénarios de test sont dans
[multi-instance-testing.md](multi-instance-testing.md).
