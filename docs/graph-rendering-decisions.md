# Technical decisions for graph visualization in RDF GIS Explorer

## 1. Purpose and scope

This document is the self-contained record of the technical decisions governing
the visual representation of SPARQL results in RDF GIS Explorer's graph view.
Each decision includes its grounding in the scientific literature and its
implementation status, making every choice traceable and defensible.

The document is limited to the graph view: element selection, aggregation,
spatial arrangement (*layout*), visual encoding, and integration with the other
views. Product-level decisions—view composition, analytical scope, batch
pagination, and persistence—are documented separately in `design-decisions.md`.

The cited sources come from the thesis literature review, supplemented by a
small set of external references only where the corresponding topic has no
primary source in that review. External references are identified as such in
section 8.

Each decision has one of two statuses: **current** (implemented in the present
code) or **proposed** (an approved potential design improvement that remains
pending and outside the current implementation).

## 2. Quality criteria for a graph view

The graph and knowledge-graph visualization literature converges on five
criteria that structure this document:

1. **Perceptual scalability.** Human comprehension, not rendering capacity, is the limiting factor. Selection and abstraction are therefore preferable to drawing more elements (decisions 3.1, 3.2, and 3.3).
2. **Query fidelity.** Relevance is *query-aware*: the view must explain why each element belongs to the result (decision 3.2).
3. **Provenance.** Every aggregate must be exact, reversible, and explainable (decisions 3.3 and 3.7).
4. **Cognitive stability.** Positions and transitions must preserve the user's mental map (decisions 3.4 and 3.5).
5. **Coordination without fusion.** The graph coexists with table, map, and timeline views without taking over their tasks or those of query construction (decisions 3.6, 3.7, and 3.10).

Query centrality follows the line of visual query systems for knowledge graphs.
Their empirical evidence indicates that building and exploring queries through
graphical representations is easier to learn and more practical than writing
SPARQL directly (Vargas et al., 2019; Wang, Wang, Li, and Han, 2023; Li, Z. et
al., 2024; De Donato et al., 2020; Orlando et al., 2024).

## 3. Design decisions

### 3.1. Node-link as the primary representation

**Rationale.** Node-link diagrams outperform adjacency matrices for
path-following tasks on small or sparse graphs (Ghoniem et al., 2004). Matrices
make density and blocks in dense regions easier to detect, and hybrid
node-link/matrix representations are viable (Beck et al., 2017; Bach et al.,
2014). Faster rendering (for example, WebGL) does not solve perceptual limits:
visual scalability depends on node count and edge density, not drawing speed
(Beck et al., 2017).

**Decision.** This implementation uses Cytoscape.js with node-link as its
primary representation.

**Status:** current (node-link).

### 3.2. A query-aware visual budget instead of the complete graph

**Rationale.** Drawing more elements does not improve comprehension: layout
algorithms degrade between tens and hundreds of nodes (Frasincar et al., 2006;
Antoniazzi and Viola, 2018), edge density is the second critical scalability
parameter (Beck et al., 2017), and interactive visual saturation appears above
roughly 800 nodes (Wang, Li, and Gu, 2023). Successful tools scale by selecting
according to the user's question, not by global centrality (Antoniazzi and
Viola, 2018—RelFinder; Sheng et al., 2019—CEPV; Kapler and Wright,
2005—GeoTime; Orlando et al., 2024—TGV). Literature assigns visible-portion
content to user-declared interest, expressed relatively through presentation
order or absolutely by explicitly pinning instances (Schulz et al., 2013).

**Decision.** Replace the current “top N nodes by degree” trimming with a
budget for explicit entities, aggregates, and edges, in this priority order:
(i) selected and pinned nodes; (ii) main entities from visible query rows;
(iii) intermediate nodes required to preserve query topology; (iv) bounded
paths between priority entities; (v) remaining context by descending total
degree; and (vi), for equal degree, input order (stable, deterministic
ordering). Degree then orders only the final bucket rather than determining
inclusion. Selection is a pure function that records each element's inclusion
reason and coverage metrics.

**Status:** partially current. The pure function reserves budget, in order, for
the selected node, entities present in bindings, one-hop intermediate
neighbors, and remaining context by degree. Those four categories are also the
recorded inclusion reasons (`selected`, `query-entity`,
`intermediate`, `context`); degree is an ordering, not a reason. A
selected zero-degree node remains visible. Bounded-path selection between
priority entities remains proposed. The final limit remains `limits.graphMaxNodes`
(300 by default).

