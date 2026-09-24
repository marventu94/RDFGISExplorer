# Design decisions

This document explains the main decisions that shaped RDFGISExplorer: the
problem each one addresses, the evidence supporting it, and the product or
engineering tradeoffs it entails. It does not describe the implementation file
by file; its purpose is to make the reasoning behind the exploration
experience, its limits, and its architecture traceable.

The starting point is *Integrating Spatial and Temporal Dimensions in Knowledge
Graphs through Visualization: Challenges and Research Opportunities* [Venturino
et al. 2026], a rapid review of 30 papers on visualizing knowledge graphs with
spatial and temporal dimensions. It identifies a concrete gap: only 7 of the 30
papers integrate graph, space, and time (G+S+T); the approaches found are tied
to specific domains, and the tool ecosystem is fragile (§3.2, §4.3, and §5).

That diagnosis leads to two product principles: **bring all three dimensions
together in an integrated experience** and **keep exploration independent of
the domain and SPARQL endpoint**. The following sections relate each decision
to the literature where direct support exists and explicitly distinguish
original product or engineering decisions.

Graph-view-specific decisions—selection, aggregation, layout, and visual
encoding—are discussed separately in
[`graph-rendering-decisions.md`](./graph-rendering-decisions.md).

---

## 1. Four coordinated views (table, map, graph, timeline)

**Rationale.** The paper's main conclusion (§5, answer to RQ2) is that the
most complete approaches combine *"linked views of graphs, maps, and
timelines"* and that G+S+T integration *"requires more than one technique
working together"*. Section 4.2 also notes that 2D views require view-linking
strategies. Hadlak et al. [2015] formalize the pattern: balanced facets are
composed through juxtaposition in coordinated views with linking and brushing.

**Decision.** The view set is fixed at four. Removing the table would forfeit
exact-value verification and export support (see §3); adding a fifth
aggregation view, by contrast, would shift the tool toward analysis and exceed
the stated scope (see §2).

## 2. Scope: exploration with descriptive statistics (not analysis)

**Rationale.** The paper shows that multidimensional G+S+T filtering *"remains
a technical challenge"* (§4.2), so addressing the exploratory aspect
satisfactorily is already a contribution in itself. Scope is delimited using
the task taxonomy of Andrienko et al. [2003]: **elementary tasks** (inspection
of individuals) are addressed through views, while **general tasks** (questions
about the set) require *data aggregation tools*.

**Decision.** The tool supports exploration with descriptive statistics, not
analysis: views filter and inspect, the summary panel computes aggregates over
the complete result, and in-depth analysis is delegated to export. This
boundary implies an honesty rule: **no value presented as belonging to "the
result" is computed from the visible sample**—it is either computed over the
whole result or explicitly labeled as a batch.

| Component | Role | Filters? | Computes over the full result? |
|------------|------|----------|--------------------------------|
| Table | Exact-value inspection and verification | Quick filter | No |
| Map | Geographic distribution | Polygon | Visual aggregation (clusters) |
| Graph | Relational structure around the focus | Query-aware budget and reversible motifs | No |
| Timeline | Temporal distribution | Range (brush) | Visual aggregation |
| Summary panel | Descriptive statistics | No | **Yes** (COUNT, AVG, MIN/MAX, top values) |
| Excel export | Raw material for external analysis | No | Yes (all rows) |

The Graph row describes the current strategy: it prioritizes the selection,
query entities, and intermediate nodes; applies the configured cap to the
remaining context; and, in Summary, replaces components with the same
structural signature with reversible motifs containing exact counts and
members. Scope, provenance, and abstractions still pending are recorded in
`graph-rendering-decisions.md` (§3.2 and §3.3).

## 3. The table as a view (rather than visual views alone)

**Rationale.** Antoniazzi & Viola [2018]: the tabular representation is the
most common way to view SPARQL results, but it is insufficient by itself
(clutter with only a few dozen rows, no overview)—hence table *plus views*,
not table *or* views. The paper (§3.3) also records tabular interfaces for
domain users exploring KGs [Mulholland et al. 2024].

**Original note.** The table serves three roles no other view covers:
exact-value verification, export, and quick text filtering without writing
SPARQL.

## 4. Timeline brushing instead of animation

**Rationale.** The paper warns that temporal animations *"can make effective
comparison between temporal states difficult"* (§4.2, citing Persson 2020) and
records the dynamic-graph taxonomy contrasting animation with timelines/small
multiples [Beck et al. 2017].

**Decision.** The timeline filters by range (brush), and the result is
reflected in the other coordinated views, avoiding the cognitive burden of
comparing animated states.

## 5. Scale handling: node cap, batches, and pinning

**Rationale.** The paper identifies visual clutter as a recurring barrier
requiring folding/fisheye techniques (§4.1), and partial focusing is
legitimate when compensated for by linking [Andrienko et al. 2003]. Pagination
into bounded portions is the *time chopping* of Bach et al. [2014]. Schulz et
al. [2013] explain who decides what enters each portion: when a set is too
large to display in full, users express interest in two ways—*relatively*,
through tuple ordering (sorting: navigation begins with the most relevant
items), and *absolutely*, by fixing specific instances of interest (pinning).

**Original note.** The 300-node cap is our decision within the corpus's
empirical range (layouts degrade at roughly 100 nodes, computation spikes
around 110, and near-real-time behavior remains below 800). All four views
share the same row batch, guaranteeing consistent linking by construction.
Sorting is implemented as the user's query `ORDER BY`: batches are
sliced from rows in their original order and never reordered client-side, so
the user controls what enters each batch. Pinning is adapted as injection:
where Schulz et al. use it as a filter restricting tuples to those containing
the pinned instance, here the selected node is added to the visible batch even
if no row in that batch references it. The underlying idea is the same: the
instance of interest remains fixed while the visible portion changes.

