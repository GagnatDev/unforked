# -----------------------------------------------------------------------------
# Stage 1: Build frontend + backend (single Node toolchain, pnpm workspaces)
# -----------------------------------------------------------------------------
FROM node:24-alpine AS build
WORKDIR /app

RUN corepack enable

# Install workspace deps from the single root lockfile.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY frontend/package.json frontend/
COPY backend/package.json backend/
RUN pnpm install --frozen-lockfile

# Build both workspaces: frontend → frontend/dist, backend → backend/dist
# (a single bundled server.js + copied SQL migrations).
COPY . .
RUN pnpm --filter meal-planning-frontend run build \
 && pnpm --filter @unforked/backend run build

# -----------------------------------------------------------------------------
# Stage 2: Runtime (Node 24, no node_modules — everything is bundled)
# -----------------------------------------------------------------------------
FROM node:24-alpine
WORKDIR /app

RUN adduser -D -g "" appuser
USER appuser

# Bundled server + plain-SQL migrations (dist/migrations) + built SPA (web/).
COPY --from=build /app/backend/dist ./dist
COPY --from=build /app/frontend/dist ./web

EXPOSE 8080
ENV PORT=8080 NODE_ENV=production
ENTRYPOINT ["node", "dist/server.js"]
