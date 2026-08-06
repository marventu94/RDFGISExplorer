# Decisiones técnicas para la visualización de grafos en RDF GIS Explorer

## 1. Propósito y alcance

El presente documento constituye el registro autocontenido de las decisiones
técnicas que gobiernan la representación visual de los resultados SPARQL en la
vista de grafo de RDF GIS Explorer. Cada decisión se acompaña de su
fundamentación en la literatura científica y de su estado de implementación,
de modo que toda elección resulte trazable y defendible.

El documento se circunscribe a la vista de grafo: selección de elementos,
agregación, disposición espacial (*layout*), codificación visual e integración
con las demás vistas. Las decisiones de nivel de producto —composición de
vistas, alcance analítico, paginación por lotes y persistencia— se documentan
por separado en `design-decisions.md`.

Las fuentes citadas provienen de la revisión de literatura realizada en el
marco de la tesis, complementada con un conjunto reducido de referencias
externas, incorporadas únicamente cuando la línea temática correspondiente
carece de fuente primaria dentro de dicha revisión. Las referencias externas
se identifican como tales en la sección 7.

El estado de cada decisión se declara mediante dos categorías: **vigente**
(implementada en el código actual) y **propuesta** (posible mejora aprobada
como diseño, pero pendiente y fuera de la implementación actual).

## 2. Criterios de calidad para una vista de grafo

La literatura sobre visualización de grafos y grafos de conocimiento converge
en cinco criterios que estructuran las decisiones de este documento:

1. **Escalabilidad perceptual.** El factor limitante no es la capacidad de
   renderizado sino la comprensión humana; la respuesta adecuada consiste en
   selección y abstracción, no en incrementar la cantidad de elementos
   dibujados (decisiones 3.1, 3.2 y 3.3).
2. **Fidelidad a la consulta.** La relevancia de un elemento es *query-aware*:
   la vista debe explicar por qué dichos elementos forman parte del resultado
   (decisión 3.2).
3. **Proveniencia.** Todo agregado debe ser exacto, reversible y explicable
   (decisiones 3.3 y 3.8).
4. **Estabilidad cognitiva.** Las posiciones y transiciones deben preservar
   el mapa mental del usuario (decisiones 3.4 y 3.5).
5. **Coordinación sin fusión.** El grafo convive con las vistas de tabla,
   mapa y línea temporal sin absorber las tareas de estas (decisiones 3.6 y
   3.7).

El principio de centralidad de la consulta se apoya en la línea de sistemas
de consulta visual sobre grafos de conocimiento, cuya evidencia empírica
indica que construir y explorar consultas mediante representaciones gráficas
resulta más aprendible y práctico que la escritura directa de SPARQL (Vargas
et al., 2019; Wang, Wang, Li y Han, 2023; Li, Z. et al., 2024; De Donato et
al., 2020; Orlando et al., 2024).

## 3. Decisiones de diseño

### 3.1. Node-link como representación principal

**Fundamento.** Los diagramas node-link resultan superiores a las matrices de
adyacencia en tareas de seguimiento de caminos sobre grafos de tamaño reducido
o dispersos (Ghoniem et al., 2004). Las matrices, por su parte, facilitan la
detección de densidad y de bloques en regiones densas, y las representaciones
híbridas node-link–matriz han demostrado su viabilidad (Beck et al., 2017;
Bach et al., 2014). La aceleración de renderizado (p. ej., WebGL) no resuelve
las limitaciones perceptuales: la escalabilidad visual depende de la cantidad
de nodos y de la densidad de aristas, no de la velocidad de dibujo (Beck et
al., 2017).

**Decisión.** Se adopta Cytoscape.js con representación node-link como forma
principal para esta implementación.

**Estado:** vigente (node-link).

### 3.2. Presupuesto visual query-aware en lugar del grafo completo

