# Shell Frontend

Host Angular de la plataforma. Publica la portada de tableros, navegación,
idioma y rutas que cargan los dos remotes mediante Native Federation. Es el
único frontend que media con el CRUD de tableros.

```bash
pnpm --dir products/shell/frontend start
pnpm --dir products/shell/frontend test
pnpm --dir products/shell/frontend build
```

Escucha en `:4200`; `/explorer` carga RDF Explorer y `/gis` carga GIS Explorer.