### 3.3. Reversible aggregation with exact provenance

**Rationale.** The reference technique for simplifying repeated patterns is
*motif simplification*, with glyphs for fans, connectors, and cliques (Dunne
and Shneiderman, 2013). The corpus includes related RDF techniques (Antoniazzi
and Viola, 2018—grouping parallel relations in LOD Live; Orlando et al.,
2024—collapsing structural nodes in TGV) and summaries by structural
predicate signature (Wang, Wang, Li, and Han, 2023—KGNav). Literature
requires exact provenance and reversibility for every aggregate (Schulz et al.,
2013; Yacoubi et al., 2022), a facet recognized as underdeveloped in graph
visualization (Hadlak et al., 2015). Summary content must also depend on the
task being supported (Yacoubi et al., 2022; Mulholland et al., 2024).

**Decision.** Adopt supernodes—by trustworthy RDF class, with an explicit
fallback to SPARQL variable or a property signature clearly labeled as
inferred—superedges with exact multiplicity by predicate and direction, and
repeated-motif collapse. Every aggregate records its grouping criterion and
source, represented entity and triple counts, included predicates and
directions, recovery mechanism for original members, and expanded/collapsed
state. Inspectable logical superedges are preferred to geometric *edge
bundling*, because bundling may suggest nonexistent connectivity. This last
criterion is project-specific, while bundling's clutter-reduction benefits are
documented (Hadlak et al., 2015; Bach et al., 2014).

**Status:** partially current. Two exact, click-reversible abstractions are
implemented:

1. superedges for parallel relationships between the same pair of nodes;
2. repeated-component motifs. Each disconnected component is described by a signature recording node counts by role and edge counts by source role, predicate, and target role. The role comes from the SPARQL variable; when unavailable, an asserted RDF class is used, and the explicit `entity` marker is the final fallback.

The motif retains every node and edge identifier, grouping source and value,
direction, predicate, component count, and exact entity and triple counts.
Summary mode displays one supernode per role, labeled with its member count,
and one `predicate × N` relation for each edge type in the signature. One
click expands all components; another click on any of their edges collapses
them. Selection has priority: the component containing the selected entity
stays outside the group and is drawn explicitly. Consequently, if a signature
had only two components and selection excludes one, the remainder no longer
meets the minimum of two and is not aggregated: selection makes that summary
disappear rather than merely shrink. Expanded/collapsed state persists with the
dashboard.

This abstraction adapts Dunne and Shneiderman's (2013) general *motif
simplification* principle but does not claim to implement their three specific
glyphs (fan, connector, clique). The repeated-component signature is an
adaptation for the evaluated SPARQL results. It does not claim full isomorphism
when a role appears more than once; it guarantees equality of the declared
signature, exact counts, and member recovery. The original three glyphs,
general class supernodes, and property signatures remain pending.

### 3.4. Topology-aware, stable layout

**Rationale.** No layout method is universally appropriate: the suitable
technique depends on the question, data structure, and size (Frasincar et al.,
2006; Beck et al., 2017; Hadlak et al., 2015). Preserving the mental map is
beneficial, although its effect is task-dependent (Beck et al., 2017).
Reference techniques include animated *morphing* anchored by a global graph and
layout stabilization (Loubier and Dousset, 2008; Bach et al., 2014; Hadlak et
al., 2015).

**Decision.** Select layout by visible topology: grid without edges; layered
layout (Dagre or ELK) for summaries or directed acyclic graphs; fCoSE for
cyclic or heterogeneous graphs; recalculation over new elements only for local
expansions; and component packing for disconnected components. Stability rules
are: no global recalculation on selection or focus; global recalculation only
after an explicit user action or a new query; and respect for manually assigned
positions. Any new layout extension requires a comparative benchmark and Native
Federation compatibility verification.

