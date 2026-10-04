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

## Known limits: batches and graph structure

All four views share a batch of **result rows**, in query order. A batch is not
a fixed number of listings or properties: one entity can occupy several rows,
and its rows can span batches. The graph applies a separate node cap
(`GIS_GRAPH_MAX_NODES`, 300 by default). A batch of 300 rows can therefore
contain far more than 300 nodes.

Selecting an entity in the map, table, or timeline brings its node into the
general graph and focuses it after the layout finishes. Its neighbors may
still be excluded by the graph cap, so it can appear as an isolated point
while another entity shows several relationships. This does not mean that
the selected entity has no relationships in the retrieved result.

Use **View structure** (**Ver estructura** in Spanish) to inspect the selected
entity and explore its available relationships within the entity view's own
budget. Moving to another batch changes the available context but does not
guarantee that all relationships fit in the general graph. Entity exploration
uses the retrieved result without fetching additional SPARQL data; backend
truncation or a partial projection can leave relationships unavailable.

### Why batches are not inferred objects

Object batching is not currently implemented. It would require an explicit
grouping identity: in GraphDB C1 (houses for sale in Berisso), `?listing` would
group rows by listing, while `?realEstate` would group rows by property and
collect the listings referencing it.

Shared cities, origins, or classes do not establish object boundaries; grouping
whole connected components could merge many properties. Row provenance and
directed query relationships can suggest a primary entity, but cannot determine
the intended business object for every query. The existing primary-entity
selector supports selection coordination; it does not change row batching.

For now, row batches and the graph cap remain separate, documented limits, with
**View structure** as the detailed inspection workflow. A future object batch
mode would need an explicit grouping variable, would still respect rendering
budgets, and could not guarantee complete objects from truncated results.
