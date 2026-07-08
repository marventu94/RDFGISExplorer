# Se buildea con contexto en la RAÍZ del repo (ver docker-compose.yml):
#   docker build -f backend/Dockerfile .
# El contexto raíz es necesario porque el workspace pnpm comparte el lockfile
# y el paquete packages/contracts entre backend y frontends.
FROM node:24.18.0-alpine AS builder
RUN apk add --no-cache python3 make g++ linux-headers
RUN corepack enable
WORKDIR /repo

# Manifests del workspace (todos los package.json participan del lockfile)
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/contracts/ packages/contracts/
COPY backend/package.json backend/
COPY frontend/app_shell/package.json frontend/app_shell/
COPY frontend/rdf_explorer/package.json frontend/rdf_explorer/
COPY frontend/rdf_gis_explorer/package.json frontend/rdf_gis_explorer/
COPY frontend/rdf_gis_explorer/patches/ frontend/rdf_gis_explorer/patches/

RUN pnpm install --frozen-lockfile --filter "{./backend}..."

COPY backend/ backend/
RUN pnpm --filter "{./packages/contracts}" run build \
 && pnpm --filter "{./backend}" run build

FROM node:24.18.0-alpine
WORKDIR /repo/backend
# Copiar ambos niveles de node_modules preserva los symlinks relativos de pnpm
COPY --from=builder /repo/node_modules /repo/node_modules
COPY --from=builder /repo/packages/contracts /repo/packages/contracts
COPY --from=builder /repo/backend/node_modules ./node_modules
COPY --from=builder /repo/backend/dist ./dist
# buildPrefixes() resuelve config/prefixes.<backend>.json relativo a cwd:
# sin esta carpeta el contenedor arranca sin prefixes configurados.
COPY --from=builder /repo/backend/config ./config
COPY --from=builder /repo/backend/package.json ./
RUN mkdir -p /repo/backend/data
EXPOSE 3000
CMD ["node", "dist/main.js"]