**Status:** partially current. Initial layout uses Grid without edges and
Hierarchical (Dagre) whenever any relationship exists, including cycles and
loops. Dagre tolerates those structures and offers a more stable starting
point; Organic (Cola) remains a manual alternative. Grid is hidden from the
selector when relationships exist unless it is the effective value of a
historical dashboard. Persisted identifiers `dagre`,
`cola`, and `grid` retain their meaning and are not
migrated; historical states are respected. The actual layout runs after
registering its completion event, ensuring framing uses final geometry and no
node remains at `(0,0)`.

Initial-animation behavior deliberately depends on layout: Dagre and Grid
resolve without animation, while Cola is animated—with `animate: false`,
webcola resolves synchronously and may block the main thread. Cola reuses a
deterministic geometry seed (`randomize: false`) and receives up to 4 seconds to
converge, the extension's reference value. For graphs above 100 nodes, the
vertical-flow constraint is removed: imposing levels on a large cyclic or
heterogeneous network unnecessarily stretches the simulation. Organic remains a
manual alternative; Dagre is the default for every graph with edges.

User-requested layout changes are animated, and incremental stability is
preserved. fCoSE and dedicated component packing remain pending benchmark
results.

### 3.5. Progressive disclosure through explicit levels

**Rationale.** “Overview first, zoom and filter, then details on demand”
(Shneiderman, 1996) is documented throughout the literature (Lund et al., 2024;
Andrienko et al., 2003; Persson, 2020; Schulz et al., 2013; Yacoubi et al.,
2022; Orlando et al., 2024). *Semantic zoom* is rare in knowledge-graph tools
(Wiens et al., 2017); none of the fifteen RDF tools reviewed by Antoniazzi and
Viola (2018) implemented it. Related instances exist—polymorphic glyphs whose
representation changes with zoom (Menin et al., 2023)—as do alternatives
displaying all levels of granularity simultaneously (Schulz et al., 2013).
Evidence on labels conflicts: on-demand presentation has precedents (Frasincar
et al., 2006; Kapler and Wright, 2005), but a study cited by Beck et al. (2017)
found permanently visible labels superior in animated node-link diagrams.

**Decision.** Establish three explicit levels—Summary, Entities, and Entities
+ relationships—with manual control, a legend, and coverage indicators.
Determine label policy through user testing instead of assuming one universal
rule.

**Status:** partially current. Summary is the default: it replaces repeated
motifs with labeled aggregates and hides labels for non-aggregated entities.
Entities restores explicit topology and entity labels; Entities + relationships
adds predicates. Changing levels rebuilds topology, recalculates layout, and
restores the persisted camera. Dagre accounts for label dimensions and uses
increasing separation by level: 34/70/14, 60/95/24, and 78/125/36 for
`nodeSep/rankSep/edgeSep`. Common typography is 9–10 px; selections and aggregates
remain 11 px and bold. Long names wrap, while tooltips retain the full value.
The selector always reflects effective state. Automatic semantic zoom with
hysteresis awaits user validation.

### 3.6. The geographic dimension does not determine node position

**Rationale.** Combining semantic and geographic forces in one layout degrades
one dimension or the other. GeoGraphViz formalizes and measures this
tension—semantic clusters versus geographic fidelity—and recommends a
single force when the structures differ (Wang, Li, and Gu, 2023). Literature's
balanced composition is juxtaposition of a map and abstract graph with visual
links (Hadlak et al., 2015), already used to deliberately separate
georeferenced and abstract analysis (Compieta et al., 2007) and to coordinate
geographic and relational information (Kapler and Wright, 2005).

**Decision.** Map and graph remain specialized views coordinated through shared
selection and focus (*linking & brushing*; Hadlak et al., 2015; Andrienko et
al., 2003). Entities with coordinates carry a visual mark in the graph, not a
geographic position; aggregated geographic flows appear only on the map.

**Status:** current.

### 3.7. Semantic integrity before any abstraction

**Rationale.** A clear visualization of incorrectly classified data is worse
than a less elaborate representation of correct data (a project-specific
criterion). Tolerance for imperfect data—loops, repeated relations,
asymmetries—is a documented requirement for real knowledge graphs (Sheng et
al., 2019), and aggregated or projected data must be visually marked to avoid
confusing it with collected data (Schulz et al., 2013).

