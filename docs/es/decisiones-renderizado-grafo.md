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
se identifican como tales en la sección 8.

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
   (decisiones 3.3 y 3.7).
4. **Estabilidad cognitiva.** Las posiciones y transiciones deben preservar
   el mapa mental del usuario (decisiones 3.4 y 3.5).
5. **Coordinación sin fusión.** El grafo convive con las vistas de tabla,
   mapa y línea temporal sin absorber las tareas de estas, ni las que
   corresponden a la construcción de la consulta (decisiones 3.6, 3.7 y 3.10).

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
Sheng et al., 2019 —CEPV—; Kapler y Wright, 2005 —GeoTime—; Orlando et al.,
2024 —TGV—). Respecto de quién determina el contenido de la porción visible,
la literatura propone el interés declarado por el usuario, ya sea de forma
relativa —mediante el orden de presentación— o absoluta —mediante la fijación
explícita de instancias (*pinning*)— (Schulz et al., 2013).

**Decisión.** El recorte vigente de «los N nodos de mayor grado» se reemplaza
por un presupuesto de entidades explícitas, agregados y aristas, con el
siguiente orden de prioridad: (i) nodo seleccionado y nodos fijados; (ii)
entidades principales de las filas visibles de la consulta; (iii) nodos
intermedios necesarios para conservar la topología de la consulta; (iv)
caminos acotados entre entidades prioritarias; (v) el contexto restante,
ordenado por grado total descendente; (vi) ante empate de grado, el orden de
entrada (ordenamiento estable, sin aleatoriedad). El grado deja así de ser el
criterio de recorte para pasar a ordenar únicamente el último bucket. La
selección se implementa como función pura que registra las razones de
inclusión de cada elemento y métricas de cobertura.

**Estado:** vigente parcial. La función pura reserva presupuesto, en este
orden, para el nodo seleccionado, las entidades que aparecen en los bindings,
los vecinos intermedios a un salto y el contexto restante por grado. Esas
cuatro son también las razones de inclusión que registra por nodo
(`selected`, `query-entity`, `intermediate`, `context`); el grado no es una
razón, es el orden del último bucket. El nodo seleccionado permanece visible
incluso con grado cero. La selección de caminos acotados entre entidades
prioritarias continúa propuesta; el límite final sigue siendo
`limits.graphMaxNodes` (300 por defecto).

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

**Estado:** vigente parcial. Se implementaron dos abstracciones exactas y
reversibles por click:

1. super-aristas para relaciones paralelas entre el mismo par de nodos;
2. motivos de componentes repetidos. Cada componente desconectado se describe
   mediante una firma que registra la cantidad de nodos por rol y la cantidad
   de aristas por rol de origen, predicado y rol de destino. El rol procede de
   la variable SPARQL; si no está disponible, se usa una clase RDF afirmada y,
   como último recurso, la marca explícita `entity`.

El motivo conserva los identificadores de cada nodo y arista, la fuente y el
valor del agrupamiento, la dirección, el predicado, la cantidad de componentes
y las cantidades exactas de entidades y tripletas. El modo Resumen muestra un
supernodo por rol —rotulado con su cantidad de miembros— y una relación
`predicado × N` por cada tipo de arista de la firma. Un click expande todos sus
componentes y otro click sobre cualquiera de sus aristas los contrae. La
selección tiene prioridad: el componente que contiene la entidad seleccionada
queda fuera del agrupamiento y se dibuja explícito. Como consecuencia, si la
firma solo tenía dos componentes y uno de ellos queda excluido por la
selección, el restante deja de alcanzar el mínimo de dos y no se agrega: al
seleccionar, ese resumen desaparece en lugar de reducirse. El estado
expandido/contraído se persiste con el tablero.

Esta segunda abstracción adapta el principio general de *motif
simplification* de Dunne y Shneiderman (2013), pero no afirma implementar sus
tres glifos específicos (abanico, conector y clique): la firma de componente
repetido es una adaptación para los resultados SPARQL evaluados. No se afirma
isomorfismo completo cuando un rol aparece varias veces; se garantiza igualdad
de la firma declarada, conteos exactos y recuperación de sus miembros. Quedan
pendientes los tres glifos de la técnica original, supernodos generales por
clase y firmas de propiedades.

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

