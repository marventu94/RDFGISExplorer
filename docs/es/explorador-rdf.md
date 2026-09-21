# RDF Explorer Frontend

Aplicación Angular standalone para construir consultas SPARQL mediante un
grafo visual. Puede ejecutarse sola o como remote del Shell y entregar la
consulta completa a GIS Explorer.

```bash
pnpm run dev:rdf-standalone
pnpm --dir products/rdf-explorer/frontend test
pnpm --dir products/rdf-explorer/frontend build
```

En standalone usa `/api` y escucha en `:4201`. Integrada, el Shell configura
`/rdf-api` y ofrece persistencia mediante el platform bridge.
