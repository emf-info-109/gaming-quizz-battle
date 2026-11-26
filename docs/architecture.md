# Architecture de Gaming Quiz Battle

L'application fonctionne avec **un seul serveur web**. Ce document explique aussi **comment**
elle peut, si on le souhaite, tourner sur plusieurs serveurs web en même temps, derrière un load
balancer en round-robin, **sans sticky sessions** et sans perdre de données quand un serveur
s'arrête.

## 1. Vue d'ensemble

```text
 Navigateur ──► [load balancer, optionnel] ──► Nginx (VM WEB) ──► fichiers statiques React (/var/www/gaming-quiz)
                                            │
                                            └── /api/, /health, /ready ──► Express (127.0.0.1:3000, systemd)
                                                                                 │
                                                                                 ▼
                                                                         MySQL 8 (VM DATABASE)
```

| Composant | Rôle | État conservé |
|---|---|---|
| React (build Vite) | Interface, polling, chronos d'affichage | Jeton du joueur (`localStorage`), métriques du tableau de bord Cloud (`sessionStorage`) |
| Nginx | Sert les fichiers statiques, relaie l'API vers `127.0.0.1:3000`, ajoute les en-têtes de sécurité | Aucun |
| Express (Node.js) | API REST, validation, règles du jeu, calcul des scores | **Aucun état métier** (seulement les compteurs de rate limiting) |
| MySQL 8 | Joueurs, parties, questions, réponses, scores | **Tout l'état persistant** |

S'il y a plusieurs VM web, elles exécutent **exactement le même code et le même build**. Seule la variable
`INSTANCE_NAME` (et éventuellement `DB_HOST`) diffère.

## 2. Stateless : les quatre règles

1. **Pas de session en mémoire.** Un joueur est identifié par un jeton aléatoire de 256 bits
   envoyé dans `Authorization: Bearer …`. Le serveur ne stocke que son empreinte SHA-256
   (`players.token_hash`). N'importe quelle instance peut vérifier le jeton avec une requête SQL.
2. **Pas d'état de partie en mémoire.** Les parties, participants, questions tirées et réponses
   sont dans MySQL. Chaque requête relit ce dont elle a besoin.
3. **Pas de timer en mémoire.** L'avancement d'une partie multijoueur est *calculé* (section 3).
4. **Pas de fichier local indispensable.** Le frontend est un build statique identique partout ;
   l'API n'écrit rien sur le disque (le service systemd est d'ailleurs en `ProtectSystem=strict`).

Conséquence : on peut arrêter, redémarrer ou ajouter une instance à tout moment. Un test
automatisé (`backend/test/integration/multiplayer.test.ts`) ferme une instance en pleine partie et
vérifie qu'une instance neuve reprend la partie là où elle en est.

### Comment le profil suit le joueur d'un serveur à l'autre

**Le problème des sessions classiques.** D'habitude, le serveur garde en mémoire « la session
n° 123 = Alice » et le navigateur reçoit un cookie contenant ce numéro. Derrière un load balancer
en round-robin, la requête suivante peut arriver sur WEB-02, qui n'a pas cette session en
mémoire : Alice paraît déconnectée. Les solutions habituelles sont les *sticky sessions* (le load
balancer renvoie toujours Alice vers le même serveur) ou un stockage de sessions partagé (Redis).
Ici, on ne fait ni l'un ni l'autre : **il n'y a pas de session côté serveur**.

**Ce qui se passe réellement :**

1. **Création du profil** (`POST /api/players`, `backend/src/services/playerService.ts`) : le
   serveur tire un **jeton secret** aléatoire (32 octets → 43 caractères), enregistre le joueur
   dans MySQL avec seulement l'**empreinte SHA-256** de ce jeton (`players.token_hash`), et
   renvoie le jeton au navigateur, une seule fois.
2. **Le navigateur garde le jeton** dans `localStorage` (clé `gqb.token`, voir
   `frontend/src/lib/session.ts`), ainsi qu'une copie du pseudo et de l'avatar (`gqb.player`)
   pour un affichage immédiat.
3. **À chaque requête**, le navigateur envoie `Authorization: Bearer <jeton>`. Le serveur qui la
   reçoit, quel qu'il soit, calcule le SHA-256 du jeton et cherche le joueur dans MySQL
   (`backend/src/middleware/auth.ts`, index unique sur `players.token_hash`). Trouvé : la
   requête est celle de ce joueur. Pas trouvé : `401`.
4. **Au chargement de la page**, le frontend vérifie le jeton avec `GET /api/players/me`
   (`frontend/src/hooks/PlayerContext.tsx`). Si la base a été réinitialisée (réponse `401`), le
   profil local est oublié.

```text
Navigateur (localStorage : jeton)
   │  Authorization: Bearer abc…
   ▼
 load balancer ──► WEB-01 ─┐   sha256(abc…) → SELECT … FROM players WHERE token_hash = ?
               └─► WEB-02 ─┴──► MySQL (joueurs, parties, réponses, chat, présence)
```

WEB-01 et WEB-02 font **exactement le même calcul sur la même base**, donc ils retrouvent le même
joueur. Le serveur ne retient rien entre deux requêtes : la « session », c'est le jeton dans le
navigateur plus la base MySQL partagée. Tout le reste suit le même principe : parties, scores,
chat, présence en salle d'attente et chrono (calculé avec `NOW(3)` de MySQL, pas avec l'horloge
de chaque serveur). Un joueur peut répondre à la question 3 via WEB-01 et voir la correction
servie par WEB-02.