**Estado:** vigente parcial. La disposición inicial usa Cuadrícula sin aristas
y Jerárquico (Dagre) ante cualquier relación, incluidos ciclos y bucles. Dagre
tolera esas estructuras y ofrece un punto de partida más estable; Orgánico
(Cola) permanece como alternativa manual. Cuadrícula se oculta del selector
cuando hay relaciones, salvo que sea el valor efectivo de un tablero histórico.
Los identificadores persistidos `dagre`, `cola` y `grid` conservan su semántica
y no se migran; los estados históricos se respetan. El layout real se ejecuta
después de registrar el evento de fin de
layout, de modo que el encuadre siempre ocurre sobre la geometría terminada y
ningún nodo queda en `(0,0)`.

La animación del cálculo inicial depende del layout, y la diferencia es
deliberada: Dagre y Grid se resuelven sin animar, mientras que Cola sí se anima
—con `animate: false` webcola resuelve su simulación de forma sincrónica y
puede bloquear el hilo principal—. Cola reutiliza la semilla geométrica
determinista (`randomize: false`) y dispone de hasta 4 s para converger, valor
de referencia de la extensión. En grafos de más de 100 nodos se elimina la
restricción de flujo vertical: imponer niveles a una red cíclica o heterogénea
grande estira innecesariamente la simulación. El modo Orgánico sigue siendo
una alternativa manual; el default para cualquier grafo con aristas es Dagre.

Los cambios de layout pedidos por el usuario sí se animan y se conserva la
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
(Frasincar et al., 2006; Kapler y Wright, 2005), pero un estudio citado por
Beck et al. (2017) halló que las etiquetas permanentemente visibles superan a
las bajo demanda en diagramas node-link animados.

**Decisión.** Se establecen tres niveles explícitos —Resumen, Entidades y
Entidades + relaciones— con control manual, leyenda e indicadores de cobertura.
La política de etiquetas se determinará mediante pruebas de usuario, en lugar
de asumir una regla única.

**Estado:** vigente parcial. Resumen es el nivel predeterminado: reemplaza los
motivos repetidos por agregados etiquetados y oculta las etiquetas de entidades
no agregadas. Entidades recupera la topología explícita y sus etiquetas;
Entidades + relaciones agrega los predicados. Cambiar de nivel reconstruye la
topología, recalcula el layout y restaura la cámara persistida. Dagre incluye
las dimensiones de las etiquetas y aplica separación creciente por nivel:
34/70/14, 60/95/24 y 78/125/36 para `nodeSep/rankSep/edgeSep`. La tipografía
común es 9–10 px; selección y agregados conservan 11 px y negrita. Los nombres
largos se envuelven y el tooltip conserva el valor completo. El selector
refleja siempre el estado efectivo. El semantic zoom
automático con histéresis queda pendiente de validación con usuarios.

### 3.6. La dimensión geográfica no determina la posición de los nodos

**Fundamento.** La combinación de fuerzas semánticas y geográficas en un
mismo layout degrada una u otra dimensión: GeoGraphViz formaliza y mide dicha
tensión —clusters semánticos frente a fidelidad geográfica— y recomienda
aplicar una única fuerza cuando ambas estructuras difieren (Wang, Li y Gu,
2023). La composición equilibrada documentada en la literatura es la
yuxtaposición de mapa y grafo abstracto con vínculos visuales (Hadlak et al.,
2015), patrón ya aplicado en la separación deliberada del análisis
georreferenciado del abstracto (Compieta et al., 2007) y en la integración
coordinada de información geográfica y relacional (Kapler y Wright, 2005).

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
relaciones repetidas, asimetrías— constituye un requisito documentado en
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

### 3.8. La vista de grafo como lectura del modelo de datos

**Fundamento.** RDF carece de relaciones n-arias nativas: un atributo con
unidad, procedencia o vigencia no se expresa como un literal colgado de la
entidad, sino reificado en una cadena de nodos intermedios. La consecuencia es
que la forma en que un conjunto de datos guarda un valor no es deducible del
valor. La literatura trata a esos nodos como material de primera clase —TGV
colapsa nodos estructurales para volver legible la topología (Orlando et al.,
2024) y KGNav resume por firma estructural de predicados (Wang, Wang, Li y Han,
2023)—, y la tolerancia a la irregularidad de los grafos de conocimiento
reales es un requisito documentado (Sheng et al., 2019).

