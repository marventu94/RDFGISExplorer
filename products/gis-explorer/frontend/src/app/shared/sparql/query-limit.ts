import { Parser } from 'sparqljs';

/**
 * Aviso por `LIMIT` escrito a mano en el editor.
 *
 * El backend no inyecta su propio LIMIT: manda la query tal cual y recorta la
 * respuesta a `maxLimit` (`generic-sparql.adapter.ts`). Un LIMIT propio, entonces,
 * no se ignora — y ese es justamente el problema:
 *
 * - `limit >= maxLimit`: el recorte del backend manda igual, así que el excedente
 *   no se aplica (con `limit === maxLimit` llegan justo `maxLimit` filas y el
 *   resultado sí queda marcado como truncado).
 * - `limit < maxLimit`: llegan menos filas que el tope, y `meta.truncated` se
 *   calcula como `filas >= maxLimit`, así que queda en `false`. El tablero trata
 *   el recorte como el resultado completo: el resumen se computa local sobre esa
 *   muestra y el export la baja como total en vez de paginar el resto.
 *
 * En los dos casos el volumen ya lo maneja la app (lotes en las 4 vistas), así que
 * acotar a mano solo resta información.
 */

export interface QueryLimitNotice {
  /** LIMIT declarado en el nivel externo de la consulta. */
  limit: number;
  /** Tope del backend (`AppConfig.maxLimit`). */
  maxLimit: number;
  /** El LIMIT llega al tope del backend: el recorte efectivo lo hace el backend. */
  capped: boolean;
  /** Texto corto para la barra del editor. */
  summary: string;
  /** Explicación completa, para el tooltip. */
  detail: string;
}

/**
 * LIMIT del nivel externo de la consulta, o `null` si no tiene o si el texto no
 * parsea (mientras se escribe, la mayoría de los estados son inválidos: sin
 * certeza no se avisa nada).
 *
 * Un LIMIT dentro de una subconsulta no cuenta: acota esa subconsulta, no el
 * resultado que recibe el tablero.
 */
export function detectTopLevelLimit(sparql: string): number | null {
  if (!sparql.trim()) return null;
  try {
    const ast = new Parser().parse(sparql) as { limit?: number };
    return typeof ast.limit === 'number' ? ast.limit : null;
  } catch {
    return null;
  }
}

/**
 * Aviso a mostrar para la consulta del editor, o `null` si no hay nada que avisar
 * (sin LIMIT propio, o sin `maxLimit` conocido todavía porque no llegó la config).
 */
export function buildQueryLimitNotice(
  sparql: string,
  maxLimit: number | null,
): QueryLimitNotice | null {
  const limit = detectTopLevelLimit(sparql);
  if (limit === null || maxLimit === null || maxLimit <= 0) return null;

  const capped = limit >= maxLimit;
  const cola =
    'No hace falta acotar a mano: las vistas ya paginan el volumen en lotes.';

  return capped
    ? {
        limit,
        maxLimit,
        capped,
        summary: `LIMIT ${limit}: el backend recorta a ${maxLimit} filas`,
        detail:
          `El backend recorta todo resultado a ${maxLimit} filas, así que el LIMIT ${limit} ` +
          `de la consulta no se aplica entero. ${cola}`,
      }
    : {
        limit,
        maxLimit,
        capped,
        summary: `LIMIT ${limit}: el tablero lo toma como resultado completo`,
        detail:
          `El LIMIT ${limit} recorta el resultado en el endpoint, antes del tope del backend ` +
          `(${maxLimit} filas). Como llegan menos filas que ese tope, el resultado no se marca ` +
          `como truncado: el panel de resumen se calcula sobre esas ${limit} filas y el export ` +
          `las baja como si fueran el total, sin ir a buscar el resto. ${cola}`,
      };
}