**Fundamento.** Incrementar la cantidad de elementos dibujados no mejora la
comprensión: los algoritmos de disposición espacial se degradan entre decenas
y centenas de nodos (Frasincar et al., 2006; Antoniazzi y Viola, 2018), la
densidad de aristas constituye el segundo parámetro crítico de escalabilidad
(Beck et al., 2017) y la saturación visual interactiva se manifiesta por
encima de aproximadamente 800 nodos (Wang, Li y Gu, 2023). Las herramientas
que escalan con éxito lo hacen mediante subselección orientada a la pregunta
del usuario y no por centralidad global (Antoniazzi y Viola, 2018 —RelFinder—;
Sheng et al., 2019 —CEPV—; Kapler y Wright, 2004 —GeoTime—; Orlando et al.,
2024 —TGV—). Respecto de quién determina el contenido de la porción visible,
la literatura propone el interés declarado por el usuario, ya sea de forma
relativa —mediante el orden de presentación— o absoluta —mediante la fijación
explícita de instancias (*pinning*)— (Schulz et al., 2013).

**Decisión.** El recorte vigente de «los N nodos de mayor grado» se reemplaza
por un presupuesto de entidades explícitas, agregados y aristas, con el
siguiente orden de prioridad: (i) nodo seleccionado y nodos fijados; (ii)
entidades principales de las filas visibles de la consulta; (iii) nodos
intermedios necesarios para conservar la topología de la consulta; (iv)
caminos acotados entre entidades prioritarias; (v) contexto por relevancia;
(vi) grado únicamente como criterio de desempate. La selección se implementa
como función pura que registra las razones de inclusión de cada elemento y
métricas de cobertura.

**Estado:** vigente parcial. Se encuentra implementada la reserva de
presupuesto para el nodo seleccionado y los fijados —que permanecen visibles
incluso con grado cero— sobre una función pura de selección; la priorización
query-aware completa (nodos intermedios y caminos por encima del contexto por
grado) permanece propuesta. Hasta su implementación, continúa vigente el
recorte por grado (`limits.graphMaxNodes`, 300 por defecto).

### 3.3. Agregación reversible con proveniencia exacta

**Fundamento.** La técnica de referencia para la simplificación de patrones
repetitivos es *motif simplification*, con glifos para abanicos, conectores y
cliques (Dunne y Shneiderman, 2013). El corpus aporta instancias de estas
simplificaciones en herramientas RDF (Antoniazzi y Viola, 2018 —agrupación de
relaciones paralelas en LOD Live—; Orlando et al., 2024 —colapso de nodos
estructurales en TGV—) y resúmenes por firma estructural de predicados (Wang,
Wang, Li y Han, 2023 —KGNav—). La literatura exige que todo agregado conserve
proveniencia exacta y reversibilidad (Schulz et al., 2013; Yacoubi et al.,
2022), faceta reconocida como escasamente trabajada en visualización de
grafos (Hadlak et al., 2015). Asimismo, el contenido de un resumen depende de
la tarea que se pretende apoyar (Yacoubi et al., 2022; Mulholland et al.,
2024).

**Decisión.** Se adoptan supernodos —por clase RDF confiable, con alternativa
explícita por variable SPARQL o por firma de propiedades debidamente
etiquetada como inferida—, super-aristas con multiplicidad exacta por
predicado y dirección, y colapso de motivos repetitivos. Todo agregado
registra: criterio y origen de agrupación, cantidad de entidades y de
tripletas representadas, predicados y direcciones contenidos, mecanismo de
recuperación de los miembros originales y estado de expansión o contracción.
Se priorizan las super-aristas lógicas inspeccionables por sobre el *edge
bundling* geométrico, dado que este último puede sugerir conectividad
inexistente —criterio propio del proyecto; el beneficio del bundling en la
reducción de saturación sí se encuentra documentado (Hadlak et al., 2015;
Bach et al., 2014)—.

**Estado:** vigente parcial. Se implementaron super-aristas exactas y
reversibles por click, con proveniencia de miembros y multiplicidad. Quedan
pendientes los abanicos de hojas, grupos por variable SPARQL, grupos por clase
RDF, firmas de propiedades y motivos de blank nodes.

### 3.4. Layout adaptado a la topología y estable

**Fundamento.** No existe un método de disposición universalmente adecuado: la
técnica apropiada depende de la pregunta a responder, de la estructura y del
tamaño de los datos (Frasincar et al., 2006; Beck et al., 2017; Hadlak et al.,
2015). La preservación del mapa mental resulta beneficiosa, si bien su efecto
depende de la tarea (Beck et al., 2017); las técnicas de referencia son el
*morphing* animado con un grafo global como ancla y la estabilización de
layouts (Loubier y Dousset, 2008; Bach et al., 2014; Hadlak et al., 2015).

