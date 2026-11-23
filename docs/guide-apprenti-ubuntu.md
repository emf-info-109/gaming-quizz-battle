# 🐧 Guide apprenti – Installer Gaming Quiz Battle sur Ubuntu

Un script d'installation (`setup.sh`) fait presque tout à votre place : il vous pose quelques
questions, installe ce qu'il faut, compile l'application et la démarre.
Au **premier démarrage**, l'application crée elle-même les tables et les **140 questions**.

Votre travail :

1. **Prérequis 1** – préparer la base de données (sur la VM DATABASE)
2. **Prérequis 2** – installer Nginx (sur chaque VM web)
3. **Lancer le setup** (sur chaque VM web)

```text
   VM WEB-01  ─┐
               ├──►  VM DATABASE (MySQL)
   VM WEB-02  ─┘
```

> 💡 Les commandes sont à **copier-coller** dans le terminal. Dans le terminal SSH, le collage se
> fait souvent avec **clic droit** ou **Ctrl+Shift+V**.

---

## Avant de commencer : notez vos informations

| Information | Comment la trouver | Votre valeur |
|---|---|---|
| IP privée de la VM DATABASE | Portail Azure, ou `hostname -I` sur la VM | |
| IP privée de WEB-01 et WEB-02 | Portail Azure, ou `hostname -I` sur chaque VM | |
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
- `10.0.1.%` par le réseau de vos VM web : les 3 premiers nombres de leur IP, suivis de `.%`
  (ex. : WEB-01 = `10.0.1.4` → `10.0.1.%`) ;
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

> 🔒 Le port 3306 ne doit être accessible **que depuis vos VM web**. Configurer cette règle
> (NSG Azure / pare-feu) fait partie de votre travail de laboratoire.

---

## Prérequis 2 – Nginx (sur CHAQUE VM web)

Connectez-vous en SSH à la VM web (WEB-01, puis plus tard WEB-02) :

```bash
sudo apt update
sudo apt install -y nginx git
```

✅ `systemctl is-active nginx` affiche `active`.
Dans un navigateur, `http://<IP-de-la-VM>/` affiche « Welcome to nginx! » (si le réseau le permet).

---

## Installation (sur CHAQUE VM web)

### Étape 1 – Télécharger l'application

```bash
sudo git clone <ADRESSE_DU_DEPOT> /opt/gaming-quiz-battle
cd /opt/gaming-quiz-battle
```

> L'adresse du dépôt vous est donnée par l'enseignant.

### Étape 2 – Lancer le setup

```bash
sudo ./setup.sh
```

Répondez aux questions. Quand une valeur est proposée entre `[crochets]`, appuyez simplement sur
**Entrée** pour l'accepter.

```text
[2/8] Configuration

  Nom affiché dans le pied de page du site (ex : WEB-01 sur la 1re VM, WEB-02 sur la 2e).
  ? Nom de ce serveur [WEB-01] : WEB-01

  Connexion à la base MySQL (créée en prérequis sur la VM base de données).
  ? Adresse IP du serveur MySQL : 10.0.2.4
  ? Port MySQL [3306] :
  ? Nom de la base de données [gaming_quiz] :
  ? Utilisateur MySQL [quiz_app] :
  ? Mot de passe MySQL :                    ← rien ne s'affiche quand vous tapez, c'est normal
  ✔ Le serveur 10.0.2.4:3306 répond

  Récapitulatif
    Serveur        : WEB-01
    Base MySQL     : quiz_app@10.0.2.4:3306/gaming_quiz
  ? Lancer l'installation ? [O/n] :
```

Le script continue tout seul (comptez **3 à 5 minutes**) :

```text
[3/8] Node.js                       ✔ Node.js v24 installé
[4/8] Compilation de l'application  ok
[5/8] Vérification de la base       Connexion à MySQL et vérification des droits… ok
[6/8] Service systemd (API)         ok
[7/8] Nginx (site web)              ok
[8/8] Démarrage et vérification     ok

  🎉 Installation terminée !

  Site web       : http://10.0.1.4/
  Nom du serveur : WEB-01 (affiché en bas de la page)
```

### Étape 3 – Vérifier

Ouvrez le site dans un navigateur. En bas de la page, vous devez voir **Serveur API : WEB-01**.

Ou, dans le terminal :

```bash
curl http://127.0.0.1/ready
```

