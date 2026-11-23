# Tester le fonctionnement multi-instances

> *Optionnel* – ce document concerne l'**évolution** de l'architecture de base : plusieurs
> serveurs web derrière un load balancer. Avec un seul serveur web, les scénarios
> 0, 5, 6 et 7 restent utiles.

Ce document propose des scénarios pour **prouver** que l'infrastructure fonctionne :
répartition de charge, absence de perte de session, tolérance à la panne d'un serveur web.

Pour chaque test, notez ce que vous **attendez**, ce que vous **observez**, et expliquez l'écart
éventuel. Les commandes supposent que le site est accessible sur `https://quiz.example.ch`
(remplacez par votre adresse).

## Outils d'observation

| Outil | Ce qu'il montre |
|---|---|
| Pied de page du site | `Serveur API : WEB-0x` + bouton ↻ pour refaire une requête |
| `/cloud-dashboard` | Répartition des réponses reçues par **votre** navigateur, temps de réponse, erreurs, générateur de requêtes (10/50/100), surveillance continue (1 req/s) |
| En-tête `X-Instance-Name` | Instance ayant traité **chaque** réponse |
| `journalctl -u gaming-quiz -f` (sur chaque VM) | Logs de l'API ; avec `LOG_LEVEL=debug`, une ligne par requête |
| `/var/log/nginx/access.log` | Requêtes reçues par Nginx sur chaque VM |
| Statistiques HAProxy | État UP/DOWN des backends, nombre de sessions (si vous les activez) |

> Les métriques du tableau de bord Cloud ne concernent **que votre navigateur**. Pour une vision
> globale, comparez avec HAProxy et les logs des deux VM.

## 0. Vérifications de base (sur chaque VM web)

```bash
curl -s http://127.0.0.1/health     # {"status":"UP","instance":"WEB-01",...}
curl -s http://127.0.0.1/ready      # {"status":"READY",...,"checks":{"database":"UP"}}
```

## 1. Répartition round-robin

```bash
for i in $(seq 1 10); do
  curl -s -o /dev/null -D - https://quiz.example.ch/api/instance | grep -i x-instance-name
done
```

**Attendu :** alternance `WEB-01`, `WEB-02`, `WEB-01`…

Dans le navigateur : `/cloud-dashboard` → « 100 requêtes ». La répartition doit être proche de
50 % / 50 %. Pourquoi n'est-elle pas forcément exacte ? (indice : les autres utilisateurs et les
autres requêtes de la page passent aussi par HAProxy).

## 2. Aucune perte de session (sans sticky session)

1. Créez un profil, lancez une partie solo.
2. Ouvrez les outils de développement (F12 → Réseau) et observez `X-Instance-Name` des requêtes
   `next` et `answers`.

**Attendu :** les requêtes d'une même partie alternent entre WEB-01 et WEB-02, et la partie se
déroule normalement. Expliquez pourquoi (voir [architecture.md](architecture.md), section 2).

## 3. Multijoueur réparti

1. Navigateur A (ou PC A) : « Créer une partie ».
2. Navigateurs B, C… (téléphones, autres PC, fenêtres privées) : « Rejoindre » avec le code.
3. Lancez la partie.

**Attendu :** tous les joueurs voient la même question au même moment, le même chrono, le même
classement, alors que leurs requêtes de polling (≈ 1/s) sont traitées par des instances
différentes.

## 4. Panne d'une instance pendant une partie

Pendant une partie multijoueur (ou avec la « Surveillance continue » du tableau de bord) :

```bash
# Sur WEB-02
sudo systemctl stop gaming-quiz
```

**Attendu :**

- `/ready` de WEB-02 ne répond plus → HAProxy marque WEB-02 `DOWN` après quelques vérifications.
- La surveillance continue n'affiche plus que WEB-01 (éventuellement quelques erreurs pendant la
  détection : combien ? de quoi dépend ce nombre ?).
- **La partie continue** et aucun score n'est perdu.

```bash
sudo systemctl start gaming-quiz   # WEB-02 revient dans la rotation
```

Variante plus brutale : arrêter **toute la VM** WEB-02 depuis le portail Azure.

## 5. Arrêt propre vs arrêt brutal

```bash
# Arrêt propre : /ready passe à 503, puis les requêtes en cours se terminent
sudo systemctl stop gaming-quiz

# Arrêt brutal : simulation de crash
sudo systemctl kill -s SIGKILL gaming-quiz
```

Comparez le nombre d'erreurs vues par les joueurs dans les deux cas. Que se passe-t-il ensuite
avec `Restart=on-failure` ?

## 6. Perte de la base de données

```bash
# Sur la VM DATABASE
sudo systemctl stop mysql
```

**Attendu :** `/health` reste à 200, `/ready` passe à 503 sur **les deux** VM web, et HAProxy n'a
plus aucun backend disponible. Quel est donc le point unique de défaillance de cette
architecture ? Comment le supprimer ?

## 7. Données persistantes

1. Jouez quelques parties, notez votre score dans « Profil ».
2. Redémarrez les deux VM web.
3. Rechargez le site.

**Attendu :** même profil, même score, même classement. Où sont stockées ces données ? Qu'est-ce
qui est conservé dans le navigateur ? (indice : `localStorage`, clé `gqb.token`)

## 8. Limites de sécurité du générateur de charge

Sur `/cloud-dashboard`, enchaînez plusieurs séries de 100 requêtes.

**Attendu :** au-delà de `RATE_LIMIT_DIAG_PER_MINUTE` (600 par défaut, **par instance**), l'API
répond `429` et le générateur s'arrête. Pourquoi la limite effective est-elle environ le double avec
deux instances ?

## 9. Tests automatisés

Le dépôt contient des tests qui simulent déjà deux instances partageant la même base :

```bash
npm test
```

Ils vérifient notamment : alternance WEB-01/WEB-02 pendant une partie, réponse envoyée 6 fois en
parallèle sur deux instances (une seule acceptée), 6 joueurs rejoignant simultanément une partie
limitée (aucun dépassement), reprise d'une partie par une instance neuve après l'arrêt d'une autre.
Voir `backend/test/integration/`.
