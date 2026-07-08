# Se buildea con contexto en la RAÍZ del repo (ver docker-compose.yml):
#   docker build -f frontend/rdf_gis_explorer/Dockerfile .
FROM node:24.18.0-alpine AS builder
RUN corepack enable
WORKDIR /repo

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/contracts/ packages/contracts/
COPY backend/package.json backend/
COPY frontend/app_shell/package.json frontend/app_shell/
COPY frontend/rdf_explorer/package.json frontend/rdf_explorer/
COPY frontend/rdf_gis_explorer/package.json frontend/rdf_gis_explorer/
COPY frontend/rdf_gis_explorer/patches/ frontend/rdf_gis_explorer/patches/

RUN pnpm install --frozen-lockfile --filter "{./frontend/rdf_gis_explorer}..."

COPY frontend/rdf_gis_explorer/ frontend/rdf_gis_explorer/
RUN pnpm --filter "{./packages/contracts}" run build \
 && pnpm --filter "{./frontend/rdf_gis_explorer}" run build

FROM nginx:alpine
COPY --from=builder /repo/frontend/rdf_gis_explorer/dist/frontend/browser /usr/share/nginx/html
COPY frontend/rdf_gis_explorer/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
