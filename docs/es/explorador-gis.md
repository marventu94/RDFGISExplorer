# GIS Explorer Frontend

Aplicación Angular standalone para explorar resultados SPARQL en vistas
coordinadas de tabla, grafo, mapa y línea temporal. Incluye lotes globales,
resumen y export completo a XLSX.

```bash
pnpm run dev:gis-standalone
pnpm --dir products/gis-explorer/frontend test
pnpm --dir products/gis-explorer/frontend build
```

En standalone usa `/api` y escucha en `:4202`. Integrada, el Shell configura
`/gis-api` y ofrece persistencia mediante el platform bridge.

## Limitaciones conocidas: lotes y estructura del grafo

Las cuatro vistas comparten un lote de **filas del resultado**, en el orden de
la consulta. Un lote no representa una cantidad fija de avisos o inmuebles:
una entidad puede ocupar varias filas, y sus filas pueden repartirse entre
lotes. El grafo aplica además un límite independiente de nodos
(`GIS_GRAPH_MAX_NODES`, 300 por defecto). Por eso, un lote de 300 filas puede
contener muchos más de 300 nodos.

Seleccionar una entidad en el mapa, la tabla o la línea temporal incorpora su
nodo al grafo general y lo enfoca cuando termina el layout. Sus vecinos pueden
seguir fuera por el límite del grafo, por lo que puede aparecer como un punto
aislado mientras otra entidad muestra varias relaciones. Esto no significa
que la entidad seleccionada carezca de relaciones en el resultado recuperado.

Usá **Ver estructura** (**View structure** en inglés) para inspeccionar la
entidad seleccionada y explorar sus relaciones disponibles dentro del
presupuesto propio de esa vista. Pasar a otro lote cambia el contexto
disponible, pero no garantiza que todas las relaciones entren en el grafo
general. La exploración usa el resultado recuperado sin consultar datos SPARQL
adicionales; un resultado truncado por el backend o una proyección parcial
pueden dejar relaciones fuera de lo disponible.

### Por qué los lotes no se deducen como objetos

El loteo por objetos no está implementado. Requeriría una identidad explícita
de agrupación: en C1 de GraphDB (casas en venta en Berisso), `?listing`
agruparía las filas por aviso, mientras que `?realEstate` las agruparía por
inmueble y reuniría los avisos que lo referencian.

Compartir ciudad, origen o clases no establece límites de objeto; agrupar
componentes conectados completos podría reunir muchos inmuebles. La
proveniencia de las filas y las relaciones dirigidas de la consulta permiten
sugerir una entidad principal, pero no determinar el objeto de negocio que el
usuario pretende para cualquier consulta. El selector de entidad principal
existente permite coordinar selecciones; no cambia el loteo por filas.

Por ahora, los lotes de filas y el límite del grafo se mantienen como
limitaciones independientes y documentadas, con **Ver estructura** como flujo
de inspección detallada. Un futuro modo de loteo por objetos necesitaría una
variable explícita de agrupación, seguiría respetando los presupuestos de
renderizado y no podría garantizar objetos completos con resultados truncados.