**Decisión (criterio propio del proyecto).** La vista de grafo no es una
representación alternativa de las filas: es la única vista que muestra **el
camino que une una entidad con sus valores a través de los intermedios del
modelo**. Ese es su aporte diferencial frente a la tabla, el mapa y la línea
temporal, y la razón por la que permanece en el conjunto de cuatro vistas
(`design-decisions.md`, §1).

De ahí se derivan las dos preguntas que responde y que ninguna otra vista
responde:

1. **¿De dónde sale este valor?** Proveniencia estructural de un atributo. La
   tabla muestra la columna `superficieCubierta = 120`; el grafo muestra que
   ese número vive a tres saltos de la entidad, en
   `inmueble —rec:includes→ Site —inm:hasFeature→ Feature —inm:hasValue→ Spec`,
   y que la unidad de medida cuelga del mismo `Spec` por
   `gr:hasUnitOfMeasurement`. Sin la vista, el usuario no tiene modo de saber
   que la columna es el final de una cadena ni dónde intervenir si el valor es
   incorrecto.
2. **¿Todo el conjunto tiene la misma forma?** Un componente cuya firma
   estructural no coincide con el motivo dominante es una excepción de
   modelado. El nivel Resumen la delata por construcción: agrega lo que se
   repite y deja explícito lo que no, de modo que la anomalía queda visible sin
   buscarla (véase §3.3 y la interpretación de §3.9).

**Estado:** vigente. Las aristas no se infieren de la coincidencia de una fila:
`query-topology.ts` lee los patrones `?s <p> ?o` de la consulta, detecta las
variables que participan de alguna relación pero no están proyectadas —los
intermedios del modelo—, reescribe el `SELECT` para recuperarlas del endpoint y
las dibuja como nodos propios con su predicado y su dirección reales. Las filas
que recibe la tabla conservan la proyección original del usuario; el grafo
recibe la topología completa.

Esto tiene un efecto adicional sobre el nivel Resumen. Como el rol de un nodo
se toma primero de su variable SPARQL (§3.3) y cada entidad del conjunto
reproduce la misma cadena de reificación, Resumen colapsa esas cadenas en una
sola secuencia de supernodos rotulados por rol y con multiplicidades exactas
—`inmueble (N) —rec:includes ×N→ Site (N) —inm:hasFeature ×N→ …`—, es decir,
una lectura del esquema efectivo del resultado a nivel de instancias. No es un
resumen del esquema declarado por la ontología: describe exactamente lo que la
consulta trajo, con sus cantidades.

### 3.9. Interpretación de resultados relacionalmente repetitivos

Una consulta diseñada para comparar atributos puede devolver una fila lógica
por entidad y, a la vez, una topología compuesta por muchos componentes
desconectados con la misma firma. La tabla resulta entonces más eficaz para
comparar valores; esto no vuelve incorrecta a la vista de grafo, pero limita la
pregunta relacional que puede responder.

La responsabilidad se separa de la siguiente manera:

- el tablero y su consulta determinan qué entidades, relaciones y caminos
  existen en el resultado; la vista no inventa conectividad ausente;
- RDFGISExplorer debe dibujar correctamente esa estructura, explicar su
  repetición, conservar sus cantidades y permitir recuperar los miembros;
- las cuatro vistas permanecen disponibles porque responden preguntas
  complementarias: valores exactos, distribución espacial, distribución
  temporal y estructura relacional.

Por ello, Resumen no presenta cientos de copias como si fueran nodos aislados:
las expresa mediante motivos de componentes repetidos. Los niveles Entidades y
Entidades + relaciones recuperan la topología explícita. Esta abstracción no
convierte una consulta atributiva en una consulta de caminos o comunidades;
hace legible la estructura que la consulta realmente produjo.

### 3.10. Alcance: la vista explora el resultado, no recorre el grafo

**Fundamento.** La línea de sistemas de consulta visual del corpus separa dos
actividades distintas: construir la consulta de forma gráfica —RDF Explorer
(Vargas et al., 2019), KGNav (Wang, Wang, Li y Han, 2023), VQFT (Li, Z. et al.,
2024)— y visualizar su resultado —QueDI (De Donato et al., 2020), TGV (Orlando
et al., 2024)—. Recorrer el grafo más allá de lo consultado (expandir vecinos,
buscar caminos entre dos entidades arbitrarias, alcanzar profundidad variable)
pertenece a la primera: cada expansión es, en los hechos, una consulta nueva.
El criterio 5 de §2 —coordinación sin fusión— exige además que ninguna vista
absorba tareas que ya tienen su lugar.

