# Shell Frontend

Angular host for the platform. It provides the dashboard home page, navigation,
language selection, and routes that load both remotes through Native
Federation. It is the only frontend that mediates dashboard CRUD operations.

```bash
pnpm --dir products/shell/frontend start
pnpm --dir products/shell/frontend test
pnpm --dir products/shell/frontend build
```

It listens on `:4200`; `/explorer` loads RDF Explorer and
`/gis` loads GIS Explorer.