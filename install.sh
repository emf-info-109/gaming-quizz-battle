#!/usr/bin/env bash
# =============================================================================
#  Gaming Quiz Battle – téléchargement + lancement de l'assistant d'installation
#
#  Une seule commande sur la VM web (Ubuntu 24.04) :
#
#    curl -fsSL https://raw.githubusercontent.com/emf-info-109/gaming-quizz-battle/main/install.sh | sudo bash
#
#  Ce script :
#    1. installe git si nécessaire,
#    2. télécharge (ou met à jour) l'application dans /opt/gaming-quiz-battle,
#    3. lance l'assistant d'installation (setup.sh).
#
#  Relancer la même commande = mettre l'application à jour.
#
#  Variables optionnelles :
#    GQ_REPO_URL  adresse du dépôt Git (défaut : dépôt du module)
#    GQ_BRANCH    branche à installer (défaut : main)
#    GQ_APP_DIR   dossier d'installation (défaut : /opt/gaming-quiz-battle)
#  Les options (--yes, --text…) sont transmises à setup.sh :
#    curl -fsSL …/install.sh | sudo bash -s -- --text
# =============================================================================
set -Eeuo pipefail

REPO_URL="${GQ_REPO_URL:-https://github.com/emf-info-109/gaming-quizz-battle.git}"
BRANCH="${GQ_BRANCH:-main}"
APP_DIR="${GQ_APP_DIR:-/opt/gaming-quiz-battle}"

if [[ $EUID -ne 0 ]]; then
  echo "Cette commande doit être lancée avec sudo :"
  echo "  curl -fsSL <adresse>/install.sh | sudo bash"
  exit 1
fi

echo "⚡ Gaming Quiz Battle – téléchargement"

if ! command -v git >/dev/null 2>&1; then
  echo "  · Installation de git…"
  apt-get update -qq >/dev/null
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq git >/dev/null
fi

if [[ -d "$APP_DIR/.git" ]]; then
  echo "  · Mise à jour de l'application dans $APP_DIR…"
  git -C "$APP_DIR" fetch --quiet origin "$BRANCH"
  if ! git -C "$APP_DIR" merge --ff-only --quiet "origin/$BRANCH"; then
    echo "✖ Des fichiers de $APP_DIR ont été modifiés à la main : mise à jour impossible."
    echo "  Pour voir les modifications : git -C $APP_DIR status"
    exit 1
  fi
elif [[ -e "$APP_DIR" && -n "$(ls -A "$APP_DIR" 2>/dev/null)" ]]; then
  echo "✖ $APP_DIR existe déjà mais n'est pas un dépôt Git. Renomme-le ou supprime-le, puis relance."
  exit 1
else
  echo "  · Téléchargement de l'application dans $APP_DIR…"
  if ! git clone --quiet --branch "$BRANCH" "$REPO_URL" "$APP_DIR"; then
    echo "✖ Téléchargement impossible depuis $REPO_URL"
    echo "  Vérifie la connexion Internet de la VM et l'adresse du dépôt."
    exit 1
  fi
fi
echo "  ✔ Application prête ($(git -C "$APP_DIR" log -1 --format='%h – %s'))"

# Lancement de l'assistant (le clavier est reconnecté par setup.sh si besoin)
exec bash "$APP_DIR/setup.sh" "$@"
