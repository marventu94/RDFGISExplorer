# Decisiones de diseño

> Por qué RDFGISExplorer es como es. Cada decisión se deriva del estado del
> arte relevado en el paper DECISIONING 2026 [Venturino et al. 2026] —una
> rapid review de 30 trabajos sobre visualización de grafos de conocimiento
> (KG) con dimensiones geo-espacial (S) y temporal (T)— y se complementa con
> notas propias de ingeniería. El objetivo es que cada elección sea
> defendible en una frase: qué muestra la literatura que la motiva y qué parte
> es decisión nuestra.

**El problema que enmarca todo:** el paper muestra que solo 7 de 30 trabajos
integran grafo + espacio + tiempo (G+S+T), que cada uno lo hizo para un
dominio específico sin generalizar, y que el ecosistema de herramientas es
frágil (§3.2, §4.3, §5). De ahí salen los dos ejes del diseño: **integrar las
tres dimensiones en una interfaz** y **no atarse a un dominio ni a
componentes irreemplazables**.

---

## 1. Cuatro vistas coordinadas (tabla, mapa, grafo, timeline)

**Fundamento.** La conclusión central del paper (§5, respuesta a RQ2): las
propuestas más completas combinan *"linked views of graphs, maps, and
timelines"* y la integración G+S+T *"requires more than one technique working
together"*. Además, §4.2 señala que las vistas 2D requieren estrategias de
view-linking. Hadlak et al. [2015] formalizan el patrón: facetas balanceadas
se componen por juxtaposition en vistas coordinadas con linking & brushing.

**Nota propia.** Cuatro y no tres: sin la tabla se pierde la verificación de
valores exactos y la exportación (ver §3). Cuatro y no cinco: una vista de
agregaciones convertiría la herramienta en analítica, lo que excede el
alcance declarado (ver §2).

## 2. Alcance: exploración con estadística descriptiva (no análisis)

**Fundamento.** El propio paper muestra que el filtrado multidimensional
G+S+T *"remains a technical challenge"* (§4.2): resolver bien el lado
exploratorio ya es una contribución. Para la frontera usamos la taxonomía de
tareas de Andrienko et al. [2003]: las **tareas elementales** (inspeccionar
individuos) se responden con vistas; las **tareas generales** (preguntas
sobre el conjunto) requieren *data aggregation tools*.

**Decisión.** Las vistas filtran e inspeccionan; el panel de resumen computa
agregados sobre el resultado completo; el análisis profundo se delega al
export. Regla de honestidad asociada: **ningún número presentado como "del
resultado" se computa sobre la muestra visible** — o es sobre el total, o se
etiqueta como lote.

| Componente | Rol | ¿Filtra? | ¿Computa sobre el total? |
|------------|-----|----------|--------------------------|
| Tabla | Inspección y verificación de valores | Quick filter | No |
| Mapa | Distribución geográfica | Polígono | Agregación visual (clusters) |
| Grafo | Estructura relacional del foco | Top por conexiones | No |
| Timeline | Distribución temporal | Rango (brush) | Agregación visual |
| Panel de resumen | Estadística descriptiva | No | **Sí** (COUNT, AVG, MIN/MAX, top valores) |
| Export CSV | Materia prima para análisis externo | No | Sí (todas las filas) |

## 3. La tabla como vista (y no solo vistas visuales)

**Fundamento.** Antoniazzi & Viola [2018]: la representación tabular es la
forma más frecuente de ver resultados SPARQL, pero sola no alcanza (clutter
con pocas docenas de filas, sin vista de conjunto) — de ahí tabla *+ vistas*,
no tabla *o* vistas. El paper (§3.3) registra además interfaces tabulares
para exploración de KGs por usuarios de dominio [Mulholland et al. 2024].

**Nota propia.** La tabla cumple tres roles que ninguna otra vista cubre:
verificación de valores exactos, exportación, y filtrado rápido por texto sin
escribir SPARQL.

## 4. Timeline con brush en lugar de animación

**Fundamento.** El paper advierte que las animaciones temporales *"can make
effective comparison between temporal states difficult"* (§4.2, citando
Persson 2020) y registra la taxonomía de grafos dinámicos que contrasta
animación vs. timeline/small multiples [Beck et al. 2017].

**Decisión.** La timeline filtra por rango (brush) y el resultado se refleja
en las demás vistas coordinadas, evitando la sobrecarga cognitiva de comparar
estados animados.

## 5. Manejo de escala: cap de nodos, lotes y pinning

**Fundamento.** El paper identifica el clutter visual como barrera recurrente
que exige folding/fisheye (§4.1) y el focusing parcial es legítimo cuando el
linking lo compensa [Andrienko et al. 2003]. La paginación por porciones
acotadas es el *time chopping* de Bach et al. [2014], y dirigir qué se ve con
sorting + pinning viene de Schulz et al. [2013].

**Nota propia.** El cap de 300 nodos es decisión nuestra dentro del rango
empírico del corpus (los layouts se degradan ~100 nodos, el cómputo se
dispara ~110, el near-real-time se mantiene <800). Las 4 vistas comparten el
mismo lote de filas —la consistencia del linking se garantiza por
construcción— y el `ORDER BY` de la query del usuario dirige qué entra en
cada lote.

## 6. Panel de resumen (agregación sobre el resultado completo)

**Fundamento.** Andrienko et al. [2003]: las vistas de individuos no soportan
tareas generales; hacen falta *data aggregation tools*. QueDI [De Donato et
al. 2020] materializa el patrón: del resultado de una query a
visualizaciones y agregados computados.

