import type { NormalizedNode, QueryResult, ResultBinding } from '@shared/models';
import { bindingGraphId } from '@shared/stats/lots';

/**
 * Índice fila ↔ entidades del resultado.
 *
 * Las cuatro vistas dibujan entidades DISTINTAS de la misma fila: el mapa la
 * que tiene coordenada, la timeline la que tiene fecha, el grafo todas, la
 * tabla la fila entera. Por eso seleccionar por URI exacta no alcanzaba: un
 * click en el mapa no encontraba nada que resaltar en la tabla si la fila
 * empezaba por otra variable.
 *
 * Con este índice, una selección se traduce en cada vista a "lo que esa vista
 * sabe dibujar de las mismas filas".
 */
export interface RowIndex {
  /** Filas (índice en `bindings`) en las que aparece cada URI/bnode. */
  readonly rowsByUri: ReadonlyMap<string, readonly number[]>;
  /** URIs/bnodes de cada fila, en el orden de las variables proyectadas. */
  readonly urisByRow: readonly (readonly string[])[];
}

/**
 * Índice vacío (sin resultado todavía).
 *
 * Es una función y no una constante exportada a propósito: los inicializadores
 * de campo de `SelectionService` corren antes de que el bundle termine de
 * evaluar este módulo, y una `const` importada en ese momento vale `undefined`
 * (las funciones sí se hoistean). Con una función no hay orden que respetar.
 */
export function emptyRowIndex(): RowIndex {
  return { rowsByUri: new Map<string, readonly number[]>(), urisByRow: [] };
}

/**
 * Tope de filas que se miran al expandir una selección. Una entidad muy
 * compartida (una ciudad, un tipo) puede aparecer en miles de filas y expandir
 * todas no aporta: con las primeras alcanza para que cada vista encuentre algo
 * que resaltar, y el costo queda acotado.
 */
export const MAX_RELATED_ROWS = 50;

/** URIs/bnodes de una fila, normalizados igual que en el grafo (`_:bN`). */
export function rowUris(row: ResultBinding): string[] {
  const uris: string[] = [];
  for (const value of Object.values(row)) {
    const id = bindingGraphId(value);
    if (id !== null && !uris.includes(id)) uris.push(id);
  }
  return uris;
}

export function buildRowIndex(result: QueryResult | null | undefined): RowIndex {
  if (!result || result.bindings.length === 0) return emptyRowIndex();

  const rowsByUri = new Map<string, number[]>();
  const urisByRow: string[][] = [];

  result.bindings.forEach((row, rowIndex) => {
    const uris = rowUris(row);
    urisByRow.push(uris);
    for (const uri of uris) {
      const rows = rowsByUri.get(uri);
      if (rows) rows.push(rowIndex);
      else rowsByUri.set(uri, [rowIndex]);
    }
  });

  return { rowsByUri, urisByRow };
}

/**
 * Entidades que comparten fila con `uri` (la propia incluida). Es el grupo que
 * las vistas usan para resaltar lo mismo aunque cada una dibuje otra entidad.
 */
export function relatedUris(
  index: RowIndex,
  uri: string | null | undefined,
  maxRows: number = MAX_RELATED_ROWS,
): ReadonlySet<string> {
  const related = new Set<string>();
  if (!uri) return related;

  related.add(uri);
  const rows = index.rowsByUri.get(uri);
  if (!rows) return related;

  for (const rowIndex of rows.slice(0, maxRows)) {
    for (const rowUri of index.urisByRow[rowIndex] ?? []) related.add(rowUri);
  }
  return related;
}

/** Primera fila donde aparece la entidad; -1 si no está en ninguna. */
export function firstRowWith(index: RowIndex, uri: string | null | undefined): number {
  if (!uri) return -1;
  return index.rowsByUri.get(uri)?.[0] ?? -1;
}

/**
 * Entidad "principal" de una fila: la que lleva datos propios (coordenada,
 * fechas o atributos), no los nodos estructurales del modelo (features,
 * direcciones, geometrías). Es la que conviene seleccionar al clickear una
 * fila: es la que las otras vistas saben dibujar.
 *
 * Mismo criterio que `computeCoverageStats`; si ninguna califica se devuelve la
 * primera entidad de la fila que exista como nodo del resultado.
 */
export function pickRowEntity(
  uris: readonly string[],
  nodeByUri: ReadonlyMap<string, NormalizedNode>,
): NormalizedNode | null {
  let firstKnown: NormalizedNode | null = null;

  for (const uri of uris) {
    const node = nodeByUri.get(uri);
    if (!node) continue;
    if (!firstKnown) firstKnown = node;
    const hasOwnData =
      !!node.coordinate ||
      (node.temporalEvents?.length ?? 0) > 0 ||
      Object.keys(node.attributes ?? {}).length > 0;
    if (hasOwnData) return node;
  }

  return firstKnown;
}
