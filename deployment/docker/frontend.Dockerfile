# =============================================================================
#  Image du frontend : build React servi par Nginx, qui relaie /api vers le backend
#  Construire depuis la RACINE du dépôt :
#    docker build -f deployment/docker/frontend.Dockerfile -t gaming-quiz-frontend .
# =============================================================================

# --- Étape 1 : build Vite ----------------------------------------------------
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci --workspace frontend --include-workspace-root
COPY frontend frontend
RUN npm run build --workspace frontend

# --- Étape 2 : Nginx ---------------------------------------------------------
FROM nginx:stable-alpine
COPY deployment/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO /dev/null http://127.0.0.1/index.html || exit 1
