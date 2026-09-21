# Explorer Backend

Implementación NestJS compartida por los runtimes de RDF Explorer y GIS
Explorer. Expone consultas, sugerencias, configuración y health checks sobre
un endpoint SPARQL 1.1 configurable. No persiste tableros: esa responsabilidad
pertenece exclusivamente al backend del Shell.

```bash
pnpm --dir packages/explorer-backend build
pnpm --dir packages/explorer-backend test
pnpm --dir packages/explorer-backend test:e2e
pnpm --dir packages/explorer-backend lint
```

`SPARQL_BACKEND=wikidata` habilita su búsqueda pública de entidades y
`wikibase:label`; cualquier otro identificador usa el cliente genérico. La URL,
Basic Auth, prefixes, colores y límites se configuran mediante el entorno.
