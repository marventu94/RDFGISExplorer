# Explorer Backend

NestJS implementation shared by the RDF Explorer and GIS Explorer runtimes. It
exposes queries, suggestions, configuration, and health checks for a
configurable SPARQL 1.1 endpoint. It does not persist dashboards; that
responsibility belongs exclusively to the Shell backend.

```bash
pnpm --dir packages/explorer-backend build
pnpm --dir packages/explorer-backend test
pnpm --dir packages/explorer-backend test:e2e
pnpm --dir packages/explorer-backend lint
```

`SPARQL_BACKEND=wikidata` enables Wikidata's public entity search and
`wikibase:label`; any other identifier uses the generic client. The URL, Basic
Auth, prefixes, colors, and limits are configured through the environment.