**Decisión.** La estrategia de disposición se selecciona según la topología
visible: sin aristas, disposición en grilla; resúmenes o grafos acíclicos
dirigidos, disposición por capas (Dagre o ELK); grafos cíclicos o
heterogéneos, fCoSE; expansiones locales, recálculo únicamente sobre los
elementos nuevos; componentes desconectados, empaquetamiento de componentes.
Las reglas de estabilidad son: ausencia de recálculo global ante selección o
foco; recálculo global solo por acción explícita del usuario o por consulta
nueva; respeto de las posiciones manuales. La incorporación de toda nueva
extensión de layout queda condicionada a un benchmark comparativo y a la
verificación de compatibilidad con Native Federation.

**Estado:** vigente parcial. La disposición inicial se elige por topología:
grilla sin aristas, Dagre para grafos acíclicos y Cola para grafos cíclicos o
con bucles. El usuario puede cambiarla explícitamente y se conserva la
estabilidad incremental. fCoSE y el empaquetamiento dedicado de componentes
siguen pendientes de benchmark.

### 3.5. Progressive disclosure con niveles explícitos

**Fundamento.** El patrón «overview first, zoom and filter, then details on
demand» (Shneiderman, 1996) se encuentra documentado de forma transversal en
la literatura (Lund et al., 2024; Andrienko et al., 2003; Persson, 2020;
Schulz et al., 2013; Yacoubi et al., 2022; Orlando et al., 2024). El *semantic
zoom* es infrecuente en herramientas de grafos de conocimiento (Wiens et al.,
2017); de las quince herramientas RDF revisadas por Antoniazzi y Viola (2018),
ninguna lo implementa. Existen, no obstante, instancias cercanas —glifos
polimórficos cuya representación cambia con el nivel de zoom (Menin et al.,
2023)— y alternativas que exhiben todos los niveles de granularidad
simultáneamente (Schulz et al., 2013). En materia de etiquetas, la evidencia
se encuentra en tensión: la presentación bajo demanda cuenta con precedentes
(Frasincar et al., 2006; Kapler y Wright, 2004), pero un estudio citado por
Beck et al. (2017) halló que las etiquetas permanentemente visibles superan a
las bajo demanda en diagramas node-link animados.

**Decisión.** Se establecen tres niveles de detalle —Resumen, Exploración y
Detalle— con histéresis entre umbrales de zoom, control explícito para fijar
el nivel, leyenda e indicadores de la cantidad de elementos ocultos. La
política de etiquetas se determinará mediante pruebas de usuario, en lugar de
asumir una regla única.

**Estado:** vigente parcial. Se implementaron los niveles explícitos Resumen,
Exploración y Detalle, con leyenda y persistencia. Resumen oculta etiquetas y
Detalle agrega etiquetas de predicados; el semantic zoom automático con
histéresis queda pendiente de validación con usuarios.

### 3.6. La dimensión geográfica no determina la posición de los nodos

**Fundamento.** La combinación de fuerzas semánticas y geográficas en un
mismo layout degrada una u otra dimensión: GeoGraphViz formaliza y mide dicha
tensión —clusters semánticos frente a fidelidad geográfica— y recomienda
aplicar una única fuerza cuando ambas estructuras difieren (Wang, Li y Gu,
2023). La composición equilibrada documentada en la literatura es la
yuxtaposición de mapa y grafo abstracto con vínculos visuales (Hadlak et al.,
2015), patrón ya aplicado en la separación deliberada del análisis
georreferenciado del abstracto (Compieta et al., 2007) y en la integración
coordinada de información geográfica y relacional (Kapler y Wright, 2004).

**Decisión.** El mapa y el grafo permanecen como vistas especializadas
coordinadas mediante selección y foco compartidos (*linking & brushing*;
Hadlak et al., 2015; Andrienko et al., 2003). Las entidades con coordenadas
exhiben una marca visual en el grafo, no una posición geográfica; los flujos
geográficos agregados se representan exclusivamente en el mapa.

**Estado:** vigente.

### 3.7. Integridad semántica previa a toda abstracción

