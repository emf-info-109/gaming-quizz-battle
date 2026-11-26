#!/usr/bin/env bash
# =============================================================================
#  Gaming Quiz Battle – désinstallation (Ubuntu Server 24.04)
#
#  Utilisation (dans un terminal) :
#     sudo /opt/gaming-quiz-battle/uninstall.sh
#
#  Retire ce que l'assistant setup.sh a installé sur CETTE VM :
#    - le service systemd « gaming-quiz » (arrêt + suppression),
#    - le site Nginx « gaming-quiz » et les fichiers du site (/var/www/gaming-quiz),
#    - la configuration (/etc/gaming-quiz, contient le mot de passe MySQL),
#    - l'utilisateur système « gamingquiz »,
#    - la règle de pare-feu ufw éventuellement ajoutée,
#    - (au choix) le dossier de l'application, le journal d'installation,
#      Node.js et Nginx.
#
#  La base de données MySQL n'est PAS touchée (elle est sur une autre VM et
#  peut être partagée par plusieurs serveurs web).
#
#  Options :
#    --yes   sans question : retire l'application, garde Node.js et Nginx
#    --all   avec --yes : retire aussi Node.js et Nginx
#    --text  questions en mode texte (sans fenêtres)
# =============================================================================
set -Euo pipefail

# Tout le script est dans main() : bash le lit en entier avant de l'exécuter,
# ce qui permet de supprimer le dossier de l'application (qui contient ce fichier).
main() {
  APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  ENV_DIR=/etc/gaming-quiz
  WEB_ROOT=/var/www/gaming-quiz
  SERVICE=gaming-quiz
  SERVICE_USER=gamingquiz
  NGINX_SITE=/etc/nginx/sites-available/gaming-quiz
  SETUP_LOG=/var/log/gaming-quiz-setup.log
  LOG_FILE=/var/log/gaming-quiz-uninstall.log
  TITLE="Gaming Quiz Battle - désinstallation"

  ASSUME_YES=0; FORCE_TEXT=0; PURGE_ALL=0
  for arg in "$@"; do
    case "$arg" in
      -y|--yes) ASSUME_YES=1 ;;
      --all) PURGE_ALL=1 ;;
      --text) FORCE_TEXT=1 ;;
      -h|--help) sed -n '2,24p' "${BASH_SOURCE[0]}"; exit 0 ;;
      *) echo "Option inconnue : $arg (voir --help)"; exit 2 ;;
    esac
  done

  [[ $EUID -eq 0 ]] || { echo "Ce script doit être lancé avec sudo :  sudo $APP_DIR/uninstall.sh"; exit 1; }
  if [[ $ASSUME_YES -eq 0 && ! -t 0 ]]; then
    echo "La désinstallation demande une confirmation : lance-la dans un terminal, sans « | » :"
    echo "  sudo $APP_DIR/uninstall.sh      (ou avec --yes pour ne rien demander)"
    exit 1
  fi

  UI=text
  if [[ $ASSUME_YES -eq 0 && $FORCE_TEXT -eq 0 && -t 1 ]] && command -v whiptail >/dev/null 2>&1; then
    UI=wizard
  fi
  if [[ -t 1 ]]; then
    C_RESET=$'\e[0m'; C_BOLD=$'\e[1m'; C_DIM=$'\e[2m'; C_RED=$'\e[31m'; C_GREEN=$'\e[32m'; C_YELLOW=$'\e[33m'
  else
    C_RESET=''; C_BOLD=''; C_DIM=''; C_RED=''; C_GREEN=''; C_YELLOW=''
  fi

  export DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a NEEDRESTART_SUSPEND=1
  : >>"$LOG_FILE"
  echo "===== Désinstallation lancée le $(date '+%F %T')" >>"$LOG_FILE"

  # Le dossier ressemble-t-il bien à l'application ? (sécurité avant rm -rf)
  APP_DIR_OK=0
  if [[ -f "$APP_DIR/setup.sh" && -f "$APP_DIR/backend/package.json" && "$APP_DIR" != "/" ]]; then
    APP_DIR_OK=1
  fi

  WEB_PORT="$(grep -oE '^[[:space:]]*listen[[:space:]]+[0-9]+' "$NGINX_SITE" 2>/dev/null | grep -oE '[0-9]+' | head -n1 || true)"

  # --------------------------------------------------------------------------
  #  Confirmation et choix
  # --------------------------------------------------------------------------
  RM_APP=1; RM_LOGS=1; RM_NODE=0; RM_NGINX=0
  [[ $APP_DIR_OK -eq 1 ]] || RM_APP=0
  if [[ $ASSUME_YES -eq 1 ]]; then
    [[ $PURGE_ALL -eq 1 ]] && { RM_NODE=1; RM_NGINX=1; }
  else
    local intro="Cet assistant va retirer Gaming Quiz Battle de cette VM :

  - service systemd « $SERVICE » (arrêt et suppression)
  - site Nginx « gaming-quiz »${WEB_PORT:+ (port $WEB_PORT)} et $WEB_ROOT
  - configuration $ENV_DIR (mot de passe MySQL)
  - utilisateur système « $SERVICE_USER »

