#!/usr/bin/env bash
# =============================================================================
#  Gaming Quiz Battle – assistant d'installation pour Ubuntu Server 24.04
#
#  Utilisation (dans un terminal, sans « | ») :
#     sudo /opt/gaming-quiz-battle/setup.sh
#  Première installation depuis Internet : voir install.sh
#
#  L'assistant (fenêtres navigables au clavier) :
#    1. vérifie les prérequis (Nginx),
#    2. demande le nom du serveur, le port du site web et les informations MySQL,
#    3. teste la connexion à la base AVANT d'installer quoi que ce soit,
#    4. installe Node.js, compile l'application, crée le service systemd,
#       configure Nginx et démarre l'application.
#  Au premier démarrage, l'application crée les tables et les 140 questions.
#
#  Relancer l'assistant = mettre à jour l'application (configuration conservée).
#
#  Mode automatique, sans fenêtre (tests, scripts) :
#     sudo GQ_INSTANCE_NAME=WEB-01 GQ_DB_HOST=10.0.2.4 GQ_DB_PASSWORD=xxx ./setup.sh --yes
#  (port du site : GQ_WEB_PORT=8080, défaut 80)
#  Mode texte (sans fenêtres) : sudo ./setup.sh --text
#
#  Désinstallation : sudo /opt/gaming-quiz-battle/uninstall.sh
# =============================================================================
set -Eeuo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_DIR=/etc/gaming-quiz
ENV_FILE="$ENV_DIR/gaming-quiz.env"
WEB_ROOT=/var/www/gaming-quiz
SERVICE=gaming-quiz
SERVICE_USER=gamingquiz
NGINX_SITE=/etc/nginx/sites-available/gaming-quiz
API_PORT=3000   # port interne d'Express (127.0.0.1), uniquement joignable par Nginx
LOG_FILE=/var/log/gaming-quiz-setup.log
NODE_MAJOR=24
NODE_MIN="22.22.0"
TITLE="Gaming Quiz Battle - installation"

ASSUME_YES=0
FORCE_TEXT=0
for arg in "$@"; do
  case "$arg" in
    -y|--yes) ASSUME_YES=1 ;;
    --text) FORCE_TEXT=1 ;;
    -h|--help) sed -n '2,26p' "$0"; exit 0 ;;
    *) echo "Option inconnue : $arg (voir --help)"; exit 2 ;;
  esac
done

[[ $EUID -eq 0 ]] || { echo "Ce script doit être lancé avec sudo :  sudo ./setup.sh"; exit 1; }

# Les questions nécessitent un vrai terminal. Lancé via un tuyau ("curl … | sudo bash"),
# le clavier n'atteint pas l'assistant (sudo sur Ubuntu 24.04 utilise un pseudo-terminal) :
# on s'arrête avec un message clair au lieu de rester bloqué.
if [[ $ASSUME_YES -eq 0 && ! -t 0 ]]; then
  echo "L'assistant doit être lancé directement dans un terminal, sans « | » :"
  echo "  sudo $APP_DIR/setup.sh"
  exit 1
fi

# Interface : fenêtres (whiptail) si possible, sinon texte.
UI=text
if [[ $ASSUME_YES -eq 0 && $FORCE_TEXT -eq 0 && -t 0 && -t 1 ]] && command -v whiptail >/dev/null 2>&1; then
  UI=wizard
fi

# --- Couleurs (mode texte) ---------------------------------------------------
if [[ -t 1 ]]; then
  C_RESET=$'\e[0m'; C_BOLD=$'\e[1m'; C_DIM=$'\e[2m'
  C_RED=$'\e[31m'; C_GREEN=$'\e[32m'; C_YELLOW=$'\e[33m'; C_CYAN=$'\e[36m'
else
  C_RESET=''; C_BOLD=''; C_DIM=''; C_RED=''; C_GREEN=''; C_YELLOW=''; C_CYAN=''
fi