**Fundamento.** Una visualización clara de datos incorrectamente clasificados
resulta inferior a una representación menos elaborada de datos correctos
(criterio propio del proyecto). La tolerancia a datos imperfectos —bucles,
relaciones duplicadas, asimetrías— constituye un requisito documentado en
grafos de conocimiento reales (Sheng et al., 2019), y la marcación visual de
los datos agregados o proyectados es obligatoria para no confundirlos con
datos recolectados (Schulz et al., 2013).

**Decisión.** Con anterioridad a cualquier agrupamiento por clase, el
contrato de datos distingue sin ambigüedad la variable de origen de la clase
RDF: `NormalizedNode` registra `queryVariable` (variable SPARQL que originó
el nodo), `classes` (identificadores URI de clase afirmados en la consulta
mediante patrones `?x a <Clase>`) y `classification.source` ∈ {rdf-type,
query-variable, property-signature, unknown}. Complementariamente, se
normalizaron los blank nodes entre bindings y grafo, se corrigió la
atribución de literales, fechas y coordenadas al sujeto correcto en filas
con múltiples entidades, y se verificó la inexistencia de *mapping overrides*
que debiliten la topología extraída del patrón SPARQL.

**Estado:** vigente (contrato implementado en `packages/contracts`, con
backend y vistas migradas). Resta validar la cobertura efectiva de `rdf:type`
en los conjuntos de datos antes de habilitar el agrupamiento por clase
(decisión 3.3).

## 4. Posibles mejoras futuras

Las siguientes mejoras no forman parte de la implementación actual. Podrán
evaluarse en una fase posterior únicamente con datos representativos,
benchmarks y tareas de usuario que justifiquen su incorporación:

- Completar la selección query-aware con caminos relevantes entre entidades.
- Agregar abanicos de hojas, grupos por variable, supernodos por clase RDF,
  firmas de propiedades y motivos de blank nodes.
- Evaluar fCoSE, ELK y un empaquetamiento específico de componentes
  desconectados.
- Incorporar semantic zoom automático con histéresis entre niveles.
- Resolver mediante pruebas de usuario la política definitiva de etiquetas.
- Incorporar una representación matricial solo si una tarea de conectividad o
  densidad demuestra que node-link resulta insuficiente.

## 5. Métricas de evaluación

Las decisiones en estado propuesta se validarán mediante tareas y mediciones,
no mediante inspección visual de capturas. Este criterio responde a que los
benchmarks de consulta sobre grafos de conocimiento se concentran en la
velocidad de ejecución y descuidan la complejidad de construcción y
comprensión (Li, Z. et al., 2024).

- **Efectividad:** porcentaje de entidades principales y de caminos de la
  consulta preservados; visibilidad permanente de la selección y los nodos
  fijados; exactitud de los conteos en agregados; posibilidad de recuperar
  cada elemento agregado; tiempo y tasa de errores al localizar una relación
  entre dos entidades y al identificar los tipos y predicados dominantes.
- **Legibilidad:** cantidad de cruces de aristas explícitas; superposición de
  etiquetas; cantidad de elementos visibles por nivel; proporción de aristas
  agregadas respecto de las explícitas; estabilidad de posiciones entre
  expansiones.
- **Rendimiento:** tiempo hasta la primera vista útil; duración del layout
  inicial e incremental; frecuencia de cuadros durante desplazamiento y zoom;
  consumo de memoria en los límites configurados; costo de construcción de
  resúmenes y detección de motivos.
- **Usabilidad:** cantidad de expansiones requeridas para completar una
  tarea; capacidad del usuario para explicar el contenido de un supernodo;
  capacidad de retorno a un estado anterior; comprensión de la distinción
  entre resultado, lote, entidad explícita y agregado.

## 6. Riesgos y estrategias de mitigación

| Riesgo | Estrategia de mitigación |
|--------|--------------------------|
| Clasificación RDF ausente o incorrecta | Alternativa explícita por variable o firma; nunca presentarla como clase (§3.8) |
| Agregados que ocultan excepciones | Conteos exactos, expansión reversible e indicadores de heterogeneidad (§3.3) |
| Cambios de zoom impredecibles | Histéresis, transiciones y control manual (§3.5) |
| Costo del resumen en el cliente | Funciones puras, índices, caché y eventual soporte del backend |
| Pérdida del enlace entre vistas | Identidad mediante URIs originales como fuente de selección (§3.6) |
| Incompatibilidad de la persistencia | Estado declarativo versionado; migración únicamente ante necesidad concreta |
| Incremento de controles y carga cognitiva | Valores por defecto adaptativos, *progressive disclosure* y leyenda contextual (§3.5) |
| Alcance excesivo | Implementación incremental con puntos de evaluación por fase |

