# Se buildea con contexto en la RAÍZ del repo (ver docker-compose.yml):
#   docker build -f packages/explorer-backend/Dockerfile .
# El contexto raíz es necesario porque el workspace pnpm comparte el lockfile
# y el paquete packages/contracts entre backend y frontends.
FROM node:24.18.0-alpine AS builder
RUN apk add --no-cache python3 make g++ linux-headers
RUN corepack enable
WORKDIR /repo

# Manifests del workspace (todos los package.json participan del lockfile)
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

RUN pnpm install --frozen-lockfile --filter "{./packages/explorer-backend}..."

COPY packages/explorer-backend/ packages/explorer-backend/
RUN pnpm --filter "{./packages/contracts}" run build \
 && pnpm --filter "{./packages/explorer-backend}" run build

FROM node:24.18.0-alpine
WORKDIR /repo/packages/explorer-backend
# Copiar ambos niveles de node_modules preserva los symlinks relativos de pnpm
COPY --from=builder /repo/node_modules /repo/node_modules
COPY --from=builder /repo/packages/contracts /repo/packages/contracts
COPY --from=builder /repo/packages/explorer-backend/node_modules ./node_modules
COPY --from=builder /repo/packages/explorer-backend/dist ./dist
# buildPrefixes() resuelve config/prefixes.<backend>.json relativo a cwd:
# sin esta carpeta el contenedor arranca sin prefixes configurados.
COPY --from=builder /repo/packages/explorer-backend/config ./config
COPY --from=builder /repo/packages/explorer-backend/package.json ./
EXPOSE 3000
CMD ["node", "dist/main.js"]
