FROM node:24.18.0-alpine AS builder
RUN apk add --no-cache python3 make g++ linux-headers
RUN corepack enable
WORKDIR /repo
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/contracts/ packages/contracts/
COPY packages/platform-bridge/package.json packages/platform-bridge/
COPY packages/explorer-backend/package.json packages/explorer-backend/
COPY products/shell/backend/package.json products/shell/backend/
COPY products/shell/frontend/package.json products/shell/frontend/
COPY products/rdf-explorer/backend/package.json products/rdf-explorer/backend/
COPY products/rdf-explorer/frontend/package.json products/rdf-explorer/frontend/
COPY products/gis-explorer/backend/package.json products/gis-explorer/backend/
COPY products/gis-explorer/frontend/package.json products/gis-explorer/frontend/
COPY products/gis-explorer/frontend/patches/ products/gis-explorer/frontend/patches/
RUN pnpm install --frozen-lockfile --filter "{./products/shell/backend}..."
COPY products/shell/backend/ products/shell/backend/
RUN pnpm --filter "{./packages/contracts}" run build \
 && pnpm --filter "{./products/shell/backend}" run build

FROM node:24.18.0-alpine
WORKDIR /repo/products/shell/backend
COPY --from=builder /repo/node_modules /repo/node_modules
COPY --from=builder /repo/packages/contracts /repo/packages/contracts
COPY --from=builder /repo/products/shell/backend/node_modules ./node_modules
COPY --from=builder /repo/products/shell/backend/dist ./dist
COPY --from=builder /repo/products/shell/backend/package.json ./
RUN mkdir -p ./data
EXPOSE 3000
CMD ["node", "dist/main.js"]