**Decision.** Before any class grouping, the data contract unambiguously
distinguishes source variable from RDF class: `NormalizedNode` records
`queryVariable` (the SPARQL variable producing the node), `classes`
(asserted class URI identifiers from `?x a <Class>` patterns), and
`classification.source` ∈ {rdf-type, query-variable, property-signature, unknown}.
Blank nodes were also normalized between bindings and graph; attribution of
literals, dates, and coordinates to the correct subject in multi-entity rows
was fixed; and the absence of *mapping overrides* weakening topology extracted
from the SPARQL pattern was verified.

**Status:** current (contract implemented in `packages/contracts`, with backend
and views migrated). Effective `rdf:type` coverage in each dataset must
still be validated before enabling class grouping (decision 3.3).

### 3.8. The graph view as a reading of the data model

**Rationale.** RDF has no native n-ary relations: an attribute with a unit,
provenance, or validity period is represented not as a literal hanging directly
from the entity but as a reified chain of intermediate nodes. Therefore, how a
dataset stores a value cannot be inferred from the value itself. Literature
treats those nodes as first-class material—TGV collapses structural nodes to
make topology legible (Orlando et al., 2024), and KGNav summarizes by
structural predicate signature (Wang, Wang, Li, and Han, 2023)—while
tolerance for irregular real knowledge graphs is a documented requirement
(Sheng et al., 2019).

**Decision (project-specific).** The graph view is not an alternative
representation of rows: it is the only view showing **the path connecting an
entity to its values through the model's intermediate nodes**. That is its
distinctive contribution relative to table, map, and timeline, and why it
remains one of the four views (`design-decisions.md`, §1).

It answers two questions no other view answers:

1. **Where does this value come from?** Structural provenance of an attribute. The table shows `superficieCubierta = 120`; the graph shows that the number lives three hops from the entity in `inmueble —rec:includes→ Site —inm:hasFeature→ Feature —inm:hasValue→ Spec`, and that its unit hangs from the same `Spec` through `gr:hasUnitOfMeasurement`. Without this view, users cannot know that the column is the endpoint of a chain or where to intervene if the value is wrong.
2. **Does the whole set have the same shape?** A component whose structural signature differs from the dominant motif is a modeling exception. Summary reveals it by construction: it aggregates repetitions and leaves non-matching structures explicit, exposing the anomaly without a search (see §3.3 and §3.9).

**Status:** current. Edges are not inferred from row co-occurrence:
`query-topology.ts` reads `?s <p> ?o` patterns from the query, detects
variables participating in a relationship but absent from the projection—the
model's intermediates—rewrites the `SELECT` to retrieve them from
the endpoint, and draws them as distinct nodes with their real predicate and
direction. Rows received by the table retain the user's original projection;
the graph receives complete topology.

This also affects Summary. Because a node's role comes first from its SPARQL
variable (§3.3) and every entity repeats the same reification chain, Summary
collapses those chains into one sequence of role-labeled supernodes with exact
multiplicities—`inmueble (N) —rec:includes ×N→ Site (N) —inm:hasFeature ×N→ …`—which reads the result's effective schema
at instance level. It is not a summary of the ontology's declared schema: it
describes exactly what the query returned, with counts.

### 3.9. Interpreting relationally repetitive results

A query designed to compare attributes may return one logical row per entity
while producing a topology of many disconnected components with the same
signature. The table is then more effective for value comparison. That does not
make the graph view incorrect, but it limits the relational question it can
answer.

Responsibilities are separated as follows:

- the dashboard and query determine which entities, relationships, and paths exist; the view does not invent absent connectivity;
- RDFGISExplorer must draw that structure correctly, explain its repetition, retain its counts, and allow members to be recovered;
- all four views remain available because they answer complementary questions: exact values, spatial distribution, temporal distribution, and relational structure.

Summary therefore does not display hundreds of copies as isolated nodes; it
expresses them as repeated-component motifs. Entities and Entities +
relationships restore explicit topology. This abstraction does not turn an
attributive query into a path or community query; it makes the structure
actually produced by the query legible.

### 3.10. Scope: the view explores the result; it does not traverse the graph

**Rationale.** Visual query systems in the corpus separate two activities:
graphical query construction—RDF Explorer (Vargas et al., 2019), KGNav (Wang,
Wang, Li, and Han, 2023), VQFT (Li, Z. et al., 2024)—and result
visualization—QueDI (De Donato et al., 2020), TGV (Orlando et al., 2024).
Traversing beyond queried data (expanding neighbors, finding paths between
arbitrary entities, reaching variable depth) belongs to the first activity:
every expansion is effectively a new query. Criterion 5 in §2—coordination
without fusion—also requires that no view absorb tasks already assigned
elsewhere.