## 7. Cuestiones abiertas

- ¿Ofrece la fuente RDF un `rdf:type` suficientemente completo y confiable?
- ¿Debe el resumen construirse sobre el lote visible, sobre el resultado
  recibido, o mediante agregados del endpoint sobre el resultado completo?
- ¿Qué entidades se consideran principales en una consulta con varias
  variables de tipo URI?
- ¿Cómo representar la membresía múltiple sin duplicar entidades?
- ¿Qué patrones de blank nodes deben colapsarse de manera predeterminada?
- ¿Corresponde semantic zoom automático, expansión manual, o una combinación
  de ambos?
- ¿Qué estado de expansión debe persistirse en los tableros?
- ¿Qué tareas reales emplearán los usuarios para evaluar la vista?

Estas cuestiones deberán resolverse con conjuntos de datos representativos y
pruebas de usuario antes de cerrar la arquitectura final.

## 8. Referencias bibliográficas

Lista unificada de fuentes citadas. Las entradas marcadas como **(externa)**
no pertenecen a la revisión de literatura de la tesis; se incorporan porque la
línea temática correspondiente carece de fuente primaria en dicha revisión, y
todas disponen de copia pública archivada.

- Andrienko, N., Andrienko, G. y Gatalsky, P. (2003). *Exploratory
  spatio-temporal visualization: an analytical review*. Journal of Visual
  Languages and Computing, 14, 503-541.
  <https://doi.org/10.1016/S1045-926X(03)00046-6>
- Antoniazzi, F. y Viola, F. (2018). *RDF Graph Visualization Tools: a
  Survey*. Proceedings of the 23rd FRUCT Conference, 28-38.
- Bach, B., Dragicevic, P., Archambault, D., Hurter, C. y Carpendale, S.
  (2014). *A Review of Temporal Data Visualizations Based on Space-Time Cube
  Operations*. EuroVis 2014 (STAR).
- Beck, F., Burch, M., Diehl, S. y Weiskopf, D. (2017). *A Taxonomy and Survey
  of Dynamic Graph Visualization*. Computer Graphics Forum, 36(1), 133-159.
  <https://doi.org/10.1111/cgf.12791>
- Compieta, P., Di Martino, S., Bertolotto, M., Ferrucci, F. y Kechadi, T.
  (2007). *Exploratory spatio-temporal data mining and visualization*. Journal
  of Visual Languages and Computing, 18, 255-279.
  <https://doi.org/10.1016/j.jvlc.2007.02.006>
- De Donato, R., Garofalo, M., Malandrino, D., Pellegrino, M. A., Petta, A. y
  Scarano, V. (2020). *QueDI: From Knowledge Graph Querying to Data
  Visualization*. SEMANTiCS 2020, LNCS 12378, 70-86.
  <https://doi.org/10.1007/978-3-030-59833-4_5>
- Dunne, C. y Shneiderman, B. (2013). *Motif Simplification: Improving Network
  Visualization Readability with Fan, Connector, and Clique Glyphs*.
  **(externa)** <https://doi.org/10.1145/2470654.2466444>
- Frasincar, F., Telea, A. y Houben, G.-J. (2006). *Adapting Graph
  Visualization Techniques for the Visualization of RDF Data*. En *Visualizing
  the Semantic Web* (2nd ed.), Springer, 154-171.
- Ghoniem, M., Fekete, J.-D. y Castagliola, P. (2004). *A Comparison of the
  Readability of Graphs Using Node-Link and Matrix-Based Representations*.
  **(externa)** <https://doi.org/10.1109/INFVIS.2004.1>
- Guo, D., Gahegan, M., MacEachren, A. M. y Zhou, B. (2005). *Multivariate
  Analysis and Geovisualization with an Integrated Geographic Knowledge
  Discovery Approach*. Cartography and Geographic Information Science, 32(2),
  113-132. <https://doi.org/10.1559/1523040053722150>