# apt sans aucune question (y compris dans le script NodeSource et needrestart),
# et attente (au lieu d'un blocage muet) si les mises à jour automatiques d'Ubuntu tiennent le verrou.
export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=a NEEDRESTART_SUSPEND=1
APT_CONF_TMP="$(mktemp /tmp/gq-apt.XXXXXX)"
echo 'DPkg::Lock::Timeout "900";' >"$APT_CONF_TMP"
chmod 644 "$APT_CONF_TMP"
export APT_CONFIG="$APT_CONF_TMP"
trap 'rm -f "$APT_CONF_TMP"' EXIT

: >>"$LOG_FILE"
echo "===== Assistant lancé le $(date '+%F %T') (interface : $UI)" >>"$LOG_FILE"
log() { echo "$*" >>"$LOG_FILE"; }

# =============================================================================
#  Fonctions d'interface (identiques en mode fenêtres et en mode texte)
# =============================================================================
GAUGE_PID=""
GAUGE_FIFO=""

w_size() { # hauteur adaptée au nombre de lignes du texte
  local lines; lines=$(printf '%s\n' "$1" | wc -l)
  echo $(( lines + 8 < 22 ? lines + 8 : 22 ))
}

ui_msg() { # ui_msg "texte"   (Échap = quitter l'assistant)
  if [[ $UI == wizard ]]; then
    local rc=0
    whiptail --title "$TITLE" --ok-button "OK" --msgbox "$1" "$(w_size "$1")" 76 || rc=$?
    [[ $rc -eq 255 ]] && cancelled
    return 0
  else
    echo; printf '%s\n' "$1" | sed 's/^/  /'
  fi
}

ui_yesno() { # ui_yesno "question" → 0 = oui
  [[ $ASSUME_YES -eq 1 ]] && return 0
  if [[ $UI == wizard ]]; then
    whiptail --title "$TITLE" --yes-button "Oui" --no-button "Non" --yesno "$1" "$(w_size "$1")" 76
  else
    local answer
    echo; printf '%s\n' "$1" | sed 's/^/  /'
    read -r -p "  ${C_BOLD}?${C_RESET} [O/n] : " answer
    [[ -z "$answer" || "$answer" =~ ^[OoYy] ]]
  fi
}

ui_info() { # message non bloquant ("Veuillez patienter…")
  if [[ $UI == wizard ]]; then
    TERM=${TERM:-linux} whiptail --title "$TITLE" --infobox "$1" 8 76
  else
    echo "  ${C_DIM}·${C_RESET} $1"
  fi
}

cancelled() {
  progress_end
  [[ $UI == wizard ]] && clear
  echo "Installation annulée. Relance-la à tout moment avec : sudo $APP_DIR/setup.sh"
  exit 1
}

