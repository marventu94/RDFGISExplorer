# Escenario de evaluación GraphDB (C1–C5)

Este corpus conserva el escenario aislado de evaluación sobre el dataset
inmobiliario de GraphDB. C1–C4 generan, desde el mismo grafo del RDF Explorer,
un workspace borrador y su dashboard GIS; C5 conserva el caso mínimo de
construcción visual y handoff. El seed escribe nueve dashboards en total.

## Configuración

1. Copiar `.env.evaluation.example` a un archivo local ignorado por Git y
   completar URL y credenciales de GraphDB.
2. Ajustar, si el repositorio usa otros vocabularios, los ejemplos
   `packages/explorer-backend/config/prefixes.graphdb.example.json` y
   `class-colors.graphdb.example.json`, o apuntar las variables de entorno a
   copias locales.
3. Crear la base aislada indicando siempre su ruta de forma explícita:

   ```bash
   DASHBOARDS_SQLITE_PATH=/tmp/rdfgis-evaluation.sqlite \
     pnpm run seed:evaluation-dashboards
   ```

4. Usar esa misma ruta en el archivo de entorno y arrancar la plataforma:

   ```bash
   ./start.sh --env .env.evaluation.local
   ```

El seed reemplaza atómicamente el archivo indicado. No debe apuntarse a una
base persistente que contenga dashboards de usuario.

## Validación sin GraphDB ni base persistente

```bash
pnpm --dir products/shell/backend exec jest --rootDir . --runInBand \
  scripts/evaluation-dashboards.spec.ts
```

El test construye y parsea las consultas, verifica el round-trip de los grafos
y prueba dos ejecuciones idempotentes del seed sobre una SQLite temporal.
Las capturas históricas comparables están en
`docs/evidence/graph-view-stage-0/`.
