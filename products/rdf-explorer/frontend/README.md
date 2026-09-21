# RDF Explorer Frontend

Standalone Angular application for building SPARQL queries through a visual
graph. It can run on its own or as a Shell remote and hand the complete query
off to GIS Explorer.

```bash
pnpm run dev:rdf-standalone
pnpm --dir products/rdf-explorer/frontend test
pnpm --dir products/rdf-explorer/frontend build
```

In standalone mode it uses `/api` and listens on `:4201`.
When integrated, the Shell configures `/rdf-api` and provides
persistence through the platform bridge.