# ask VARIABLE "Titre" "Explication" "défaut" "regex" "message d'erreur" [secret]
ask() {
  local var="$1" label="$2" help="$3" default="$4" regex="$5" errmsg="$6" secret="${7:-}"
  local answer
  if [[ $ASSUME_YES -eq 1 ]]; then
    answer="$default"
    [[ -n "$answer" && "$answer" =~ $regex ]] || die "Mode --yes : valeur manquante ou invalide pour « $label »."
    printf -v "$var" '%s' "$answer"; return
  fi
  while true; do
    if [[ $UI == wizard ]]; then
      if [[ -n "$secret" ]]; then
        local note=""
        [[ -n "$default" ]] && note=$'\n\n(Laisser vide pour garder le mot de passe actuel.)'
        answer=$(whiptail --title "$TITLE" --ok-button "Suivant" --cancel-button "Annuler" \
          --passwordbox "$help$note" 14 76 3>&1 1>&2 2>&3) || cancelled
      else
        answer=$(whiptail --title "$TITLE" --ok-button "Suivant" --cancel-button "Annuler" \
          --inputbox "$help" 14 76 "$default" 3>&1 1>&2 2>&3) || cancelled
      fi
    else
      echo; echo "  ${C_DIM}$help${C_RESET}" | head -n 1
      if [[ -n "$secret" ]]; then
        read -r -s -p "  ${C_BOLD}?${C_RESET} $label : " answer; echo
      elif [[ -n "$default" ]]; then
        read -r -p "  ${C_BOLD}?${C_RESET} $label ${C_DIM}[$default]${C_RESET} : " answer
      else
        read -r -p "  ${C_BOLD}?${C_RESET} $label : " answer
      fi
    fi
    answer="${answer#"${answer%%[![:space:]]*}"}"; answer="${answer%"${answer##*[![:space:]]}"}"  # trim
    answer="${answer:-$default}"
    if [[ -n "$answer" && "$answer" =~ $regex ]]; then
      printf -v "$var" '%s' "$answer"; return
    fi
    if [[ $UI == wizard ]]; then ui_msg "Valeur invalide pour « $label ».

$errmsg"; else echo "  ${C_YELLOW}⚠ $errmsg${C_RESET}"; fi
  done
}

# --- Progression de l'installation ------------------------------------------
progress_start() {
  [[ $UI == wizard ]] || return 0
  GAUGE_FIFO="$(mktemp -u /tmp/gq-gauge.XXXXXX)"
  mkfifo "$GAUGE_FIFO"
  whiptail --title "$TITLE" --gauge "Démarrage de l'installation…" 9 76 0 <"$GAUGE_FIFO" &
  GAUGE_PID=$!
  exec 3>"$GAUGE_FIFO"
}

PROGRESS_PCT=0
PROGRESS_MSG=""
progress() { # progress POURCENTAGE "Texte"
  PROGRESS_PCT="$1"; PROGRESS_MSG="$2"
  if [[ -n "$GAUGE_PID" ]]; then
    printf 'XXX\n%d\n%s\n\n(détails : %s)\nXXX\n' "$1" "$2" "$LOG_FILE" >&3
  else
    echo; echo "${C_BOLD}${C_CYAN}[$1 %] $2${C_RESET}"
  fi
  log "----- $(date +%T) [$1 %] $2"
}

progress_end() {
  if [[ -n "$GAUGE_PID" ]]; then
    exec 3>&- || true
    wait "$GAUGE_PID" 2>/dev/null || true
    GAUGE_PID=""
    rm -f "$GAUGE_FIFO"
  fi
}

die() {
  local msg="$1"
  progress_end
  trap - ERR
  log "ÉCHEC : $msg"
  if [[ $UI == wizard ]]; then
    local tail_log; tail_log="$(tail -n 8 "$LOG_FILE" | cut -c1-70)"
    whiptail --title "$TITLE - erreur" --msgbox "$msg

Dernières lignes du journal ($LOG_FILE) :
$tail_log" 22 78 || true
    clear
  fi
  echo "${C_RED}${C_BOLD}✖ $msg${C_RESET}" >&2
  echo "  Journal complet : $LOG_FILE" >&2
  exit 1
}
trap 'die "Erreur inattendue (ligne $LINENO)."' ERR

# Exécute une commande (sortie dans le journal). En cas d'échec : message clair.
run() {
  local msg="$1"; shift
  [[ $UI == text ]] && printf "  %s… " "$msg"
  log "== $(date +%T) $msg : $*"
  local rc=0
  if [[ -n "$GAUGE_PID" ]]; then
    # Barre de progression : on affiche le temps écoulé et la dernière ligne du journal,
    # pour voir que ça avance (ou sur quoi ça attend).
    "$@" </dev/null >>"$LOG_FILE" 2>&1 &
    local pid=$! start=$SECONDS last
    while kill -0 "$pid" 2>/dev/null; do
      last="$(tail -n 1 "$LOG_FILE" 2>/dev/null | tr -d '\r\000-\010\013-\037' | cut -c1-70)"
      printf 'XXX\n%d\n%s\n\n%s – %d s\n> %s\nXXX\n' "$PROGRESS_PCT" "$PROGRESS_MSG" \
        "$msg" "$((SECONDS - start))" "$last" >&3 || true
      sleep 2
    done
    wait "$pid" || rc=$?
  else
    "$@" </dev/null >>"$LOG_FILE" 2>&1 || rc=$?
  fi
  log "== $(date +%T) fin de « $msg » (code $rc)"
  if [[ $rc -eq 0 ]]; then
    [[ $UI == text ]] && echo "${C_GREEN}ok${C_RESET}"
    return 0
  fi
  [[ $UI == text ]] && echo "${C_RED}échec${C_RESET}"
  die "L'étape « $msg » a échoué."
}

# --- Fichier de configuration -------------------------------------------------
env_get() { [[ -f "$ENV_FILE" ]] && grep -E "^$1=" "$ENV_FILE" | tail -n1 | cut -d= -f2- || true; }

env_set() { # env_set CLE VALEUR FICHIER
  local tmp; tmp="$(mktemp)"
  K="$1" V="$2" awk 'BEGIN { FS = "=" }
    $1 == ENVIRON["K"] { print ENVIRON["K"] "=" ENVIRON["V"]; found = 1; next }
    { print }
    END { if (!found) print ENVIRON["K"] "=" ENVIRON["V"] }' "$3" >"$tmp"
  cat "$tmp" >"$3"; rm -f "$tmp"
}

# --- Port du site web (Nginx) --------------------------------------------------
# Port actuellement configuré (installation précédente), vide sinon.
current_web_port() {
  [[ -f "$NGINX_SITE" ]] || return 0
  grep -oE '^[[:space:]]*listen[[:space:]]+[0-9]+' "$NGINX_SITE" | grep -oE '[0-9]+' | head -n1 || true
}

# Nom du programme qui écoute déjà sur ce port TCP (vide si libre).
port_owner() {
  ss -Hltnp "( sport = :$1 )" 2>/dev/null | grep -oE 'users:\(\("[^"]+"' | head -n1 | cut -d'"' -f2 || true
}

# Vérifie un port choisi ; message d'erreur dans PORT_ERROR.
PORT_ERROR=""
web_port_check() {
  local p="$1" owner
  PORT_ERROR=""
  if (( p < 1 || p > 65535 )); then PORT_ERROR="Le port doit être compris entre 1 et 65535."; return 1; fi
  if (( p == API_PORT )); then
    PORT_ERROR="Le port $API_PORT est réservé à l'API interne de l'application. Choisis-en un autre (ex : 8080)."; return 1
  fi
  owner="$(port_owner "$p")"
  if [[ -n "$owner" && "$owner" != "nginx" ]]; then
    PORT_ERROR="Le port $p est déjà utilisé par le programme « $owner ».
Choisis un autre port (ex : 8080), ou arrête ce programme."; return 1
  fi
  return 0
}

version_ge() { [[ "$(printf '%s\n%s\n' "$2" "$1" | sort -V | head -n1)" == "$2" ]]; }

# --- Test de la base de données avec le client mysql --------------------------
# Vérifie : serveur joignable, identifiants, base existante, droit de créer des tables.
DB_ERROR=""
db_check() {
  local cnf out code
  cnf="$(mktemp)"; chmod 600 "$cnf"
  printf '[client]\nhost=%s\nport=%s\nuser=%s\npassword="%s"\nconnect-timeout=5\nprotocol=TCP\n' \
    "$DB_HOST" "$DB_PORT" "$DB_USER" "$DB_PASSWORD" >"$cnf"
  if out="$(mysql --defaults-extra-file="$cnf" -D "$DB_NAME" \
      -e 'CREATE TABLE IF NOT EXISTS _gq_setup_check (id INT); DROP TABLE _gq_setup_check;' 2>&1)"; then
    rm -f "$cnf"; DB_ERROR=""; return 0
  fi
  rm -f "$cnf"
  log "Test MySQL : $out"
  code="$(grep -oE 'ERROR [0-9]+' <<<"$out" | head -n1 | grep -oE '[0-9]+' || true)"
  case "$code" in
    2002|2003) DB_ERROR="Impossible de joindre MySQL sur $DB_HOST, port $DB_PORT.

- L'adresse IP est-elle correcte ?
- MySQL est-il démarré sur la VM base de données ?
- bind-address = 0.0.0.0 a-t-il été configuré (prérequis) ?
- Le port 3306 est-il autorisé par le NSG / pare-feu ?" ;;
    2005) DB_ERROR="Nom d'hôte inconnu : $DB_HOST. Utilise l'adresse IP privée de la VM base de données." ;;
    1045) DB_ERROR="Accès refusé pour l'utilisateur « $DB_USER ».