## 6. Summary panel (aggregation over the complete result)

**Rationale.** Andrienko et al. [2003]: views of individuals do not support
general tasks; *data aggregation tools* are required. QueDI [De Donato et al.
2020] realizes this pattern, moving from a query result to computed
visualizations and aggregates.

**Decision.** The backend wraps the user's query as a subquery, and the SPARQL
endpoint computes COUNT/AVG/MIN/MAX and top values **over every row in the
result** without transferring them. Variables to aggregate are detected
heuristically from the typed result (numeric, temporal, low-cardinality
categorical): no domain assumptions. No median—SPARQL 1.1 does not provide
one.

## 7. Full Excel export

**Rationale.** This is the counterpart to the boundary in §2: if in-depth
analysis is delegated to export, exporting only the visible batch would provide
an arbitrary sample.

**Decision (original).** Deterministic endpoint-side pagination: the query is
wrapped with a total ordering over every projected variable (honoring the
user's `ORDER BY` when present) and downloaded in OFFSET/LIMIT pages
until the result is exhausted. The XLSX file contains a data sheet with typed
cells (numbers and dates as values, ready for Excel operations) and a
provenance sheet (endpoint, query, timestamp, rows), marked PARTIAL if the
configurable cap was applied. It uses standard SPARQL 1.1 and works with any
endpoint.

## 8. Environment-configurable limits

**Rationale.** User-configurable limits appear as a pattern in the corpus's
visual querying tools (ELODIE, discussed in QueDI).

**Decision.** All query and visualization limits (node cap, batch size,
categorical top count, export cap and page size, table pagination) are backend
environment variables exposed to the frontends through `GET /api/config`
(`limits`). Defaults are the design decisions documented here; each
deployment can adjust them without code changes.

## 9. Domain-agnostic architecture (SPARQL Adapter)

**Rationale.** The paper's central gap: *every* reviewed G+S+T approach was
built for a specific domain, and *"general-purpose frameworks for
spatio-temporal KG visualization remain an open research challenge"* (§5).

**Decision.** The backend is a generic SPARQL 1.1 proxy (Adapter pattern): URL,
credentials, prefixes, and limits are configured through environment variables;
the frontend makes no domain assumptions. Endpoints are added through
configuration.

## 10. Standard, actively maintained web stack

**Rationale.** The tool ecosystem is fragile: only 5 of 15 RDF tools remain
active, and only 2 of the 5 post-2018 tools in the corpus remain accessible
(§4.3).

**Decision.** Standard web libraries with active communities (Angular, NestJS,
Cytoscape, Leaflet, vis-timeline, AG Grid) over standard protocols (SPARQL 1.1,
RDF). Sustainability is a design requirement, not an implementation detail.

## 11. Microfrontends with Native Federation

**Rationale.** Two ideas from the paper converge: ecosystem fragility (§4.3)
suggests an architecture in which **each part can evolve or be replaced without
rewriting the platform**, while G+S+T convergence must occur *"within a single
interface"* (RQ2). Here this is achieved at the product level: one AppShell and
one build → execute → explore flow, with handoff between tools.

**Original note.** These are two tools with independent life cycles: RDF
Explorer (an extension of the Vargas et al. [2019] paradigm) and the GIS
dashboard can be versioned, deployed, or replaced separately, and each remote
loads only its own heavy dependencies (Leaflet/AG Grid in GIS).

**Accepted cost.** Federation adds build and shared-dependency complexity
(documented in `AGENTS.md`). It was preferred over a monolith, which
would couple both tools' life cycles, and over separate applications without a
shell, which would lose flow integration.

## 12. Saving and sharing dashboards

**Rationale.** The review by Venturino et al. [2026] (§3.3, “Sharing Results”)
identifies reusable visualization states and shared exploration paths as ways
to communicate findings beyond a static export.

**Decision and status.** The Shell saves dashboards and lets users reopen them
through `/dashboards/:id`. That link can be shared with someone who has access
to the same deployment. There is currently no dedicated action to copy or
publish the link.

---

## References

- **[Venturino et al. 2026]** Venturino, M.M., Firmenich, S., Torres, D. "Integrating Spatial and Temporal Dimensions in Knowledge Graphs through Visualization: Challenges and Research Opportunities." Workshop DECISIONING 2026, Universidad de Talca. — Primary source for this document.
- [Andrienko et al. 2003] "Exploratory Spatio-Temporal Visualization: An Analytical Review." JVLC 14(6).
- [Antoniazzi & Viola 2018] "RDF Graph Visualization Tools: A Survey." FRUCT 2018.
- [Hadlak et al. 2015] "A Survey of Multi-faceted Graph Visualization." EuroVis STARs.
- [Beck et al. 2017] "A Taxonomy and Survey of Dynamic Graph Visualization." Computer Graphics Forum 36(1).
- [Bach et al. 2014] "A Review of Temporal Data Visualizations Based on Space-Time Cube Operations." EuroVis STARs.
- [Schulz et al. 2013] "A Visualization Approach for Cross-Level Exploration of Spatiotemporal Data."
- [De Donato et al. 2020] "QueDI: From Knowledge Graph Querying to Data Visualization." SEMANTICS 2020.
- [Vargas et al. 2019] "RDF Explorer: A Visual SPARQL Query Builder." ISWC 2019.