**Pourquoi stocker l'empreinte et pas le jeton ?** Quelqu'un qui volerait une copie de la base
n'obtiendrait que des empreintes, inutilisables pour se faire passer pour un joueur (même principe
que pour les mots de passe).

**Limites de ce choix :**

- Le profil est **lié au navigateur** : vider les données du site, ou changer de navigateur ou
  d'appareil, fait perdre le jeton, et il n'y a ni compte ni mot de passe pour le récupérer
  (d'où la confirmation de « Changer de joueur »).
- Un script malveillant injecté dans la page pourrait lire `localStorage` : c'est ce qu'empêche
  la CSP de Nginx (`script-src 'self'`, section 7).
- Les jetons **n'expirent pas**. C'est acceptable ici : un profil ne contient qu'un pseudo et un
  avatar.

**Pour l'observer :**

- Outils de développement du navigateur → *Application* → *Local Storage* : `gqb.token`.
  Onglet *Réseau* : l'en-tête `Authorization` sur chaque requête, et `X-Instance-Name` dans la
  réponse (quel serveur a répondu).
- Page **Tableau de bord Cloud**, « Surveillance continue » : arrêter une instance
  (`sudo systemctl stop gaming-quiz`) ; le joueur reste connecté, avec le même profil, sur l'autre.
- `backend/test/integration/multiplayer.test.ts` envoie chaque requête alternativement à deux
  instances (comme un load balancer en round-robin) et vérifie que tout fonctionne.

## 3. L'horloge d'une partie multijoueur

Au démarrage, une seule valeur est écrite : `games.started_at = NOW(3)` (heure **MySQL**, à la
milliseconde). Les durées (compte à rebours, question, correction) sont copiées dans la partie à
sa création.

```text
started_at
   │◄─ countdown ─►│◄──── question 1 ────►│grace│◄─ correction 1 ─►│◄──── question 2 ────► ...
                   0 s                   15 s  15,4 s            21 s
```

À chaque requête, l'instance calcule (fonction pure `computeClock`, `backend/src/domain/gameClock.ts`) :

```text
écoulé  = NOW(3) - started_at            (calculé par MySQL : TIMESTAMPDIFF)
index   = floor((écoulé - countdown) / (durée_question + durée_correction))
phase   = question | reveal | countdown | finished
```

Pourquoi l'heure **MySQL** et pas celle de Node ? Parce que les horloges de WEB-01 et WEB-02 ne
sont jamais parfaitement synchronisées. Avec une seule horloge de référence, toutes les instances
calculent exactement le même état.

La **marge de grâce** (400 ms) accepte une réponse partie juste avant la fin du chrono malgré la
latence réseau. La bonne réponse n'est envoyée qu'**après** cette marge.

Quand le calcul indique « terminé » alors que la base indique encore `in_progress`, l'instance
exécute :

```sql
UPDATE games SET status = 'finished', finished_at = …
 WHERE id = ? AND status = 'in_progress' AND <temps total écoulé>
```

La condition rend l'opération **idempotente** : si WEB-01 et WEB-02 le font en même temps, une
seule mise à jour a réellement lieu.

### Mode solo

Le joueur avance à son rythme : `POST /next` enregistre `games.current_question_started_at = NOW(3)`
et c'est MySQL qui mesure le temps de réponse lors de `POST /answers`. Le navigateur ne peut donc ni
tricher sur le temps, ni obtenir la correction avant d'avoir répondu (ou laissé expirer le chrono).

## 4. Concurrence et intégrité

| Risque | Protection |
|---|---|
| Un joueur répond deux fois (double clic, deux onglets, deux instances) | `UNIQUE (game_id, player_id, position)` sur `answers` + verrou `SELECT … FOR UPDATE` sur la ligne `game_players` |
| Score incohérent | L'insertion de la réponse et `UPDATE game_players SET score = score + ?` sont dans **la même transaction** |
| 31ᵉ joueur dans une partie de 30 | `SELECT … FOR UPDATE` sur la partie pendant le `join` : les arrivées simultanées sont sérialisées |
| Deux démarrages simultanés | Verrou sur la partie + vérification `status = 'lobby'` |
| Collision de code de partie | `UNIQUE (code)` + nouvel essai |
| Deadlock InnoDB | `withTransaction()` rejoue automatiquement la transaction (3 essais) |
| Modifier son score via l'API | Aucune route n'accepte de score ; les schémas zod sont `strict()` (champ inconnu = 400) |
| Voir la bonne réponse trop tôt | `correct_index` n'est jamais sélectionné pour une question ouverte ; pendant une question, les scores affichés excluent la question en cours (sinon un saut de score trahirait la réponse) |

## 5. Modèle de données

```text
categories 1──n questions
players    1──n games (host_player_id)
games      1──n game_questions n──1 questions
games      1──n game_players  n──1 players
game_players 1──n answers     (UNIQUE game_id, player_id, position)
games      1──n game_messages n──0..1 players   (chat de la salle d'attente ; player NULL = annonce)
schema_migrations              (migrations appliquées + empreinte SHA-256)
```

Index principaux : `players.token_hash` (unique), `players.last_seen_at` (joueurs connectés),
`games.code` (unique), `games(status, created_at)`, `answers(player_id)`, `game_players(player_id)`,
`game_messages(game_id, id)`.

Le schéma est dans `database/migrations/` (`001_initial_schema.sql`, puis `002_lobby_chat.sql` :
nom et visibilité des parties, présence des joueurs, chat), les données initiales dans
`database/seeds/`. Une VM déjà installée applique la nouvelle migration toute seule au
redémarrage de l'API (`AUTO_MIGRATE=true`).

### Salle d'attente, liste des parties et chat

Le chat suit les mêmes règles que le reste du jeu : **aucun WebSocket, aucun état en mémoire**.
Les messages sont stockés dans `game_messages` et arrivent avec le polling de l'état
(`GET /api/games/:code?afterMessageId=N` ne renvoie que les messages plus récents que `N`) :
peu importe que WEB-01 reçoive le message et que WEB-02 le distribue.

La liste « Parties en attente » (`GET /api/games`) ne montre que les salles publiques, non
lancées, de moins de 3 h, dont l'organisateur est présent.

**Présence et départs.** Chaque requête de polling met à jour `game_players.last_seen_at`
(au plus toutes les 5 s). Un joueur silencieux depuis **90 s** est considéré comme parti :

| Qui part | Comment c'est détecté | Effet |
|---|---|---|
| L'organisateur | Bouton « Annuler la partie », navigation dans l'app (confirmation), fermeture de l'onglet (`pagehide` → `POST /away` : il n'a plus que **10 s** pour revenir, un simple rechargement n'annule donc rien), ou 90 s sans nouvelle | La partie est **annulée pour tous** |
| Un autre joueur | Bouton « Quitter la salle », navigation dans l'app, fermeture de l'onglet, ou 90 s sans nouvelle | Il est retiré de la salle (annonce dans le chat) |

**Une salle à la fois** : créer ou rejoindre une partie annule les salles que le joueur
organise et le retire des autres salles d'attente.

Aucune minuterie côté serveur : ces règles sont appliquées « à la volée » par la requête
suivante (polling d'un autre joueur, liste des parties, tentative de rejoindre), avec des
`UPDATE`/`DELETE` conditionnels qui restent corrects si WEB-01 et WEB-02 les exécutent en
même temps.

**Initialisation automatique** (`AUTO_MIGRATE=true`, par défaut) : au démarrage, l'API applique
les migrations manquantes puis les seeds nouveaux ou modifiés (empreintes SHA-256 enregistrées
dans `schema_migrations` et `schema_seeds`). Sur une base vide, le premier démarrage crée donc
les tables et les 140 questions ; les démarrages suivants ne refont rien. Un verrou MySQL
(`GET_LOCK`) garantit que deux VM qui démarrent en même temps ne le font qu'une fois. Tant que
cette initialisation n'a pas réussi (MySQL injoignable, droits insuffisants…), `/ready` renvoie
`503 INITIALIZING` et l'API réessaie toutes les 3 à 30 secondes, avec un message d'aide dans les
logs (`database_init_failed`, champ `hint`).

L'outil `backend/src/cli/db.ts` (`check`, `migrate`, `seed`, `setup`, `status`) permet de faire
ces opérations à la main.

## 6. Health checks

| Endpoint | Vérifie | Codes | Usage |
|---|---|---|---|
| `GET /health` | Le processus Node répond | 200 | Liveness : « faut-il redémarrer ce service ? » |
| `GET /ready` | MySQL répond en < 2 s **et** l'instance n'est pas en cours d'arrêt | 200 / 503 | Readiness : « peut-on envoyer du trafic à cette instance ? » → **health check HAProxy** |

Lors d'un `systemctl stop`, l'instance reçoit `SIGTERM`, passe immédiatement `/ready` à 503,
attend 2 s (le temps que HAProxy la retire), termine les requêtes en cours puis s'arrête.

Les deux endpoints existent aussi sous `/api/health` et `/api/ready`.

## 7. Sécurité

- **Validation** de toutes les entrées avec zod (types, longueurs, listes blanches d'avatars et de
  catégories, regex de pseudo et de code).
- **SQL paramétré** partout (`?`). Les seules valeurs interpolées sont des entiers bornés (`LIMIT`)
  ou des fragments constants.
- **XSS** : React échappe tout le contenu ; aucun `dangerouslySetInnerHTML`. Les pseudos sont limités
  à lettres/chiffres/espace/`._-`. Nginx ajoute une CSP stricte (`script-src 'self'`).
- **CORS** : aucune origine tierce par défaut (`CORS_ORIGINS` vide), le frontend étant servi par le
  même domaine que l'API.
- **Rate limiting** (express-rate-limit) : global par IP, création de profils par IP, actions de
  partie par joueur, endpoint de diagnostic par IP. ⚠️ Compteurs par instance.
- **Erreurs** : réponses JSON génériques `{error: {code, message}}`. Les stack traces et messages SQL
  ne vont que dans les logs (journald).
- **Secrets** uniquement dans l'environnement (`/etc/gaming-quiz/gaming-quiz.env`, mode 640).
  `.gitignore` exclut tous les `.env`.
- **IP réelle** : `TRUST_PROXY=loopback,uniquelocal` fait confiance à Nginx et à HAProxy sur réseau
  privé pour lire `X-Forwarded-For` (nécessaire au rate limiting par IP).

## 8. Observabilité

- `X-Instance-Name` et `X-Request-Id` sur **chaque** réponse.
- Logs JSON une ligne par événement : `journalctl -u gaming-quiz -f`. Avec `LOG_LEVEL=debug`, chaque
  requête est journalisée (méthode, chemin, statut, durée, IP).
- `/cloud-dashboard` : statistiques **mesurées par le navigateur** (instance, temps de réponse,
  erreurs). Elles ne représentent pas le trafic global : pour cela, utiliser les statistiques
  HAProxy, les logs Nginx ou un outil de supervision.
