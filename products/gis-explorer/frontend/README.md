# GIS Explorer Frontend

Aplicación Angular standalone para explorar resultados SPARQL en vistas
coordinadas de tabla, grafo, mapa y línea temporal. Incluye lotes globales,
resumen y export completo a XLSX.

```bash
pnpm run dev:gis-standalone
pnpm --dir products/gis-explorer/frontend test
pnpm --dir products/gis-explorer/frontend build
```

En standalone usa `/api` y escucha en `:4202`. Integrada, el Shell configura
`/gis-api` y ofrece persistencia mediante el platform bridge.
