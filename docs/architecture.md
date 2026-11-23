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
schema_migrations              (migrations appliquées + empreinte SHA-256)
```

Index principaux : `players.token_hash` (unique), `players.last_seen_at` (joueurs connectés),
`games.code` (unique), `games(status, created_at)`, `answers(player_id)`, `game_players(player_id)`.

Le schéma est dans `database/migrations/001_initial_schema.sql`, les données initiales dans
`database/seeds/`.

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
