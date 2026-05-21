# 03 — Setup local + Docker

## 1. Pre-requisitos

- Node.js 20 LTS (`nvm install 20 && nvm use 20`)
- pnpm 8+ (preferido) o npm 10+
- Docker 24+ y Docker Compose v2 (para deploy + dev integrado)
- Git

## 2. Clonar y configurar

```bash
git clone <repo-url> rdf_gis_explorer
cd rdf_gis_explorer

# Variables de entorno
cp .env.example .env
# Editar .env si hace falta (ver sección 3)
```

## 3. Variables de entorno

Todas las variables viven en `.env` en la raíz. El backend las lee con `@nestjs/config`.

| Variable | Default | Descripción |
|---|---|---|
| `SPARQL_BACKEND` | `wikidata` | `wikidata` (fase 1) o `millenniumdb` (fase 2). Determina qué adapter inyecta M09. |
| `SPARQL_ENDPOINT_URL` | `https://query.wikidata.org/sparql` | URL del endpoint SPARQL. |
| `SPARQL_USER_AGENT` | `rdf-gis-explorer/0.1 (https://github.com/.../...; contacto@email)` | **OBLIGATORIO** por la política de Wikimedia. Si falta, Wikidata devuelve 429. |
| `SPARQL_TIMEOUT_MS` | `10000` | Timeout duro de query. |
| `SPARQL_DEFAULT_LIMIT` | `500` | Limit aplicado si la query no lo especifica. |
| `SPARQL_MAX_LIMIT` | `2000` | Cap absoluto. Requests con `limit > MAX` devuelven 413. |
| `BACKEND_PORT` | `3000` | Puerto del NestJS. |
| `FRONTEND_PORT` | `4200` | Puerto de Angular dev server. |
| `SQLITE_PATH` | `./data/curation.db` | Path al archivo SQLite del overlay de curado. |
| `CORS_ORIGINS` | `http://localhost:4200` | Origins permitidos. |
| `LOG_LEVEL` | `info` | `error`, `warn`, `info`, `debug`. |

### Migrar a MillenniumDB (fase 2)

Solo se cambian dos variables:

```bash
SPARQL_BACKEND=millenniumdb
SPARQL_ENDPOINT_URL=http://millenniumdb.lifia.info.unlp.edu.ar/sparql
```

Ningún código del frontend ni de los módulos cambia. Solo M09 incorpora la implementación real de `MillenniumDBAdapter`.

## 4. Levantar en local (dev sin Docker)

Terminal 1 — backend:
```bash
cd backend
pnpm install
pnpm run start:dev
# escucha en http://localhost:3000
```

Terminal 2 — frontend:
```bash
cd frontend
pnpm install
pnpm run start
# Angular dev server en http://localhost:4200
# Proxy a /api → http://localhost:3000 (configurado en proxy.conf.json)
```

## 5. Levantar con Docker Compose

```bash
docker compose up --build
```

Esto inicia:
- `backend` (NestJS, puerto 3000)
- `frontend` (Angular servido por nginx, puerto 4200)
- Volumen `sqlite-data` para persistir `curation.db`

### `docker-compose.yml` (esqueleto)

```yaml
version: '3.9'

services:
  backend:
    build: ./backend
    ports:
      - "${BACKEND_PORT:-3000}:3000"
    env_file: .env
    volumes:
      - sqlite-data:/app/data
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:3000/health"]
      interval: 30s
      timeout: 5s
      retries: 3

  frontend:
    build:
      context: ./frontend
      args:
        API_URL: http://backend:3000
    ports:
      - "${FRONTEND_PORT:-4200}:80"
    depends_on:
      backend:
        condition: service_healthy

volumes:
  sqlite-data:
```

## 6. Health checks

- `GET /health` → `200 { status: 'ok', backend: 'wikidata', dbConnected: true }`
- `GET /health/sparql` → fuerza una query trivial al endpoint y reporta `200` o `503`.

## 7. Build de producción

```bash
# Frontend
cd frontend && pnpm run build
# Genera dist/ que se sirve estático con nginx

# Backend
cd backend && pnpm run build
# Genera dist/, se ejecuta con `node dist/main.js`
```

## 8. Despliegue en servidor LIFIA

```bash
# En el servidor
git pull
docker compose pull   # si hay imágenes en registry
docker compose up -d --build
docker compose logs -f
```

Se recomienda reverse proxy nginx delante con TLS terminado en Let's Encrypt. Fuera del alcance de este documento (ver `docs/ai-workflow.md` → DevOps wave futura).

## 9. Troubleshooting rápido

| Problema | Causa probable | Fix |
|---|---|---|
| `429 Too Many Requests` desde Wikidata | Falta `User-Agent` | Setear `SPARQL_USER_AGENT` con email de contacto |
| Frontend no llega al backend | Puerto/proxy mal | Verificar `proxy.conf.json` y CORS |
| `SQLITE_CANTOPEN` | Volumen no montado | `docker compose down -v && docker compose up` |
| Timeout en queries simples | Endpoint Wikidata lento | Reintentar; subir `SPARQL_TIMEOUT_MS` temporalmente |