**Decision.** RDF GIS Explorer's graph view issues **no queries of its own**:
it draws the dashboard query result and nothing more. Traversal is the
responsibility of **RDF Explorer**, the platform's other frontend, whose
paradigm is precisely that: users extend the query graph by dragging nodes and
properties, the pure domain generates SPARQL through BFS, and handoff
(`toSparqlFullProjection()`) sends the resulting query to GIS. The product flow is
**build → execute → explore** (`design-decisions.md`, §11), with construction
on one side of the handoff and the four coordinated views on the other.

Adding neighbor expansion or path search inside the GIS graph would duplicate
the query-construction paradigm across both tools and break that boundary. It
is therefore an explicit **non-goal**, not a pending feature.

This boundary must not be confused with decision 3.2: the proposed “bounded
paths between priority entities” operate **within the already retrieved
result**, deciding which paths survive budget trimming, and do not retrieve new
endpoint data.

**Status:** current. The view consumes `visibleQueryResult$` and already retrieved
data but has no route to the endpoint. The backend exposes `POST /api/query/execute`,
`POST /api/query/summary`, and `GET /api/suggestions/*`, with no neighborhood or path
operation. “Expand” actions—motifs, superedges, and entity-mode
branches—are strictly local: they reorganize elements already present in
`QueryResult` and request no data.

### 3.11. Local entity exploration and unambiguous copying

**Decision.** An explicit selection can open **Selected entity** mode.
Coordinated focus never triggers entry. A pure, deterministic model selects
root, same-row entities, paths, and intermediates; hubs remain at the frontier
and are traversed only by explicit action. Expansion is manual and one hop at a
time, with separate node and edge budgets. Root, active, and pinned nodes have
priority, and excess is never silently trimmed.

Local state retains root, active node, expanded/collapsed branches, pins, and
history. It is transient: leaving restores result-level camera, layout, and
level without changing query, filters, or batch. The interface uses
Hierarchical and provides breadcrumbs, expansion/collapse, pinning, root
promotion, undo, reset, and keyboard equivalents.

**Copy current view** and **Copy complete structure** produce stable text with
full URIs and opaque blank nodes. Each RDF edge counts as a triple; parallel
relationships declare multiplicity. Attributes without a known predicate are
shown separately and never invented as triples. The implementation tries
`navigator.clipboard`, then `execCommand`, and finally exposes text for manual
copying with an accessible message.

**Status:** current. Subgraph selection (`entity-subgraph.ts`), traversal state
(`entity-exploration.ts`), available-structure closure, and text generation are pure,
tested functions. `GraphViewComponent` provides only Angular/Cytoscape
integration. The default hub threshold is 8; the local visual budget is 60
nodes/120 edges, and copyable structure raises the cap to 500/1000. Predicates
are grouped by full URI and use labels only for presentation.

## 4. Potential future improvements

The following are outside the current implementation and may be considered only
with representative data, benchmarks, and user tasks that justify them:

- Stabilize the first rendering of cyclic graphs, currently not reproducible because Cola randomizes initial positions (§3.4).
- Add fan, connector, and clique glyphs; general supernodes by RDF class and property signatures.
- Evaluate fCoSE, ELK, and dedicated packing for disconnected components.
- Add automatic semantic zoom with hysteresis between levels.
- Settle the final label policy through user testing.
- Add a matrix representation only if a connectivity or density task demonstrates node-link is insufficient.

## 5. Evaluation metrics

Proposed decisions will be validated through tasks and measurements, not visual
inspection of screenshots. Knowledge-graph query benchmarks focus on execution
speed and neglect construction and comprehension complexity (Li, Z. et al.,
2024).

- **Effectiveness:** percentage of main entities and query paths retained; permanent visibility of selection and pinned nodes; aggregate-count accuracy; ability to recover every aggregated element; time and error rate when locating a relationship between two entities and identifying dominant types and predicates.
- **Legibility:** explicit edge crossings; label overlap; visible elements per level; ratio of aggregated to explicit edges; position stability across expansions.
- **Performance:** time to first useful view; initial and incremental layout duration; frame rate while panning and zooming; memory consumption at configured limits; summary-construction and motif-detection cost.
- **Usability:** expansions required to complete a task; ability to explain a supernode's contents; ability to return to a previous state; understanding of the distinction among result, batch, explicit entity, and aggregate.

