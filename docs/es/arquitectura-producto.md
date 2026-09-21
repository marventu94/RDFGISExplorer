# Arquitectura por productos

El workspace contiene tres productos desplegables:

| Producto | Frontend | Backend propio | Responsabilidad |
| --- | --- | --- | --- |
| Shell | `products/shell/frontend` | `products/shell/backend` (`:3000`) | navegación, pantalla y persistencia exclusiva de tableros |
| RDF Explorer | `products/rdf-explorer/frontend` | `products/rdf-explorer/backend` (`:3001`) | edición RDF, consultas, sugerencias y configuración |
| GIS Explorer | `products/gis-explorer/frontend` | `products/gis-explorer/backend` (`:3002`) | consultas y visualizaciones GIS |

Los procesos de explorer usan la implementación transversal
`packages/explorer-backend`; son procesos y configuraciones independientes y no
contienen rutas ni almacenamiento de dashboards. `packages/contracts` contiene
tipos compartidos y `packages/platform-bridge` los contratos de integración.

## Modos de ejecución

- `pnpm dev`: Shell, ambos remotes y los tres backends.
- `pnpm dev:rdf-standalone`: RDF Explorer con su backend en `:3001`.
- `pnpm dev:gis-standalone`: GIS Explorer con su backend en `:3002`.

En standalone cada frontend usa `/api`. Montados en el Shell, el bridge configura
`/rdf-api` y `/gis-api`, dirigidos por el proxy al runtime correspondiente. Todas
las URLs son relativas.

## Propiedad de dashboards

Solo el Shell publica `/api/dashboards` y accede a SQLite. Al arrancar registra
un `DashboardHost`; los remotes invocan esa mediación para persistir su estado.
En standalone el host no existe y los controles de guardado no se muestran.