**Decisión.** La vista de grafo de RDF GIS Explorer **no** emite consultas
propias: dibuja el resultado de la consulta del tablero y nada más. La
exploración por recorrido es responsabilidad de **RDF Explorer**, el otro
frontend de la plataforma, cuyo paradigma es precisamente ese: el usuario
extiende el grafo de la consulta arrastrando nodos y propiedades, el dominio
puro genera el SPARQL por BFS y el handoff (`toSparqlFullProjection()`) entrega
la consulta resultante al GIS. El flujo declarado del producto es
**construir → ejecutar → explorar** (`design-decisions.md`, §11), con la
construcción de un lado del handoff y las cuatro vistas coordinadas del otro.

Incorporar expansión de vecinos o búsqueda de caminos dentro de la vista de
grafo del GIS duplicaría el paradigma de construcción de consultas en las dos
herramientas y rompería esa frontera; por eso se declara **no-objetivo
explícito**, no una funcionalidad pendiente.

Conviene no confundir este límite con la decisión 3.2: los «caminos acotados
entre entidades prioritarias» que allí figuran como propuesta operan
**dentro del resultado ya recuperado** —deciden qué caminos preservar cuando el
presupuesto obliga a recortar— y no recuperan datos nuevos del endpoint.

**Estado:** vigente. La vista consume `visibleQueryResult$` y el resultado ya
recuperado, pero no dispone de ningún camino hacia el endpoint; el backend
expone `POST /api/query/execute`, `POST /api/query/summary` y
`GET /api/suggestions/*`, sin operación de vecindad ni de caminos. Las acciones
de «expandir» —motivos, super-aristas y ramas del modo entidad— son estrictamente
locales: reorganizan elementos presentes en el `QueryResult` y no piden datos.

### 3.11. Exploración local de una entidad y copia inequívoca

**Decisión.** Una selección explícita puede abrir el modo **Entidad
seleccionada**. La entrada nunca se dispara por foco coordinado. El contenido se
obtiene mediante un modelo puro y determinista que prioriza raíz, entidades de
las mismas filas, caminos e intermedios; los hubs quedan como frontera y sólo se
atraviesan mediante acción explícita. La expansión es manual, de un salto, con
presupuestos separados de nodos y aristas; raíz, activo y fijados tienen
prioridad y ningún exceso se recorta en silencio.

El estado local conserva raíz, activo, ramas expandidas/contraídas, fijados e
historial. Es transitorio: salir restaura cámara, layout y nivel del resultado,
sin cambiar consulta, filtros ni lote. La interfaz usa Jerárquico y ofrece
breadcrumb, expansión/contracción, fijación, promoción de raíz, deshacer,
restablecer y equivalentes de teclado.

Las acciones **Copiar vista actual** y **Copiar estructura completa** producen
texto estable con URIs completas y blank nodes opacos. Cada arista RDF cuenta
como tripleta; las relaciones paralelas declaran su multiplicidad. Los
atributos sin predicado conocido se presentan aparte y nunca se inventan como
tripletas. Se usa `navigator.clipboard`, luego `execCommand` como fallback y,
si ambos faltan, se expone el texto para copia manual con un mensaje accesible.

**Estado:** vigente. La selección del subgrafo (`entity-subgraph.ts`), el estado
de recorrido (`entity-exploration.ts`), el cierre de estructura disponible y el
generador de texto son funciones puras con tests. `GraphViewComponent` aporta
solamente integración Angular/Cytoscape. El umbral de hub predeterminado es 8;
el presupuesto visual local es 60 nodos/120 aristas y la estructura copiable
amplía el tope a 500/1000. Los predicados se agrupan por URI completa y usan la
etiqueta sólo como presentación.

## 4. Posibles mejoras futuras

Las siguientes mejoras no forman parte de la implementación actual. Podrán
evaluarse en una fase posterior únicamente con datos representativos,
benchmarks y tareas de usuario que justifiquen su incorporación:

- Estabilizar el primer dibujo de los grafos cíclicos, hoy no reproducible
  porque el cálculo inicial de Cola randomiza posiciones (§3.4).