## 6. Risks and mitigation strategies

| Risk | Mitigation strategy |
|------|---------------------|
| Missing or incorrect RDF classification | Explicit fallback by variable or signature; never present it as a class (§3.7) |
| Aggregates hiding exceptions | Exact counts, reversible expansion, and heterogeneity indicators (§3.3) |
| Expanded motif with no control for collapsing | Collapse requires clicking an edge carrying its `motifId`; if expansion exceeds the node budget, those edges may be trimmed while expanded state persists with the dashboard. Pending mitigation: explicit collapse-all action (§3.3) |
| Unpredictable zoom changes | Hysteresis, transitions, and manual control (§3.5) |
| Client-side summary cost | Pure functions, indexes, caching, and eventual backend support |
| Loss of linkage between views | Original URIs as the source of selection identity (§3.6) |
| Persistence incompatibility | Versioned declarative state; migration only when concretely required |
| More controls and cognitive load | Adaptive defaults, *progressive disclosure*, and contextual legend (§3.5) |
| Excessive scope | Incremental implementation with evaluation gates per phase |

## 7. Open questions

- Does the RDF source provide sufficiently complete and reliable `rdf:type` data?
- Which tasks would justify adding an endpoint-computed global summary alongside the current visible-batch summary?
- Which entities are considered main entities in a query with several URI variables?
- How should multiple membership be represented without duplicating entities?
- Which blank-node patterns should collapse by default?
- Should semantic zoom be automatic, manual, or a combination of both?
- Which real tasks will users perform to evaluate the view?

These questions require representative datasets and user testing before the
final architecture can be settled.

## 8. Bibliographic references

Unified list of cited sources. Entries marked **(external)** do not belong to
the thesis literature review; they were added where that topic lacked a primary
source in the review, and each has an archived public copy.

