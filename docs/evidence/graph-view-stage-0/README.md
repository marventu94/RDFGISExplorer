# Línea base de `graph-view` — etapas 0–2

Registro temporal tomado el 20 de septiembre de 2026 antes de cambiar el
layout predeterminado. Se usó el seed de evaluación existente, aplicación
local en `http://127.0.0.1:4200`, viewport de navegador de 1440 × 1100 px y un
slot de grafo de aproximadamente 718 × 480 px. Todas las capturas usan el
encuadre automático del componente.

## Resultado reproducible

| Caso | Estado persistido | Cobertura del primer lote | Observación visual en Resumen |
|---|---|---|---|
| C1 | Cola, Resumen | 300 filas; 300 de 1905 nodos; 1675 aristas ocultas | Cruces largos y componentes fuera del encuadre útil; las etiquetas comunes están ocultas. |
| C2 | Cola, Resumen | 300 filas; 300 de 1331 nodos; 1055 aristas ocultas | Hub dominante a la izquierda, abanicos superpuestos y cruces de lado a lado. |
| C3 | Cola, Resumen | 300 filas; 300 de 919 nodos; 675 aristas ocultas | Varias aristas atraviesan todo el slot y ocultan la dirección local. |
| C4 | Cola, Resumen | 300 filas; 300 de 716 nodos; 441 aristas ocultas | Hub y relaciones resaltadas compiten con el resto de la red. |

El tiempo observado desde navegación hasta primera vista útil estuvo entre
aproximadamente 6 y 13 segundos por tablero en esta máquina. La primera carga
de C1 incluyó el arranque de Chromium y no se usa como medición de layout. El
frontend no expone una marca separada para distinguir consulta, construcción y
layout, por lo que estos tiempos sirven sólo como referencia operativa y no
como benchmark.

Capturas comparables:

- [C1, Resumen](c1-before-summary.png)
- [C2, Resumen](c2-before-summary.png)
- [C3, Resumen](c3-before-summary.png)
- [C4, Resumen](c4-before-summary.png)
- [C1, Entidades](c1-before-entities.png)
- [C1, Entidades + relaciones](c1-before-relations.png)

Comparación post-cambio con Jerárquico, mismo viewport y nivel Resumen:

- [C1, Jerárquico](c1-after-hierarchical-summary.png)
- [C2, Jerárquico](c2-after-hierarchical-summary.png)
- [C3, Jerárquico](c3-after-hierarchical-summary.png)
- [C4, Jerárquico](c4-after-hierarchical-summary.png)

En los cuatro casos el selector mostró sólo Jerárquico y Orgánico, con nombre
y descripción, sin exponer `dagre`, `cola` ni `grid`. C2 mostró la mejora más
clara en lectura de dirección y caminos. C1, C3 y C4 siguen limitados por el
presupuesto de 300 nodos y la densidad del primer lote: Jerárquico estabiliza
la dirección, pero no elimina los cruces propios del volumen. Esto no se
resuelve aumentando separación; corresponde a las etapas posteriores de
selección/subgrafo y queda fuera de este cambio.

## Niveles y coordinación

- Resumen oculta etiquetas comunes y conserva las de motivos agregados. Reduce
  texto, pero Cola sigue produciendo cruces sistemáticos en los cuatro casos.
- Entidades recupera nodos y etiquetas; en C1 las etiquetas largas se
  superponen porque el layout no reserva espacio específico por nivel.
- Entidades + relaciones suma predicados y agrava la competencia entre texto y
  aristas; el tooltip conserva el texto completo.
- La selección desde tabla, mapa y timeline usa el mismo `SelectionService` y
  mantiene el nodo seleccionado con prioridad visual. La cobertura automática
  de componentes conserva tests de cada origen; la comprobación manual se
  limita a que las cuatro vistas cargaron y emitieron elementos seleccionables.

## Corpus puro de regresión

`testing/graph-fixtures.ts` cubre DAG, ciclos, componentes desconectados,
nodos sin aristas, hub compartido, blank nodes normalizados, relaciones
paralelas con self-loop y motivos repetidos. Los builders son deterministas y
se reutilizan entre tests y benchmarks.

## Decisiones cerradas

- Cuadrícula no permanece como alternativa manual para resultados con
  relaciones. Sigue siendo automática para nodos aislados y aparece si el
  tablero histórico ya persistió `grid`, para no invalidar ese estado.
- Los identificadores persistidos `dagre`, `cola` y `grid` no se migran. Cola
  histórica se respeta; los C1–C4 regenerados se guardan con `dagre`.
- Dagre considera dimensiones de labels. Los perfiles
  `nodeSep/rankSep/edgeSep` son 34/70/14 (Resumen), 60/95/24 (Entidades) y
  78/125/36 (Entidades + relaciones).
- La tipografía común es 9 px en Resumen y 10 px en los otros niveles. Agregados
  y selección usan 11 px en negrita. Los nombres se envuelven a 140–160 px y el
  tooltip conserva el valor completo.

Las capturas son evidencia de línea base, no una afirmación de ausencia total
de solapamientos después del cambio. Esa verificación requiere regenerar el
seed y repetir C1–C4 con la implementación final.