✅ La réponse contient `"status":"READY"`.

### Étape 4 – Recommencer sur WEB-02

Refaites **Prérequis 2** et **Installation** sur la deuxième VM web, en répondant `WEB-02` à la
question « Nom de ce serveur ». Utilisez la **même** base de données : les deux serveurs partagent
les mêmes joueurs et les mêmes scores.

---

## ✔️ Check-list

- [ ] Sur WEB-01 : `curl http://127.0.0.1/ready` → `READY`
- [ ] Sur WEB-02 : `curl http://127.0.0.1/ready` → `READY`
- [ ] Le pied de page affiche `WEB-01` sur la première VM, `WEB-02` sur la deuxième
- [ ] Après `sudo reboot` d'une VM web, le site refonctionne tout seul

**Et ensuite ?** Mettre HAProxy devant les deux VM web (health check : `GET /ready`), puis suivre
les scénarios de [multi-instance-testing.md](multi-instance-testing.md).

---

## Le setup affiche une erreur ?

Le script s'arrête avec un message en rouge `✖`. Les cas les plus fréquents :

| Message | Solution |
|---|---|
| `Ce script doit être lancé avec sudo` | Tapez `sudo ./setup.sh` |
| `Impossible de joindre … sur le port 3306` | Mauvaise IP, MySQL arrêté, `bind-address` pas modifié (Prérequis 1.2), ou port 3306 bloqué par le NSG / pare-feu |
| `Accès refusé pour l'utilisateur « quiz_app »` | Mauvais mot de passe, ou le réseau `'quiz_app'@'10.0.1.%'` ne correspond pas à l'IP de la VM web |
| `La base « gaming_quiz » n'existe pas` | Le `CREATE DATABASE` du Prérequis 1.3 n'a pas été fait (ou faute de frappe) |
| `n'a pas le droit de créer des tables` | Le `GRANT ALL PRIVILEGES` du Prérequis 1.3 manque |
| `L'étape « … » a échoué` | Regardez les lignes affichées sous le message ; le détail complet est dans `/var/log/gaming-quiz-setup.log` |

Une fois le problème corrigé, relancez simplement `sudo ./setup.sh`.

Pour corriger une information saisie (IP, mot de passe…), relancez `sudo ./setup.sh` et répondez
**n** à « Garder cette configuration ? ».

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
| Mettre à jour l'application | `cd /opt/gaming-quiz-battle && sudo git pull && sudo ./setup.sh` |

---

## Mini-lexique Linux

| Mot | Signification |
|---|---|
| `sudo` | Exécuter une commande en tant qu'administrateur (root) |
| `cd /dossier` | Se déplacer dans un dossier |
| `apt install` | Installer un logiciel |
| `systemctl` | Démarrer / arrêter / voir l'état d'un **service** (programme qui tourne en arrière-plan) |
| `journalctl` | Lire les logs (journaux) des services |
| `curl` | Faire une requête web depuis le terminal |
| `nano fichier` | Éditer un fichier texte (`Ctrl+O` = enregistrer, `Ctrl+X` = quitter) |

---

## Que fait le setup exactement ?

Pour les curieux (et pour comprendre ce que vous dépannez) :

| Étape | Action |
|---|---|
| 1 | Vérifie que Nginx est installé ; installe `curl` et `rsync` |
| 2 | Pose les questions, teste que le port MySQL répond |
| 3 | Installe Node.js 24 s'il est absent |
| 4 | `npm ci` puis `npm run build` dans `/opt/gaming-quiz-battle` |
| 5 | Crée l'utilisateur système `gamingquiz`, teste la connexion MySQL, écrit la configuration dans `/etc/gaming-quiz/gaming-quiz.env` (lisible uniquement par root et `gamingquiz`) |
| 6 | Installe le service `/etc/systemd/system/gaming-quiz.service` et le démarre |
| 7 | Copie le site dans `/var/www/gaming-quiz` et installe la configuration Nginx |
| 8 | Attend que `http://127.0.0.1/ready` réponde `200` |

Au premier démarrage, l'API crée les tables et insère les 140 questions (message
`database_initialized` dans `journalctl -u gaming-quiz`). Si les deux VM démarrent en même temps,
un verrou MySQL garantit que ce n'est fait qu'une seule fois.

L'installation manuelle, étape par étape, est décrite dans [installation.md](installation.md).
