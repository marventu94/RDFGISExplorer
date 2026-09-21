# GIS Explorer Frontend

Standalone Angular application for exploring SPARQL results through coordinated
table, graph, map, and timeline views. It includes global batches, summaries,
and full XLSX export.

```bash
pnpm run dev:gis-standalone
pnpm --dir products/gis-explorer/frontend test
pnpm --dir products/gis-explorer/frontend build
```

In standalone mode it uses `/api` and listens on `:4202`.
When integrated, the Shell configures `/gis-api` and provides
persistence through the platform bridge.