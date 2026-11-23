#!/usr/bin/env bash
# =============================================================================
#  Gaming Quiz Battle – installation guidée sur Ubuntu Server 24.04
#
#  Utilisation (depuis le dossier du projet) :
#     sudo ./setup.sh
#
#  Le script pose quelques questions (nom du serveur, connexion à MySQL), puis :
#    - installe Node.js si nécessaire,
#    - compile l'application,
#    - vérifie la connexion à la base de données,
#    - crée le service systemd "gaming-quiz" et configure Nginx,
#    - démarre l'application (qui crée les tables et les questions au 1er démarrage).
#
#  Relancer le script = mettre à jour l'application (la configuration est conservée).
#
#  Mode automatique (sans questions) :
#     sudo GQ_INSTANCE_NAME=WEB-01 GQ_DB_HOST=10.0.2.4 GQ_DB_PASSWORD=xxx ./setup.sh --yes
# =============================================================================
set -Eeuo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_DIR=/etc/gaming-quiz
ENV_FILE="$ENV_DIR/gaming-quiz.env"
WEB_ROOT=/var/www/gaming-quiz
SERVICE=gaming-quiz
SERVICE_USER=gamingquiz
LOG_FILE=/var/log/gaming-quiz-setup.log
NODE_MAJOR=24
NODE_MIN="22.22.0"
TOTAL_STEPS=8

ASSUME_YES=0
for arg in "$@"; do
  case "$arg" in
    -y|--yes) ASSUME_YES=1 ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "Option inconnue : $arg (voir --help)"; exit 2 ;;
  esac
done

# --- Affichage ---------------------------------------------------------------
if [[ -t 1 ]]; then
  C_RESET=$'\e[0m'; C_BOLD=$'\e[1m'; C_DIM=$'\e[2m'
  C_RED=$'\e[31m'; C_GREEN=$'\e[32m'; C_YELLOW=$'\e[33m'; C_CYAN=$'\e[36m'
else
  C_RESET=''; C_BOLD=''; C_DIM=''; C_RED=''; C_GREEN=''; C_YELLOW=''; C_CYAN=''
fi

STEP=0
step()  { STEP=$((STEP + 1)); echo; echo "${C_BOLD}${C_CYAN}[$STEP/$TOTAL_STEPS] $*${C_RESET}"; }
ok()    { echo "  ${C_GREEN}✔${C_RESET} $*"; }
info()  { echo "  ${C_DIM}·${C_RESET} $*"; }
warn()  { echo "  ${C_YELLOW}⚠ $*${C_RESET}"; }
die()   { echo; echo "${C_RED}${C_BOLD}✖ $*${C_RESET}" >&2; echo "  Journal complet : $LOG_FILE" >&2; exit 1; }

trap 'die "Erreur inattendue (ligne $LINENO). Consulte le journal."' ERR

# Exécute une commande en envoyant sa sortie dans le journal.
run() {
  local msg="$1"; shift
  printf "  %s… " "$msg"
  echo "===== $(date '+%F %T') : $msg" >>"$LOG_FILE"
  if "$@" </dev/null >>"$LOG_FILE" 2>&1; then
    echo "${C_GREEN}ok${C_RESET}"
  else
    echo "${C_RED}échec${C_RESET}"
    echo "  ── dernières lignes du journal ──"
    tail -n 20 "$LOG_FILE" | sed 's/^/  │ /'
    trap - ERR
    die "L'étape « $msg » a échoué."
  fi
}

# ask VARIABLE "Question" "défaut" "regex" "message si invalide" [secret]
ask() {
  local var="$1" question="$2" default="$3" regex="$4" errmsg="$5" secret="${6:-}"
  local answer
  if [[ $ASSUME_YES -eq 1 ]]; then
    answer="$default"
    [[ -n "$answer" && "$answer" =~ $regex ]] || die "Mode --yes : valeur manquante ou invalide pour « $question »."
    printf -v "$var" '%s' "$answer"
    return
  fi
  while true; do
    if [[ -n "$secret" ]]; then
      local hint=""
      [[ -n "$default" ]] && hint=" ${C_DIM}(Entrée = garder l'actuel)${C_RESET}"
      read -r -s -p "  ${C_BOLD}?${C_RESET} $question$hint : " answer; echo
    elif [[ -n "$default" ]]; then
      read -r -p "  ${C_BOLD}?${C_RESET} $question ${C_DIM}[$default]${C_RESET} : " answer
    else
      read -r -p "  ${C_BOLD}?${C_RESET} $question : " answer
    fi
    answer="${answer:-$default}"
    if [[ -n "$answer" && "$answer" =~ $regex ]]; then
      printf -v "$var" '%s' "$answer"
      return
    fi
    warn "$errmsg"
  done
}

