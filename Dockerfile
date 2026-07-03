# Single image for both processes — the deploy target picks the command:
#   web:    node dist/src/web.js   (default CMD)
#   worker: node dist/src/worker.js
# Migrations: node dist/scripts/migrate.js (run as a one-off job on deploy).

# --- Dashboard SPA ---
FROM node:22-alpine AS gui-build
WORKDIR /gui
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# --- Backend (TypeScript -> dist/) ---
FROM node:22-alpine AS backend-build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ src/
COPY scripts/ scripts/
RUN npm run build

# --- Runtime ---
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=backend-build /app/dist dist/
# src/webhook/app.ts serves the SPA from <cwd>/web/dist
COPY --from=gui-build /gui/dist web/dist/
# migrate.js resolves ../migrations relative to its own location (dist/scripts/)
COPY migrations/ dist/migrations/
USER node
EXPOSE 3000
CMD ["node", "dist/src/web.js"]