- Andrienko, N., Andrienko, G., and Gatalsky, P. (2003). *Exploratory spatio-temporal visualization: an analytical review*. Journal of Visual Languages and Computing, 14, 503-541. <https://doi.org/10.1016/S1045-926X(03)00046-6>
- Antoniazzi, F., and Viola, F. (2018). *RDF Graph Visualization Tools: a Survey*. Proceedings of the 23rd FRUCT Conference, 25-36. <https://doi.org/10.23919/FRUCT.2018.8588069>
- Bach, B., Dragicevic, P., Archambault, D., Hurter, C., and Carpendale, S. (2014). *A Review of Temporal Data Visualizations Based on Space-Time Cube Operations*. EuroVis 2014 (STAR). <https://doi.org/10.2312/eurovisstar.20141171>
- Beck, F., Burch, M., Diehl, S., and Weiskopf, D. (2017). *A Taxonomy and Survey of Dynamic Graph Visualization*. Computer Graphics Forum, 36(1), 133-159. <https://doi.org/10.1111/cgf.12791>
- Compieta, P., Di Martino, S., Bertolotto, M., Ferrucci, F., and Kechadi, T. (2007). *Exploratory spatio-temporal data mining and visualization*. Journal of Visual Languages and Computing, 18, 255-279. <https://doi.org/10.1016/j.jvlc.2007.02.006>
- De Donato, R., Garofalo, M., Malandrino, D., Pellegrino, M. A., Petta, A., and Scarano, V. (2020). *QueDI: From Knowledge Graph Querying to Data Visualization*. SEMANTiCS 2020, LNCS 12378, 70-86. <https://doi.org/10.1007/978-3-030-59833-4_5>
- Dunne, C., and Shneiderman, B. (2013). *Motif Simplification: Improving Network Visualization Readability with Fan, Connector, and Clique Glyphs*. CHI 2013, 3247-3256. **(external)** <https://doi.org/10.1145/2470654.2466444>
- Frasincar, F., Telea, A., and Houben, G.-J. (2006). *Adapting Graph Visualization Techniques for the Visualization of RDF Data*. In *Visualizing the Semantic Web* (2nd ed.), Springer, 154-171.
- Ghoniem, M., Fekete, J.-D., and Castagliola, P. (2004). *A Comparison of the Readability of Graphs Using Node-Link and Matrix-Based Representations*. **(external)** <https://doi.org/10.1109/INFVIS.2004.1>
- Hadlak, S., Schumann, H., and Schulz, H.-J. (2015). *A Survey of Multi-faceted Graph Visualization*. EuroVis 2015 (STAR). <https://doi.org/10.2312/eurovisstar.20151109>
- Kapler, T., and Wright, W. (2005). *GeoTime Information Visualization*. Information Visualization, 4(2), 136-146. <https://doi.org/10.1057/palgrave.ivs.9500097>
- Li, Z., Wang, X., Wang, M., Yang, Y., Li, B., and Han, D. (2024). *VQFT: A Visual Query Approach Based on Full-Text Search for Knowledge Graphs*. PVLDB, 17(12), 4397-4400. <https://doi.org/10.14778/3685800.3685884>
- Loubier, E., and Dousset, B. (2008). *Temporal and relational data representation by graph morphing*. ESREL 2008 (cited through Beck et al., 2017).
- Lund, K. N., Rosenfjeld, M., Vendelsøe, A. N. H., Sørensen, E. B., Walsh, G., Kusnick, J., and Jänicke, S. (2024). *Visualizing Property Assessments and Taxation: A Danish Case Study*. EuroVis 2024 Posters. <https://doi.org/10.2312/evp.20241097>
- Menin, A., Ayari, H., Michel, F., and Winckler, M. (2023). *Using Polymorphic Glyphs to Support the Visual Exploration of Hierarchical Spatio-Temporal Data*. INTERACT 2023, LNCS, 325-329. <https://doi.org/10.1007/978-3-031-42293-5_31>
- Orlando, D., Ormachea, J., Soliani, V., and Vaisman, A. (2024). *TGV: A Visualization Tool for Temporal Property Graph Databases*. Information Systems Frontiers, 26(4), 1543-1564. <https://doi.org/10.1007/s10796-023-10426-1>
- Persson, M. (2020). *A Survey of Methods for Visualizing Spatio-temporal Data*. Master's thesis, Linköping University (LiU-ITN-TEK-A--20/019--SE).
- Schulz, H.-J., Hadlak, S., and Schumann, H. (2013). *A Visualization Approach for Cross-level Exploration of Spatiotemporal Data*. i-KNOW '13. <https://doi.org/10.1145/2494188.2494199>
- Sheng, S., Zhou, P., and Wu, X. (2019). *CEPV: A Tree Structure Information Extraction and Visualization Tool for Big Knowledge Graph*. IEEE ICBK 2019, 221-228. <https://doi.org/10.1109/ICBK.2019.00037>
- Shneiderman, B. (1996). *The Eyes Have It: A Task by Data Type Taxonomy for Information Visualizations*. IEEE Symposium on Visual Languages. **(external)** <https://doi.org/10.1109/VL.1996.545307>
- Vargas, H., Buil-Aranda, C., Hogan, A., and López, C. (2019). *RDF Explorer: A Visual SPARQL Query Builder*. ISWC 2019, LNCS 11778, 647-663. <https://doi.org/10.1007/978-3-030-30793-6_37>
- Wang, S., Li, W., and Gu, Z. (2023). *GeoGraphViz: Geographically constrained 3D force-directed graph for knowledge graph visualization*. Transactions in GIS, 27(4), 931-948. <https://doi.org/10.1111/tgis.13053>
- Wang, X., Wang, X., Li, Z., and Han, D. (2023). *KGNav: A Knowledge Graph Navigational Visual Query System*. PVLDB, 16(12), 3946-3949. <https://doi.org/10.14778/3611540.3611592>
- Wiens, V., Lohmann, S., and Auer, S. (2017). *Semantic Zooming for Ontology Graph Visualizations*. K-CAP. **(external)** <https://doi.org/10.1145/3148011.3148015>
- Yacoubi Ayadi, N., Graux, D., and Faron, C. (2022). *Multi-Level Visual Tours of Weather Linked Data*. VOILA 2022, CEUR Workshop Proceedings, Vol. 3253, 52-57. <https://ceur-ws.org/Vol-3253/paper5.pdf>