- Hadlak, S., Schumann, H. y Schulz, H.-J. (2015). *A Survey of Multi-faceted
  Graph Visualization*. EuroVis 2015 (STAR).
  <https://doi.org/10.2312/eurovisstar.20151109>
- Kapler, T. y Wright, W. (2004). *GeoTime Information Visualization*. IEEE
  InfoVis 2004.
- Li, Z., Wang, X., Wang, M., Yang, Y., Li, B. y Han, D. (2024). *VQFT: A
  Visual Query Approach Based on Full-Text Search for Knowledge Graphs*.
  PVLDB, 17(12), 4397-4400. <https://doi.org/10.14778/3685800.3685884>
- Loubier, E. y Dousset, B. (2008). *Temporal and relational data
  representation by graph morphing*. ESREL 2008 (citado según Beck et al.,
  2017).
- Lund, K. N., Rosenfjeld, M., Vendelsøe, A. N. H., Sørensen, E. B., Walsh,
  G., Kusnick, J. y Jänicke, S. (2024). *Visualizing Property Assessments and
  Taxation: A Danish Case Study*. EuroVis 2024 Posters.
  <https://doi.org/10.2312/evp.20241097>
- Menin, A., Ayari, H., Michel, F. y Winckler, M. (2023). *Using Polymorphic
  Glyphs to Support the Visual Exploration of Hierarchical Spatio-Temporal
  Data*. INTERACT 2023, LNCS, 325-329.
  <https://doi.org/10.1007/978-3-031-42293-5_31>
- Mulholland, P., Van Kranenburg, P., Carvalho, J. y Daga, E. (2024).
  *Supporting the End-User Curation of Cultural Heritage Knowledge Graphs*.
  ACM HT '24. <https://doi.org/10.1145/3648188.3675132>
- Orlando, D., Ormachea, J., Soliani, V. y Vaisman, A. (2024). *TGV: A
  Visualization Tool for Temporal Property Graph Databases*. Information
  Systems Frontiers, 26(4), 1543-1564.
  <https://doi.org/10.1007/s10796-023-10426-1>
- Persson, M. (2020). *A Survey of Methods for Visualizing Spatio-temporal
  Data*. Tesis de maestría, Linköping University (LiU-ITN-TEK-A--20/019--SE).
- Schulz, H.-J., Hadlak, S. y Schumann, H. (2013). *A Visualization Approach
  for Cross-level Exploration of Spatiotemporal Data*. i-KNOW '13.
  <https://doi.org/10.1145/2494188.2494199>
- Sheng, S., Zhou, P. y Wu, X. (2019). *CEPV: A Tree Structure Information
  Extraction and Visualization Tool for Big Knowledge Graph*. IEEE ICBK 2019,
  221-228. <https://doi.org/10.1109/ICBK.2019.00037>
- Shneiderman, B. (1996). *The Eyes Have It: A Task by Data Type Taxonomy for
  Information Visualizations*. IEEE Symposium on Visual Languages.
  **(externa)** <https://doi.org/10.1109/VL.1996.545307>
- Vargas, H., Buil-Aranda, C., Hogan, A. y López, C. (2019). *RDF Explorer: A
  Visual SPARQL Query Builder*. ISWC 2019.
- Wang, S., Li, W. y Gu, Z. (2023). *GeoGraphViz: Geographically constrained
  3D force-directed graph for knowledge graph visualization*. Transactions in
  GIS, 27(4), 931-948. <https://doi.org/10.1111/tgis.13053>
- Wang, X., Wang, X., Li, Z. y Han, D. (2023). *KGNav: A Knowledge Graph
  Navigational Visual Query System*. PVLDB, 16(12), 3946-3949.
  <https://doi.org/10.14778/3611540.3611592>
- Wiens, V., Lohmann, S. y Auer, S. (2017). *Semantic Zooming for Ontology
  Graph Visualizations*. K-CAP. **(externa)**
  <https://doi.org/10.1145/3148011.3148015>
- Yacoubi, N., Graux, D. y Faron, C. (2022). *Multi-Level Visual Tours of
  Weather Linked Data*. VOILA 2022, CEUR Workshop Proceedings, Vol. 3253,
  52-57.