confirm() {  # confirm "Question" (défaut : oui)
  [[ $ASSUME_YES -eq 1 ]] && return 0
  local answer
  read -r -p "  ${C_BOLD}?${C_RESET} $1 ${C_DIM}[O/n]${C_RESET} : " answer
  [[ -z "$answer" || "$answer" =~ ^[OoYy] ]]
}

# Lit une valeur dans le fichier de configuration existant.
env_get() { [[ -f "$ENV_FILE" ]] && grep -E "^$1=" "$ENV_FILE" | tail -n1 | cut -d= -f2- || true; }

# Écrit KEY=VALUE dans un fichier (remplace la ligne existante ou l'ajoute).
env_set() {
  local key="$1" value="$2" file="$3" tmp
  tmp="$(mktemp)"
  K="$key" V="$value" awk 'BEGIN { FS = "=" }
    $1 == ENVIRON["K"] { print ENVIRON["K"] "=" ENVIRON["V"]; found = 1; next }
    { print }
    END { if (!found) print ENVIRON["K"] "=" ENVIRON["V"] }' "$file" >"$tmp"
  cat "$tmp" >"$file"
  rm -f "$tmp"
}

version_ge() { [[ "$(printf '%s\n%s\n' "$2" "$1" | sort -V | head -n1)" == "$2" ]]; }

# =============================================================================
echo "${C_BOLD}${C_CYAN}"
echo "  ⚡ Gaming Quiz Battle – installation"
echo "${C_RESET}${C_DIM}  Dossier de l'application : $APP_DIR${C_RESET}"

[[ $EUID -eq 0 ]] || { echo "${C_RED}Ce script doit être lancé avec sudo :${C_RESET}  sudo ./setup.sh"; exit 1; }
: >>"$LOG_FILE"
echo "===== Installation lancée le $(date '+%F %T')" >>"$LOG_FILE"

# shellcheck disable=SC1091
. /etc/os-release
[[ "${ID:-}" == "ubuntu" ]] || warn "Système détecté : ${PRETTY_NAME:-inconnu}. Ce script est prévu pour Ubuntu 24.04."
[[ "$APP_DIR" != *" "* ]] || die "Le chemin du projet ne doit pas contenir d'espace : $APP_DIR"
[[ -f "$APP_DIR/backend/package.json" && -f "$APP_DIR/frontend/package.json" ]] \
  || die "Lance ce script depuis le dossier du projet gaming-quiz-battle."

# =============================================================================
step "Vérification des prérequis"
if command -v nginx >/dev/null 2>&1; then
  ok "Nginx est installé"
else
  warn "Nginx n'est pas installé (prérequis)."
  if confirm "L'installer maintenant ?"; then
    run "Installation de Nginx" env DEBIAN_FRONTEND=noninteractive apt-get install -y nginx
  else
    die "Installe Nginx (sudo apt install -y nginx) puis relance le script."
  fi
fi
run "Mise à jour de la liste des paquets" apt-get update
run "Installation des outils (curl, rsync…)" env DEBIAN_FRONTEND=noninteractive apt-get install -y ca-certificates curl rsync

# =============================================================================
step "Configuration"
KEEP_CONFIG=0
if [[ -f "$ENV_FILE" ]]; then
  info "Configuration existante trouvée : $ENV_FILE"
  info "  Serveur : $(env_get INSTANCE_NAME)   Base : $(env_get DB_USER)@$(env_get DB_HOST):$(env_get DB_PORT)/$(env_get DB_NAME)"
  if confirm "Garder cette configuration ?"; then KEEP_CONFIG=1; fi
fi

if [[ $KEEP_CONFIG -eq 1 ]]; then
  INSTANCE_NAME="$(env_get INSTANCE_NAME)"; DB_HOST="$(env_get DB_HOST)"; DB_PORT="$(env_get DB_PORT)"
  DB_NAME="$(env_get DB_NAME)"; DB_USER="$(env_get DB_USER)"; DB_PASSWORD="$(env_get DB_PASSWORD)"
  ok "Configuration conservée"
