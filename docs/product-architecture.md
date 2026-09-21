# Product architecture

The workspace contains three deployable products:

| Product | Frontend | Dedicated backend | Responsibility |
| --- | --- | --- | --- |
| Shell | `products/shell/frontend` | `products/shell/backend` (`:3000`) | navigation, home screen, and exclusive dashboard persistence |
| RDF Explorer | `products/rdf-explorer/frontend` | `products/rdf-explorer/backend` (`:3001`) | RDF editing, queries, suggestions, and configuration |
| GIS Explorer | `products/gis-explorer/frontend` | `products/gis-explorer/backend` (`:3002`) | queries and GIS visualizations |

The explorer processes use the cross-cutting implementation in
`packages/explorer-backend`; they are independent processes and configurations and
contain neither dashboard routes nor dashboard storage. `packages/contracts`
contains shared types, while `packages/platform-bridge` contains integration contracts.

## Runtime modes

- `pnpm dev`: Shell, both remotes, and all three backends.
- `pnpm dev:rdf-standalone`: RDF Explorer with its backend on `:3001`.
- `pnpm dev:gis-standalone`: GIS Explorer with its backend on `:3002`.

In standalone mode, each frontend uses `/api`. When mounted in the
Shell, the bridge configures `/rdf-api` and `/gis-api`, which the
proxy routes to the corresponding runtime. All URLs are relative.

## Dashboard ownership

Only the Shell exposes `/api/dashboards` and accesses SQLite. At startup, it
registers a `DashboardHost`; the remotes use this mediation to persist their
state. In standalone mode the host is absent, so save controls are hidden.