**Decisión.** El backend envuelve la query del usuario como subquery y el
endpoint SPARQL computa COUNT/AVG/MIN/MAX y top valores **sobre todas las
filas del resultado**, sin transferirlas. Las variables a agregar se detectan
heurísticamente del resultado tipado (numéricas, temporales, categóricas de
baja cardinalidad): cero asunciones de dominio. Sin mediana — SPARQL 1.1 no
la incluye.

## 7. Export completo a CSV

**Fundamento.** Es la contracara de la frontera de §2: si el análisis
profundo se delega al export, exportar solo el lote visible sería entregar
una muestra arbitraria.

**Decisión (propia).** Paginación determinista del lado del endpoint: la
query se envuelve con un orden total sobre todas las variables proyectadas
(respetando el `ORDER BY` del usuario si existe) y se descarga por páginas
OFFSET/LIMIT hasta agotar el resultado. El CSV lleva encabezado de
proveniencia (endpoint, query, timestamp, filas) y marca PARCIAL si se aplicó
el tope configurable. SPARQL 1.1 estándar: funciona en cualquier endpoint.

## 8. Límites configurables por entorno

**Fundamento.** El límite configurable por el usuario aparece como patrón en
las herramientas de querying visual del corpus (ELODIE, discutida en QueDI).

**Decisión.** Todos los límites de queries y visualización (cap de nodos,
tamaño de lote, top categórico, tope y página de export, paginación de tabla)
son variables de entorno del backend expuestas a los frontends vía
`GET /api/config` (`limits`). Los defaults son las decisiones de diseño
documentadas acá; cada despliegue los ajusta sin tocar código.

## 9. Arquitectura domain-agnostic (Adapter SPARQL)

**Fundamento.** La brecha central del paper: *toda* propuesta G+S+T revisada
fue construida para un dominio específico y *"general-purpose frameworks for
spatio-temporal KG visualization remain an open research challenge"* (§5).

**Decisión.** El backend es un proxy SPARQL 1.1 genérico (patrón Adapter):
URL, credenciales, prefixes y límites por variables de entorno; el frontend
no asume nada del dominio. Validado hoy contra Wikidata y GraphDB; nuevos
endpoints se suman por configuración.

## 10. Stack web estándar y activamente mantenido

**Fundamento.** El ecosistema de herramientas es frágil: solo 5 de 15
herramientas RDF siguen activas y, de 5 herramientas post-2018 del corpus,
solo 2 siguen accesibles (§4.3).

**Decisión.** Librerías web estándar con comunidad activa (Angular, NestJS,
Cytoscape, Leaflet, vis-timeline, AG Grid) sobre protocolos estándar (SPARQL
1.1, RDF). La sostenibilidad es un requisito de diseño, no un detalle de
implementación.

## 11. Microfrontends con Native Federation

**Fundamento.** Dos ideas del paper convergen: la fragilidad del ecosistema
(§4.3) sugiere una arquitectura donde **cada parte se pueda evolucionar o
reemplazar sin reescribir la plataforma**, y la convergencia G+S+T debe ocurrir
*"within a single interface"* (RQ2) — que acá se logra a nivel de producto:
un único AppShell, un único flujo construir → ejecutar → explorar, con
handoff entre herramientas.

**Nota propia.** Son dos herramientas con ciclos de vida independientes: el
RDF Explorer (extensión del paradigma de Vargas et al. [2019]) y el dashboard
GIS pueden versionarse, desplegarse o reemplazarse por separado, y cada
remote carga solo sus dependencias pesadas (Leaflet/AG Grid en GIS).

**Costo aceptado.** La federación suma complejidad de build y de dependencias
compartidas (documentada en `AGENTS.md`). Se prefirió sobre un monolito (que
acoplaría los ciclos de vida de ambas herramientas) y sobre aplicaciones
separadas sin shell (que perdería la integración del flujo).

---

## Referencias

- **[Venturino et al. 2026]** Venturino, M.M., Firmenich, S., Torres, D.
  "Integrating Spatial and Temporal Dimensions in Knowledge Graphs through
  Visualization: Challenges and Research Opportunities." Workshop DECISIONING
  2026, Universidad de Talca. — Fuente principal de este documento.
- [Andrienko et al. 2003] "Exploratory Spatio-Temporal Visualization: An
  Analytical Review." JVLC 14(6).
- [Antoniazzi & Viola 2018] "RDF Graph Visualization Tools: A Survey."
  FRUCT 2018.
- [Hadlak et al. 2015] "A Survey of Multi-faceted Graph Visualization."
  EuroVis STARs.
- [Beck et al. 2017] "A Taxonomy and Survey of Dynamic Graph Visualization."
  Computer Graphics Forum 36(1).
- [Bach et al. 2014] "A Review of Temporal Data Visualizations Based on
  Space-Time Cube Operations." EuroVis STARs.
- [Schulz et al. 2013] "A Visualization Approach for Cross-Level Exploration
  of Spatiotemporal Data."
- [De Donato et al. 2020] "QueDI: From Knowledge Graph Querying to Data
  Visualization." SEMANTICS 2020.
- [Vargas et al. 2019] "RDF Explorer: A Visual SPARQL Query Builder."
  ISWC 2019.
- [Mulholland et al. 2024] "Supporting the End-User Curation of Cultural
  Heritage Knowledge Graphs." ACM HT 2024.
