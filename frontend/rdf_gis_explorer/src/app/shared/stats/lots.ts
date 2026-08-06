import type { BindingValue, QueryResult } from '@shared/models';

/**
 * Lotes globales: cuando el resultado filtrado supera `lotSize` filas, las 4
 * vistas muestran el mismo subconjunto (lote) en vez de que cada una recorte
 * por su cuenta. El lote pagina `bindings` (filas) en el orden original del
 * resultado — nunca se reordena: la query decide qué filas van primero.
 *
 * Los nodos visibles del lote son los URIs/bnodes que aparecen en las filas
 * del lote más sus vecinos inmediatos (1 salto por `edges`): así se recuperan
 * los nodos intermedios que el backend no expone en los bindings.
 *
 * Los URIs pineados (la selección actual) se inyectan en el lote visible aunque
 * pertenezcan a otro lote: lo seleccionado siempre existe en todas las vistas.
 */

export const DEFAULT_LOT_SIZE = 300;
export const LOT_SIZE_OPTIONS: readonly number[] = [100, 300, 500];

/**
 * Id de grafo de un valor de binding: los nodos y aristas identifican a los
 * bnodes como `_:b0`, pero las filas de bindings los traen crudos (`b0`).
 * Sin esta normalización los bnodes se caían del lote visible (y de los
 * filtros geo/temporales, que reusan `restrictResultToUris`).
 */
export function bindingGraphId(value: BindingValue | undefined): string | null {
  if (value?.type === 'uri') return value.value;
  if (value?.type === 'bnode') return value.value.startsWith('_:') ? value.value : `_:${value.value}`;
  return null;
}

export interface LotSlice {
  /** Resultado restringido al lote actual más los URIs pineados. */
  result: QueryResult;
  lotCount: number;
  /** Lote pedido, clampeado al rango válido [1, lotCount]. */
  currentLot: number;
}

/** Cantidad de lotes para un resultado (mínimo 1, aunque no haya filas). */
export function computeLotCount(result: QueryResult | null, lotSize: number): number {
  if (!result) return 1;
  return Math.max(1, Math.ceil(result.bindings.length / lotSize));
}

/**
 * Recorta un QueryResult a un conjunto de URIs: nodos, edges con ambos extremos
 * visibles y bindings que mencionan al menos un URI visible (misma lógica que
 * el filtrado geo/temporal de SelectionService).
 */
export function restrictResultToUris(
  result: QueryResult,
  uris: ReadonlySet<string>,
): QueryResult {
  const nodes = result.nodes.filter((n) => uris.has(n.uri));
  const edges = result.edges.filter((e) => uris.has(e.source) && uris.has(e.target));
  const bindings = result.bindings.filter((row) =>
    Object.values(row).some((v) => {
      const id = bindingGraphId(v);
      return id !== null && uris.has(id);
    }),
  );
  return { ...result, nodes, edges, bindings };
}

/** URIs/bnodes referenciados por una fila de bindings (bnodes normalizados a `_:bN`). */
function rowUris(row: QueryResult['bindings'][number]): string[] {
  const uris: string[] = [];
  for (const value of Object.values(row)) {
    const id = bindingGraphId(value);
    if (id !== null) uris.push(id);
  }
  return uris;
}

/**
 * Devuelve el resultado restringido al lote `currentLot` (1-based, se clampea)
 * más los URIs pineados que existan en el resultado. Los bindings visibles son
 * las filas del lote tal cual (en el orden original de la query); los nodos
 * visibles son los URIs/bnodes de esas filas más sus vecinos a 1 salto por
 * `edges`. Con un solo lote devuelve el resultado tal cual (misma identidad,
 * sin overhead).
 */
export function sliceLot(
  result: QueryResult,
  lotSize: number,
  currentLot: number,
  pinnedUris: readonly string[] = [],
): LotSlice {
  const lotCount = computeLotCount(result, lotSize);
  const lot = Math.min(Math.max(1, Math.floor(currentLot)), lotCount);

  if (lotCount === 1) {
    return { result, lotCount, currentLot: lot };
  }

  const start = (lot - 1) * lotSize;
  const bindings = result.bindings.slice(start, start + lotSize);

  const rowUrisSet = new Set<string>();
  for (const row of bindings) {
    for (const uri of rowUris(row)) {
      rowUrisSet.add(uri);
    }
  }
  // Vecinos inmediatos de los URIs de las filas (1 salto, no recursivo):
  // recupera los nodos intermedios que el backend no expone en los bindings
  // (los recorta del SELECT con pickVariables).
  const visibleUris = new Set(rowUrisSet);
  for (const edge of result.edges) {
    if (rowUrisSet.has(edge.source)) visibleUris.add(edge.target);
    if (rowUrisSet.has(edge.target)) visibleUris.add(edge.source);
  }
  for (const uri of pinnedUris) {
    visibleUris.add(uri);
  }

  const restricted = restrictResultToUris(result, visibleUris);
  return { result: { ...restricted, bindings }, lotCount, currentLot: lot };
}