- Le mot de passe est-il correct ?
- L'utilisateur a-t-il été créé pour le réseau de cette VM ?
  (la partie '@...' du CREATE USER, ex : 'quiz_app'@'10.0.1.%')" ;;
    1049) DB_ERROR="La base « $DB_NAME » n'existe pas.

Crée-la sur la VM base de données :
  CREATE DATABASE $DB_NAME;" ;;
    1044) DB_ERROR="L'utilisateur « $DB_USER » n'a pas accès à la base « $DB_NAME ».

Il manque : GRANT ALL PRIVILEGES ON $DB_NAME.* TO ..." ;;
    1142) DB_ERROR="L'utilisateur « $DB_USER » n'a pas le droit de créer des tables.

Il faut : GRANT ALL PRIVILEGES ON $DB_NAME.* TO ..." ;;
    *) DB_ERROR="La connexion à MySQL a échoué :
$(head -n 3 <<<"$out")" ;;
  esac
  return 1
}

# =============================================================================
#  ÉTAPE 1 – Accueil et prérequis
# =============================================================================
# shellcheck disable=SC1091
. /etc/os-release
[[ "$APP_DIR" != *" "* ]] || die "Le chemin du projet ne doit pas contenir d'espace : $APP_DIR"
[[ -f "$APP_DIR/backend/package.json" && -f "$APP_DIR/frontend/package.json" ]] \
  || die "Lance ce script depuis le dossier du projet gaming-quiz-battle."