else
  default_name="${GQ_INSTANCE_NAME:-$(env_get INSTANCE_NAME)}"
  default_name="${default_name:-$(hostname -s | tr '[:lower:]' '[:upper:]')}"
  echo
  echo "  ${C_DIM}Nom affiché dans le pied de page du site (ex : WEB-01 sur la 1re VM, WEB-02 sur la 2e).${C_RESET}"
  ask INSTANCE_NAME "Nom de ce serveur" "$default_name" '^[A-Za-z0-9._-]{1,40}$' \
    "Uniquement lettres, chiffres, point, tiret ou underscore (40 caractères max)."

  while true; do
    echo
    echo "  ${C_DIM}Connexion à la base MySQL (créée en prérequis sur la VM base de données).${C_RESET}"
    ask DB_HOST "Adresse IP du serveur MySQL" "${GQ_DB_HOST:-$(env_get DB_HOST)}" '^[A-Za-z0-9.:-]+$' \
      "Adresse invalide (exemple : 10.0.2.4)."
    d_port="${GQ_DB_PORT:-$(env_get DB_PORT)}"; d_name="${GQ_DB_NAME:-$(env_get DB_NAME)}"; d_user="${GQ_DB_USER:-$(env_get DB_USER)}"
    ask DB_PORT "Port MySQL" "${d_port:-3306}" '^[0-9]{1,5}$' "Port invalide."
    ask DB_NAME "Nom de la base de données" "${d_name:-gaming_quiz}" '^[A-Za-z0-9_]{1,64}$' \
      "Lettres, chiffres et underscore uniquement."
    ask DB_USER "Utilisateur MySQL" "${d_user:-quiz_app}" '^[A-Za-z0-9_.-]{1,32}$' \
      "Lettres, chiffres, point, tiret et underscore uniquement."
    ask DB_PASSWORD "Mot de passe MySQL" "${GQ_DB_PASSWORD:-$(env_get DB_PASSWORD)}" '^[A-Za-z0-9._@%+:,!?*=-]{1,128}$' \
      "Caractères autorisés : lettres, chiffres et . _ @ % + : , ! ? * = -  (pas d'espace, de guillemet, de # ni de \$)" secret

    # Test rapide : le port MySQL répond-il ?
    if timeout 5 bash -c ">/dev/tcp/$DB_HOST/$DB_PORT" 2>/dev/null; then
      ok "Le serveur $DB_HOST:$DB_PORT répond"
      break
    fi
    warn "Impossible de joindre $DB_HOST sur le port $DB_PORT."
    warn "Vérifie l'adresse IP, que MySQL écoute sur le réseau (bind-address) et le pare-feu / NSG."
    [[ $ASSUME_YES -eq 1 ]] && die "Base de données injoignable."
    confirm "Ressaisir les informations de connexion ?" || die "Installation interrompue."
  done
fi

echo
echo "  ${C_BOLD}Récapitulatif${C_RESET}"
echo "    Serveur        : $INSTANCE_NAME"
echo "    Base MySQL     : $DB_USER@$DB_HOST:$DB_PORT/$DB_NAME"
echo "    Application    : $APP_DIR"
confirm "Lancer l'installation ?" || die "Installation annulée."

# =============================================================================
step "Node.js"
current_node="$(node -v 2>/dev/null | sed 's/^v//' || true)"
if [[ -n "$current_node" ]] && version_ge "$current_node" "$NODE_MIN"; then
  ok "Node.js $current_node déjà installé"
else
  [[ -n "$current_node" ]] && warn "Node.js $current_node est trop ancien (minimum $NODE_MIN)."
  run "Ajout du dépôt Node.js $NODE_MAJOR (NodeSource)" bash -c \
    "curl -fsSL https://deb.nodesource.com/setup_${NODE_MAJOR}.x -o /tmp/nodesource_setup.sh && bash /tmp/nodesource_setup.sh"
  run "Installation de Node.js" env DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs
  ok "Node.js $(node -v) installé"
fi
NODE_BIN="$(command -v node)"

# =============================================================================
step "Compilation de l'application"
info "Cette étape peut prendre quelques minutes…"
run "Installation des dépendances (npm ci)" bash -c "cd '$APP_DIR' && npm ci --no-audit --no-fund"
run "Compilation du backend et du frontend" bash -c "cd '$APP_DIR' && npm run build"

# =============================================================================
step "Vérification de la base de données"
if ! id "$SERVICE_USER" >/dev/null 2>&1; then
  run "Création de l'utilisateur système $SERVICE_USER" \
    useradd --system --no-create-home --shell /usr/sbin/nologin "$SERVICE_USER"
fi
runuser -u "$SERVICE_USER" -- test -r "$APP_DIR/backend/dist/server.js" \
  || die "L'utilisateur $SERVICE_USER ne peut pas lire $APP_DIR. Clone le projet dans /opt/gaming-quiz-battle."

# Fichier de configuration final (créé à partir de .env.example)
mkdir -p "$ENV_DIR"
NEW_ENV="$(mktemp)"
chmod 600 "$NEW_ENV"
if [[ $KEEP_CONFIG -eq 1 ]]; then
  cat "$ENV_FILE" >"$NEW_ENV"
