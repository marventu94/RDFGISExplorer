# Se buildea con contexto en la RAÍZ del repo (ver docker-compose.yml):
#   docker build -f products/rdf-explorer/frontend/Dockerfile .
FROM node:24.18.0-alpine AS builder
RUN corepack enable
WORKDIR /repo

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/contracts/ packages/contracts/
COPY packages/platform-bridge/ packages/platform-bridge/
COPY packages/explorer-backend/package.json packages/explorer-backend/
COPY products/shell/backend/package.json products/shell/backend/
COPY products/rdf-explorer/backend/package.json products/rdf-explorer/backend/
COPY products/gis-explorer/backend/package.json products/gis-explorer/backend/
COPY products/shell/frontend/package.json products/shell/frontend/
COPY products/rdf-explorer/frontend/package.json products/rdf-explorer/frontend/
COPY products/gis-explorer/frontend/package.json products/gis-explorer/frontend/
COPY products/gis-explorer/frontend/patches/ products/gis-explorer/frontend/patches/

RUN pnpm install --frozen-lockfile --filter "{./products/rdf-explorer/frontend}..."

COPY products/rdf-explorer/frontend/ products/rdf-explorer/frontend/
RUN pnpm --filter "{./packages/contracts}" run build \
 && pnpm --filter "{./products/rdf-explorer/frontend}" run build

FROM nginx:alpine
COPY --from=builder /repo/products/rdf-explorer/frontend/dist/app/browser /usr/share/nginx/html
COPY products/rdf-explorer/frontend/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