if [[ $UI == text ]]; then
  echo "${C_BOLD}${C_CYAN}  ⚡ Gaming Quiz Battle – installation${C_RESET}"
  echo "${C_DIM}  Dossier : $APP_DIR${C_RESET}"
fi

if [[ $ASSUME_YES -eq 0 ]]; then
  ui_msg "Bienvenue dans l'assistant d'installation de Gaming Quiz Battle !

Avant de continuer, vérifie que tu as :
  1. créé la base de données et l'utilisateur MySQL ;
  2. installé Nginx sur cette VM (sudo apt install -y nginx).

L'assistant va te demander :
  - le nom de ce serveur (ex : WEB-01) ;
  - le port du site web (80 par défaut) ;
  - l'adresse IP, l'utilisateur et le mot de passe MySQL.

Navigation : Tab / flèches pour se déplacer, Entrée pour valider,
Échap pour quitter l'assistant."
fi

[[ "${ID:-}" == "ubuntu" ]] || ui_msg "Attention : système détecté « ${PRETTY_NAME:-inconnu} ». Cet assistant est prévu pour Ubuntu 24.04."

if ! command -v nginx >/dev/null 2>&1; then
  ui_yesno "Nginx n'est pas installé (c'est un prérequis).

Veux-tu que l'assistant l'installe maintenant ?" || die "Installe Nginx (sudo apt install -y nginx) puis relance l'assistant."
  ui_info "Installation de Nginx… (veuillez patienter)"
  run "Installation de Nginx" env DEBIAN_FRONTEND=noninteractive apt-get install -y nginx
fi

ui_info "Préparation : installation des outils nécessaires (curl, rsync, client MySQL)…
Cela peut prendre une minute."
run "Mise à jour de la liste des paquets" apt-get update
run "Installation des outils" env DEBIAN_FRONTEND=noninteractive apt-get install -y ca-certificates curl rsync mysql-client

# =============================================================================
#  ÉTAPE 2 – Questions
# =============================================================================
KEEP_CONFIG=0
INSTANCE_NAME="" WEB_PORT="" DB_HOST="" DB_PORT="" DB_NAME="" DB_USER="" DB_PASSWORD=""
OLD_WEB_PORT="$(current_web_port)"
if [[ -f "$ENV_FILE" ]]; then
  if ui_yesno "Une configuration existe déjà sur cette VM :

  Nom du serveur : $(env_get INSTANCE_NAME)
  Port du site   : ${OLD_WEB_PORT:-80}
  Base MySQL     : $(env_get DB_USER)@$(env_get DB_HOST):$(env_get DB_PORT)/$(env_get DB_NAME)

La garder ? (Non = la modifier)"; then
    KEEP_CONFIG=1
  fi
fi

if [[ $KEEP_CONFIG -eq 1 ]]; then
  INSTANCE_NAME="$(env_get INSTANCE_NAME)"; WEB_PORT="${OLD_WEB_PORT:-80}"
  DB_HOST="$(env_get DB_HOST)"; DB_PORT="$(env_get DB_PORT)"
  DB_NAME="$(env_get DB_NAME)"; DB_USER="$(env_get DB_USER)"; DB_PASSWORD="$(env_get DB_PASSWORD)"
