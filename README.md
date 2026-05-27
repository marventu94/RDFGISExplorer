# RDF GIS Explorer

Plataforma unificada para exploración visual de grafos de conocimiento (KG) con dimensiones geo-espaciales y temporales. Combina dos herramientas — **RDF Explorer** (construcción visual de queries SPARQL) y **RDF GIS Explorer** (dashboard de vistas coordinadas: tabla, grafo, mapa, línea de tiempo) — bajo un único *AppShell* con Module Federation.

Tesis de Maestría en Ingeniería de Software — Venturino, Martín M. — LIFIA / UNLP, 2025.

---

## Stack

- **Frontend:** Angular 21 (Module Federation vía `@angular-architects/native-federation`)
  - `frontend/app_shell/` — Host en `:4200`
  - `frontend/rdf_explorer/` — Remote en `:4201`
  - `frontend/rdf_gis_explorer/` — Remote en `:4202`
- **Backend:** NestJS sobre Node.js 20 LTS (`:3000`)
- **DB:** SQLite (single-user, `backend/data/`)
- **Endpoint SPARQL:** Wikidata (default) / MillenniumDB (futuro) — patrón Adapter en backend
- **E2E:** Playwright (`frontend/e2e/`)

---

## Cómo levantar el proyecto

### Desarrollo local

```bash
# Instalar dependencias del backend
cd backend && npm install && cd ..

# Instalar dependencias del app shell
cd frontend/app_shell && npm install && cd ../..

# Instalar dependencias de rdf_explorer
cd frontend/rdf_explorer && npm install && cd ../..

# Instalar dependencias de rdf_gis_explorer
cd frontend/rdf_gis_explorer && pnpm install && cd ../..

# Levantar backend (:3000), shell (:4200), explorer (:4201) y gis (:4202)
npm run dev
```

| Servicio | URL |
|----------|-----|
| App Shell (host) | http://localhost:4200 |
| RDF Explorer (remote) | http://localhost:4200/explorer |
| RDF GIS Explorer (remote) | http://localhost:4200/gis |
| Backend API | http://localhost:3000 |

### Tests E2E

```bash
cd frontend/e2e
npm install
npx playwright install --with-deps chromium
npm run test
```

### Docker

```bash
cp .env.example .env
docker compose up
```

---

## Flujo principal de la plataforma

1. **Welcome** (`/`) — Tableros recientes guardados (mix de Explorer y GIS) con filtros y CTAs.
2. **RDF Explorer** (`/explorer`) — Construcción visual de queries SPARQL; guardar workspace.
3. **Handoff** — Botón "Explorar en GIS" migra la query generada al dashboard GIS.
4. **RDF GIS Explorer** (`/gis`) — Ejecutar query, explorar resultados en 1-4 vistas coordinadas, guardar dashboard.
5. **Persistencia** — Todo se guarda en el backend NestJS; recargar y abrir desde Welcome restaura el estado idéntico.

---

## Estructura del repo

```
backend/                # NestJS + SQLite
frontend/
  app_shell/            # Host Angular + WelcomePage + routing
  rdf_explorer/         # Remote: editor visual SPARQL
  rdf_gis_explorer/     # Remote: dashboard 4 vistas
  e2e/                  # Suite Playwright (5 specs)
docs/
  specs/                # Especificaciones por etapa
  modules/              # Documentación de módulos
```

---

## Documentación

- [`docs/00-architecture.md`](docs/00-architecture.md) — Visión global, capas, flujo de datos
- [`docs/01-tech-stack.md`](docs/01-tech-stack.md) — Versiones exactas de librerías
- [`docs/02-data-contracts.md`](docs/02-data-contracts.md) — Tipos compartidos front↔back
- [`docs/03-setup-and-docker.md`](docs/03-setup-and-docker.md) — Setup local + Docker
- [`docs/04-conventions-and-glossary.md`](docs/04-conventions-and-glossary.md) — Naming, testing, glosario
- [`docs/modules/`](docs/modules/) — Documentación por módulo

---

## Contacto

Martín M. Venturino — `marventurino@gmail.com` — Director: Dr. Diego Torres — Co-director: Dr. Sergio Firmenich