else
  cat "$APP_DIR/.env.example" >"$NEW_ENV"
  env_set NODE_ENV production "$NEW_ENV"
  env_set HOST 127.0.0.1 "$NEW_ENV"
  env_set PORT 3000 "$NEW_ENV"
  env_set INSTANCE_NAME "$INSTANCE_NAME" "$NEW_ENV"
  env_set DB_HOST "$DB_HOST" "$NEW_ENV"
  env_set DB_PORT "$DB_PORT" "$NEW_ENV"
  env_set DB_NAME "$DB_NAME" "$NEW_ENV"
  env_set DB_USER "$DB_USER" "$NEW_ENV"
  env_set DB_PASSWORD "$DB_PASSWORD" "$NEW_ENV"
fi

printf "  Connexion à MySQL et vérification des droits… "
if CHECK_OUTPUT="$(cd "$APP_DIR/backend" && ENV_FILE=/nonexistent "$NODE_BIN" --env-file="$NEW_ENV" dist/cli/db.js check 2>&1)"; then
  echo "${C_GREEN}ok${C_RESET}"
else
  echo "${C_RED}échec${C_RESET}"
  echo "$CHECK_OUTPUT" | grep '✖' | sed 's/^/  /'
  echo "$CHECK_OUTPUT" >>"$LOG_FILE"
  rm -f "$NEW_ENV"
  trap - ERR
  die "La base de données n'est pas accessible. Corrige le problème puis relance : sudo ./setup.sh"
fi

install -o root -g "$SERVICE_USER" -m 640 "$NEW_ENV" "$ENV_FILE"
rm -f "$NEW_ENV"
ok "Configuration enregistrée dans $ENV_FILE"

# =============================================================================
step "Service systemd (API)"
sed -e "s#/opt/gaming-quiz-battle#$APP_DIR#g" -e "s#/usr/bin/node#$NODE_BIN#g" \
  "$APP_DIR/deployment/systemd/gaming-quiz.service" >/etc/systemd/system/$SERVICE.service
run "Rechargement de systemd" systemctl daemon-reload
run "Activation au démarrage de la VM" systemctl enable "$SERVICE"
run "(Re)démarrage de l'API" systemctl restart "$SERVICE"

# =============================================================================
step "Nginx (site web)"
mkdir -p "$WEB_ROOT"
run "Copie du site dans $WEB_ROOT" rsync -a --delete "$APP_DIR/frontend/dist/" "$WEB_ROOT/"
cp "$APP_DIR/deployment/nginx/gaming-quiz.conf" /etc/nginx/sites-available/gaming-quiz
ln -sf /etc/nginx/sites-available/gaming-quiz /etc/nginx/sites-enabled/gaming-quiz
rm -f /etc/nginx/sites-enabled/default
run "Vérification de la configuration Nginx" nginx -t
run "Activation de Nginx" systemctl enable nginx
run "Rechargement de Nginx" bash -c "systemctl reload nginx 2>/dev/null || systemctl restart nginx"

# =============================================================================
step "Démarrage et vérification"
info "Au premier démarrage, l'application crée les tables et les 140 questions."
printf "  Attente de l'application… "
READY=0
for _ in $(seq 1 60); do
  code="$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1/ready || true)"
  if [[ "$code" == "200" ]]; then READY=1; break; fi
  sleep 1
done
trap - ERR

if [[ $READY -ne 1 ]]; then
  echo "${C_RED}pas prête${C_RESET}"
  echo "  ── dernières lignes des logs de l'API ──"
  journalctl -u "$SERVICE" -n 15 --no-pager | sed 's/^/  │ /'
  die "L'application ne répond pas correctement. Regarde les logs : journalctl -u $SERVICE -f"
fi
echo "${C_GREEN}ok${C_RESET}"
ok "$(curl -s http://127.0.0.1/health)"

IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
echo
echo "${C_GREEN}${C_BOLD}  🎉 Installation terminée !${C_RESET}"
echo
echo "  Site web       : ${C_BOLD}http://${IP:-<IP-de-la-VM>}/${C_RESET}"
echo "  Nom du serveur : ${C_BOLD}$(env_get INSTANCE_NAME)${C_RESET} (affiché en bas de la page)"
echo
echo "  Commandes utiles :"
echo "    systemctl status $SERVICE        état de l'API"
echo "    journalctl -u $SERVICE -f        logs en direct (Ctrl+C pour quitter)"
echo "    sudo systemctl restart $SERVICE  redémarrer l'API"
echo "    sudo ./setup.sh                     mettre à jour / reconfigurer"
echo