else
  d_name="${GQ_INSTANCE_NAME:-$(env_get INSTANCE_NAME)}"
  d_name="${d_name:-$(hostname -s | tr '[:lower:]' '[:upper:]')}"
  ask INSTANCE_NAME "Nom de ce serveur" "Étape 1/6 - Nom de ce serveur

Ce nom s'affiche en bas du site et permet de savoir quel serveur répond.
Exemple : WEB-01. (Si tu ajoutes plus tard un 2e serveur web, donne-lui
un autre nom, ex : WEB-02.)" \
    "$d_name" '^[A-Za-z0-9._-]{1,40}$' "Uniquement lettres, chiffres, point, tiret ou underscore (40 caractères max)."

  d_web="${GQ_WEB_PORT:-${OLD_WEB_PORT:-80}}"
  while true; do
    ask WEB_PORT "Port du site web" "Étape 2/6 - Port du site web

Port sur lequel le site sera accessible (http://<IP>:<port>/).
Laisse 80 (port web standard) sauf si ce port est déjà utilisé.
Avec un autre port (ex : 8080), pense à l'ouvrir dans le NSG / pare-feu." \
      "$d_web" '^[0-9]{1,5}$' "Le port doit être un nombre (ex : 80 ou 8080)."
    WEB_PORT=$((10#$WEB_PORT))
    web_port_check "$WEB_PORT" && break
    [[ $ASSUME_YES -eq 1 ]] && die "$PORT_ERROR"
    if [[ $UI == wizard ]]; then ui_msg "$PORT_ERROR"; else echo "  ${C_YELLOW}⚠ $PORT_ERROR${C_RESET}"; fi
    d_web="$WEB_PORT"
  done
fi

while true; do
  if [[ $KEEP_CONFIG -eq 0 ]]; then
    # Valeurs proposées : saisie précédente (si on corrige), sinon variables GQ_*, sinon config existante
    d_host="${DB_HOST:-${GQ_DB_HOST:-$(env_get DB_HOST)}}"; d_port="${DB_PORT:-${GQ_DB_PORT:-$(env_get DB_PORT)}}"
    d_db="${DB_NAME:-${GQ_DB_NAME:-$(env_get DB_NAME)}}"; d_user="${DB_USER:-${GQ_DB_USER:-$(env_get DB_USER)}}"
    d_pass="${DB_PASSWORD:-${GQ_DB_PASSWORD:-$(env_get DB_PASSWORD)}}"
    [[ "$d_pass" == "change-me" ]] && d_pass=""
    ask DB_HOST "Adresse IP du serveur MySQL" "Étape 3/6 - Serveur de base de données

Adresse IP privée de la VM base de données (MySQL).
Exemple : 10.0.2.4" \
      "$d_host" '^[A-Za-z0-9.:-]+$' "Adresse invalide (exemple : 10.0.2.4)."
    ask DB_PORT "Port MySQL" "Étape 4/6 - Port MySQL

Laisse 3306 sauf si ton serveur MySQL utilise un autre port." \
      "${d_port:-3306}" '^[0-9]{1,5}$' "Le port doit être un nombre (ex : 3306)."
    ask DB_NAME "Nom de la base" "Étape 5/6 - Base de données

Nom de la base créée en prérequis (CREATE DATABASE ...)." \
      "${d_db:-gaming_quiz}" '^[A-Za-z0-9_]{1,64}$' "Lettres, chiffres et underscore uniquement."
    ask DB_USER "Utilisateur MySQL" "Étape 6/6 - Utilisateur MySQL

Nom de l'utilisateur créé en prérequis (CREATE USER ...)." \
      "${d_user:-quiz_app}" '^[A-Za-z0-9_.-]{1,32}$' "Lettres, chiffres, point, tiret et underscore uniquement."
    ask DB_PASSWORD "Mot de passe MySQL" "Étape 6/6 - Mot de passe MySQL

Mot de passe de l'utilisateur « $DB_USER ».
(Rien ne s'affiche quand tu tapes : c'est normal.)" \
      "$d_pass" '^[A-Za-z0-9._@%+:,!?*=-]{1,128}$' \
      "Caractères autorisés : lettres, chiffres et . _ @ % + : , ! ? * = -   (pas d'espace, de guillemet, de # ni de \$)" secret
  fi

  ui_info "Test de la connexion à MySQL ($DB_USER@$DB_HOST:$DB_PORT/$DB_NAME)…"
  if db_check; then
    [[ $UI == text ]] && echo "  ${C_GREEN}✔${C_RESET} Connexion à MySQL réussie, droits suffisants"
    break
  fi
  log "Test MySQL échoué"
  [[ $ASSUME_YES -eq 1 ]] && die "$DB_ERROR"
  if [[ $UI == wizard ]]; then
    whiptail --title "$TITLE - problème de connexion" --yes-button "Corriger" --no-button "Quitter" \
      --yesno "$DB_ERROR

Corriger les informations de connexion ?" 20 76 || cancelled
  else
    echo "  ${C_RED}✖${C_RESET} $(head -n1 <<<"$DB_ERROR")"; sed -n '2,$p' <<<"$DB_ERROR" | sed 's/^/    /'
    ui_yesno "Corriger les informations de connexion ?" || cancelled
  fi
  KEEP_CONFIG=0
done

web_port_check "$WEB_PORT" || die "$PORT_ERROR
(Relance l'assistant et réponds Non à « La garder ? » pour choisir un autre port.)"

ui_yesno "Connexion à MySQL réussie !

Récapitulatif :
  Nom du serveur : $INSTANCE_NAME
  Port du site   : $WEB_PORT
  Base MySQL     : $DB_USER@$DB_HOST:$DB_PORT/$DB_NAME
  Application    : $APP_DIR

L'installation dure environ 3 à 5 minutes. Lancer l'installation ?" || cancelled

# =============================================================================
#  ÉTAPE 3 – Installation (barre de progression)
# =============================================================================
progress_start

progress 5 "Installation de Node.js…"
current_node="$(node -v 2>/dev/null | sed 's/^v//' || true)"
if [[ -n "$current_node" ]] && version_ge "$current_node" "$NODE_MIN"; then
  log "Node.js $current_node déjà installé"
else
  run "Ajout du dépôt Node.js $NODE_MAJOR" bash -c \
    "curl -fsSL --connect-timeout 20 --max-time 120 https://deb.nodesource.com/setup_${NODE_MAJOR}.x -o /tmp/nodesource_setup.sh && bash /tmp/nodesource_setup.sh"
  progress 12 "Installation de Node.js…"
  run "Installation de Node.js" env DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs
fi
NODE_BIN="$(command -v node)"

progress 20 "Téléchargement des dépendances (npm ci)… (2 à 3 minutes)"
run "Installation des dépendances" bash -c "cd '$APP_DIR' && npm ci --no-audit --no-fund"

progress 55 "Compilation de l'application…"
run "Compilation du backend et du frontend" bash -c "cd '$APP_DIR' && npm run build"

progress 75 "Écriture de la configuration…"
id "$SERVICE_USER" >/dev/null 2>&1 \
  || run "Création de l'utilisateur système $SERVICE_USER" useradd --system --no-create-home --shell /usr/sbin/nologin "$SERVICE_USER"
runuser -u "$SERVICE_USER" -- test -r "$APP_DIR/backend/dist/server.js" \
  || die "L'utilisateur $SERVICE_USER ne peut pas lire $APP_DIR. Installe le projet dans /opt/gaming-quiz-battle."
mkdir -p "$ENV_DIR"
NEW_ENV="$(mktemp)"; chmod 600 "$NEW_ENV"
if [[ -f "$ENV_FILE" ]]; then cat "$ENV_FILE" >"$NEW_ENV"; else cat "$APP_DIR/.env.example" >"$NEW_ENV"; fi
env_set NODE_ENV production "$NEW_ENV"
env_set HOST 127.0.0.1 "$NEW_ENV"
env_set PORT "$API_PORT" "$NEW_ENV"
env_set INSTANCE_NAME "$INSTANCE_NAME" "$NEW_ENV"
env_set DB_HOST "$DB_HOST" "$NEW_ENV"
env_set DB_PORT "$DB_PORT" "$NEW_ENV"
env_set DB_NAME "$DB_NAME" "$NEW_ENV"
env_set DB_USER "$DB_USER" "$NEW_ENV"
env_set DB_PASSWORD "$DB_PASSWORD" "$NEW_ENV"
install -o root -g "$SERVICE_USER" -m 640 "$NEW_ENV" "$ENV_FILE"
rm -f "$NEW_ENV"

progress 80 "Création du service systemd « $SERVICE »…"
sed -e "s#/opt/gaming-quiz-battle#$APP_DIR#g" -e "s#/usr/bin/node#$NODE_BIN#g" \
  "$APP_DIR/deployment/systemd/gaming-quiz.service" >/etc/systemd/system/$SERVICE.service
run "Rechargement de systemd" systemctl daemon-reload
run "Activation au démarrage" systemctl enable "$SERVICE"
run "(Re)démarrage de l'API" systemctl restart "$SERVICE"

progress 88 "Configuration de Nginx…"
mkdir -p "$WEB_ROOT"
run "Copie du site" rsync -a --delete "$APP_DIR/frontend/dist/" "$WEB_ROOT/"
sed -E -e "s#^([[:space:]]*listen[[:space:]]+(\[::\]:)?)80([[:space:];])#\1$WEB_PORT\3#" \
  -e "s#127\.0\.0\.1:3000#127.0.0.1:$API_PORT#g" \
  "$APP_DIR/deployment/nginx/gaming-quiz.conf" >"$NGINX_SITE"
ln -sf "$NGINX_SITE" /etc/nginx/sites-enabled/gaming-quiz
# Le site par défaut de Nginx occupe le port 80 : on ne le retire que si on prend ce port.
[[ "$WEB_PORT" == 80 ]] && rm -f /etc/nginx/sites-enabled/default
run "Vérification de la configuration Nginx" nginx -t
run "Activation de Nginx" systemctl enable nginx
run "Rechargement de Nginx" bash -c "systemctl reload nginx 2>/dev/null || systemctl restart nginx"
# Pare-feu local (ufw) : s'il est actif, on ouvre le port du site.
if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q "^Status: active"; then
  run "Ouverture du port $WEB_PORT dans le pare-feu (ufw)" ufw allow "$WEB_PORT/tcp" comment "gaming-quiz"
fi

progress 95 "Démarrage de l'application (création des tables et des questions au 1er démarrage)…"
READY=0
for _ in $(seq 1 60); do
  if [[ "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:$WEB_PORT/ready || true)" == "200" ]]; then READY=1; break; fi
  sleep 1
done
if [[ $READY -ne 1 ]]; then
  journalctl -u "$SERVICE" -n 20 --no-pager >>"$LOG_FILE" 2>&1 || true
  die "L'application ne répond pas correctement.
Regarde les logs : journalctl -u $SERVICE -f"
fi
progress 100 "Terminé !"
sleep 1
progress_end
trap - ERR

# =============================================================================
#  ÉTAPE 4 – Résultat
# =============================================================================
IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
URL_PORT=""; [[ "$WEB_PORT" == 80 ]] || URL_PORT=":$WEB_PORT"
SUMMARY="Installation terminée !

Site web       : http://${IP:-<IP-de-la-VM>}$URL_PORT/
Nom du serveur : $INSTANCE_NAME (affiché en bas de la page)

Commandes utiles :
  systemctl status $SERVICE        état de l'application
  journalctl -u $SERVICE -f        logs en direct (Ctrl+C pour quitter)
  sudo systemctl restart $SERVICE  redémarrer l'application

Mettre à jour / modifier la configuration : sudo $APP_DIR/setup.sh
Désinstaller l'application               : sudo $APP_DIR/uninstall.sh"
if [[ $UI == wizard ]]; then
  whiptail --title "$TITLE" --msgbox "$SUMMARY" 19 78 || true
  clear
fi
echo
echo "${C_GREEN}${C_BOLD}✔ $(head -n1 <<<"$SUMMARY")${C_RESET}"
tail -n +2 <<<"$SUMMARY" | sed 's/^/  /'
echo