La base de données MySQL n'est PAS supprimée (elle est sur l'autre VM).

Continuer ?"
    if [[ $UI == wizard ]]; then
      whiptail --title "$TITLE" --yes-button "Continuer" --no-button "Annuler" --defaultno \
        --yesno "$intro" 20 76 || { clear; echo "Désinstallation annulée."; exit 1; }
      local items=() choice
      [[ $APP_DIR_OK -eq 1 ]] && items+=(app "Dossier de l'application ($APP_DIR)" ON)
      items+=(logs "Journaux d'installation (/var/log/gaming-quiz-*.log)" ON)
      items+=(node "Node.js (si rien d'autre ne l'utilise sur cette VM)" OFF)
      items+=(nginx "Nginx (si rien d'autre ne l'utilise sur cette VM)" OFF)
      choice=$(whiptail --title "$TITLE" --ok-button "Désinstaller" --cancel-button "Annuler" \
        --checklist "Que faut-il retirer en plus ? (Espace = cocher/décocher, Entrée = valider)" \
        14 76 4 "${items[@]}" 3>&1 1>&2 2>&3) || { clear; echo "Désinstallation annulée."; exit 1; }
      RM_APP=0; RM_LOGS=0
      [[ $choice == *'"app"'* ]] && RM_APP=1
      [[ $choice == *'"logs"'* ]] && RM_LOGS=1
      [[ $choice == *'"node"'* ]] && RM_NODE=1
      [[ $choice == *'"nginx"'* ]] && RM_NGINX=1
      clear
    else
      echo "${C_BOLD}  Gaming Quiz Battle – désinstallation${C_RESET}"
      echo "$intro" | sed 's/^/  /'
      ask_yn "Désinstaller" n || { echo "Désinstallation annulée."; exit 1; }
      if [[ $APP_DIR_OK -eq 1 ]]; then ask_yn "Supprimer aussi le dossier $APP_DIR" o || RM_APP=0; fi
      ask_yn "Supprimer les journaux d'installation" o || RM_LOGS=0
      ask_yn "Désinstaller Node.js (si rien d'autre ne l'utilise)" n && RM_NODE=1
      ask_yn "Désinstaller Nginx (si rien d'autre ne l'utilise)" n && RM_NGINX=1
    fi
  fi

  echo
  # --------------------------------------------------------------------------
  #  Désinstallation (chaque étape continue même si la précédente échoue)
  # --------------------------------------------------------------------------
  FAILED=0

  if [[ -f /etc/systemd/system/$SERVICE.service ]]; then
    step "Arrêt du service $SERVICE" systemctl disable --now "$SERVICE"
  fi
  step "Suppression du service systemd" rm -f "/etc/systemd/system/$SERVICE.service"
  step "Rechargement de systemd" bash -c "systemctl daemon-reload && systemctl reset-failed '$SERVICE' 2>/dev/null || true"

  step "Suppression du site Nginx" rm -f /etc/nginx/sites-enabled/gaming-quiz "$NGINX_SITE"
  # Si plus aucun site n'est actif, on remet la page par défaut de Nginx (comme avant l'installation).
  if [[ $RM_NGINX -eq 0 && -d /etc/nginx/sites-enabled && -f /etc/nginx/sites-available/default ]] \
     && [[ -z "$(ls -A /etc/nginx/sites-enabled 2>/dev/null)" ]]; then
    step "Réactivation du site Nginx par défaut" ln -s /etc/nginx/sites-available/default /etc/nginx/sites-enabled/default
  fi
  if [[ $RM_NGINX -eq 0 ]] && command -v nginx >/dev/null 2>&1 && systemctl is-active --quiet nginx; then
    step "Rechargement de Nginx" bash -c "nginx -t && systemctl reload nginx"
  fi
  step "Suppression des fichiers du site ($WEB_ROOT)" rm -rf "$WEB_ROOT"

  if [[ -n "$WEB_PORT" ]] && command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -qE "^$WEB_PORT/tcp .*gaming-quiz"; then
    step "Fermeture du port $WEB_PORT dans le pare-feu (ufw)" ufw delete allow "$WEB_PORT/tcp"
  fi

  step "Suppression de la configuration ($ENV_DIR)" rm -rf "$ENV_DIR"
  if id "$SERVICE_USER" >/dev/null 2>&1; then
    step "Suppression de l'utilisateur système $SERVICE_USER" userdel "$SERVICE_USER"
  fi
  getent group "$SERVICE_USER" >/dev/null 2>&1 && step "Suppression du groupe $SERVICE_USER" groupdel "$SERVICE_USER"

  if [[ $RM_NODE -eq 1 ]]; then
    step "Désinstallation de Node.js" apt-get -o DPkg::Lock::Timeout=900 purge -y nodejs
    step "Suppression du dépôt NodeSource" bash -c \
      "rm -f /etc/apt/sources.list.d/nodesource.* /usr/share/keyrings/nodesource.gpg /etc/apt/preferences.d/nodejs /etc/apt/preferences.d/nsolid /tmp/nodesource_setup.sh"
  fi
  if [[ $RM_NGINX -eq 1 ]]; then
    step "Désinstallation de Nginx" apt-get -o DPkg::Lock::Timeout=900 purge -y nginx nginx-common
  fi
  if [[ $RM_NODE -eq 1 || $RM_NGINX -eq 1 ]]; then
    step "Nettoyage des paquets devenus inutiles" apt-get -o DPkg::Lock::Timeout=900 autoremove -y
  fi

  if [[ $RM_APP -eq 1 ]]; then
    cd /
    step "Suppression du dossier de l'application ($APP_DIR)" rm -rf "$APP_DIR"
  fi
  if [[ $RM_LOGS -eq 1 ]]; then
    rm -f "$SETUP_LOG" "$LOG_FILE"
    LOG_FILE=/dev/null
  fi

  # --------------------------------------------------------------------------
  #  Résultat
  # --------------------------------------------------------------------------
  echo
  if [[ $FAILED -eq 0 ]]; then
    echo "${C_GREEN}${C_BOLD}✔ Gaming Quiz Battle a été désinstallé de cette VM.${C_RESET}"
  else
    echo "${C_YELLOW}${C_BOLD}⚠ Désinstallation terminée avec $FAILED erreur(s).${C_RESET}"
    [[ "$LOG_FILE" != /dev/null ]] && echo "  Détails : $LOG_FILE"
  fi
  [[ $RM_APP -eq 0 && $APP_DIR_OK -eq 1 ]] && echo "  Dossier de l'application conservé : $APP_DIR"
  cat <<EOF

  ${C_DIM}La base de données MySQL n'a pas été modifiée. Pour la supprimer aussi
  (uniquement si aucun autre serveur web ne l'utilise), sur la VM base de données :
    sudo mysql -e "DROP DATABASE gaming_quiz; DROP USER 'quiz_app'@'<réseau>';"
  (adapter les noms à ceux choisis lors des prérequis)${C_RESET}

EOF
  [[ $FAILED -eq 0 ]]
}

# Exécute une étape : sortie dans le journal, « ok » / « échec » à l'écran, sans arrêter le script.
step() {
  local msg="$1"; shift
  printf "  %s… " "$msg"
  echo "== $(date +%T) $msg : $*" >>"$LOG_FILE"
  if "$@" </dev/null >>"$LOG_FILE" 2>&1; then
    echo "${C_GREEN}ok${C_RESET}"
  else
    echo "${C_RED}échec${C_RESET}"
    FAILED=$((FAILED + 1))
  fi
  return 0
}

ask_yn() { # ask_yn "Question" o|n  (réponse par défaut)
  local answer hint="[o/N]"
  [[ $2 == o ]] && hint="[O/n]"
  read -r -p "  ${C_BOLD}?${C_RESET} $1 $hint : " answer
  answer="${answer:-$2}"
  [[ "$answer" =~ ^[OoYy] ]]
}

main "$@"
exit $?
