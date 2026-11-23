# =============================================================================
#  Image du backend (API Express)
#  Construire depuis la RACINE du dépôt :
#    docker build -f deployment/docker/backend.Dockerfile -t gaming-quiz-backend .
# =============================================================================

# --- Étape 1 : compilation TypeScript -> JavaScript ---------------------------
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci --workspace backend --include-workspace-root
COPY backend backend
RUN npm run build --workspace backend

# --- Étape 2 : image finale, uniquement le nécessaire à l'exécution ----------
FROM node:24-alpine
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci --workspace backend --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build /app/backend/dist backend/dist
# Migrations et seeds SQL (utilisés par "node dist/cli/db.js setup")
COPY database database

# Le processus ne tourne pas en root
USER node
WORKDIR /app/backend
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server.js"]