- Agregar abanicos, conectores y cliques; supernodos generales por clase RDF y
  firmas de propiedades.
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
| Clasificación RDF ausente o incorrecta | Alternativa explícita por variable o firma; nunca presentarla como clase (§3.7) |
| Agregados que ocultan excepciones | Conteos exactos, expansión reversible e indicadores de heterogeneidad (§3.3) |
| Motivo expandido sin control para contraerse | Contraer exige clickear una arista que lleve su `motifId`; si la expansión supera el presupuesto de nodos, esas aristas pueden quedar recortadas y el estado expandido persiste con el tablero. Mitigación pendiente: acción explícita de contraer todo (§3.3) |
| Cambios de zoom impredecibles | Histéresis, transiciones y control manual (§3.5) |
| Costo del resumen en el cliente | Funciones puras, índices, caché y eventual soporte del backend |
| Pérdida del enlace entre vistas | Identidad mediante URIs originales como fuente de selección (§3.6) |
| Incompatibilidad de la persistencia | Estado declarativo versionado; migración únicamente ante necesidad concreta |
| Incremento de controles y carga cognitiva | Valores por defecto adaptativos, *progressive disclosure* y leyenda contextual (§3.5) |
| Alcance excesivo | Implementación incremental con puntos de evaluación por fase |

## 7. Cuestiones abiertas

- ¿Ofrece la fuente RDF un `rdf:type` suficientemente completo y confiable?
- ¿Qué tareas justificarían agregar, además del resumen vigente sobre el lote
  visible, un resumen global calculado por el endpoint?
- ¿Qué entidades se consideran principales en una consulta con varias
  variables de tipo URI?
- ¿Cómo representar la membresía múltiple sin duplicar entidades?
- ¿Qué patrones de blank nodes deben colapsarse de manera predeterminada?
- ¿Corresponde semantic zoom automático, expansión manual, o una combinación
  de ambos?
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
  Survey*. Proceedings of the 23rd FRUCT Conference, 25-36.
  <https://doi.org/10.23919/FRUCT.2018.8588069>
- Bach, B., Dragicevic, P., Archambault, D., Hurter, C. y Carpendale, S.
  (2014). *A Review of Temporal Data Visualizations Based on Space-Time Cube
  Operations*. EuroVis 2014 (STAR).
  <https://doi.org/10.2312/eurovisstar.20141171>
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
  CHI 2013, 3247-3256. **(externa)**
  <https://doi.org/10.1145/2470654.2466444>
- Frasincar, F., Telea, A. y Houben, G.-J. (2006). *Adapting Graph
  Visualization Techniques for the Visualization of RDF Data*. En *Visualizing
  the Semantic Web* (2nd ed.), Springer, 154-171.
- Ghoniem, M., Fekete, J.-D. y Castagliola, P. (2004). *A Comparison of the
  Readability of Graphs Using Node-Link and Matrix-Based Representations*.
  **(externa)** <https://doi.org/10.1109/INFVIS.2004.1>
- Hadlak, S., Schumann, H. y Schulz, H.-J. (2015). *A Survey of Multi-faceted
  Graph Visualization*. EuroVis 2015 (STAR).
  <https://doi.org/10.2312/eurovisstar.20151109>
- Kapler, T. y Wright, W. (2005). *GeoTime Information Visualization*.
  Information Visualization, 4(2), 136-146.
  <https://doi.org/10.1057/palgrave.ivs.9500097>
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
  Visual SPARQL Query Builder*. ISWC 2019, LNCS 11778, 647-663.
  <https://doi.org/10.1007/978-3-030-30793-6_37>
- Wang, S., Li, W. y Gu, Z. (2023). *GeoGraphViz: Geographically constrained
  3D force-directed graph for knowledge graph visualization*. Transactions in
  GIS, 27(4), 931-948. <https://doi.org/10.1111/tgis.13053>
- Wang, X., Wang, X., Li, Z. y Han, D. (2023). *KGNav: A Knowledge Graph
  Navigational Visual Query System*. PVLDB, 16(12), 3946-3949.
  <https://doi.org/10.14778/3611540.3611592>
- Wiens, V., Lohmann, S. y Auer, S. (2017). *Semantic Zooming for Ontology
  Graph Visualizations*. K-CAP. **(externa)**
  <https://doi.org/10.1145/3148011.3148015>
- Yacoubi Ayadi, N., Graux, D. y Faron, C. (2022). *Multi-Level Visual Tours
  of Weather Linked Data*. VOILA 2022, CEUR Workshop Proceedings, Vol. 3253,
  52-57. <https://ceur-ws.org/Vol-3253/paper5.pdf>
