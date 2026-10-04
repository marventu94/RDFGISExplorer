import type { BindingValue, QueryResult } from '@shared/models';

/**
 * Lotes globales: cuando el resultado filtrado supera `lotSize` filas, las 4
 * vistas muestran el mismo subconjunto (lote) en vez de que cada una recorte
 * por su cuenta. El lote pagina `bindings` (filas) en el orden original del
 * resultado — nunca se reordena: la query decide qué filas van primero.
 *
 * Visible nodes include the row resources and their connected, unprojected
 * structural nodes. Traversal stops at resources projected only by other rows.
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

/** Keep nodes and edges inside a URI set, plus rows mentioning those URIs. */
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
 * Keep every structural node on paths from the selected rows while stopping at
 * resources projected only by other rows. Shared class/city nodes therefore do
 * not pull unrelated entities into a filtered result or batch.
 */
export function expandRowTopology(
  result: QueryResult,
  rowIds: ReadonlySet<string>,
): Set<string> {
  const projected = new Set(result.bindings.flatMap(rowUris));
  const adjacency = new Map<string, string[]>();
  for (const edge of result.edges) {
    const source = adjacency.get(edge.source) ?? [];
    source.push(edge.target);
    adjacency.set(edge.source, source);
    const target = adjacency.get(edge.target) ?? [];
    target.push(edge.source);
    adjacency.set(edge.target, target);
  }

  const visible = new Set(rowIds);
  const queue = [...rowIds];
  for (let index = 0; index < queue.length; index++) {
    for (const neighbor of adjacency.get(queue[index]) ?? []) {
      if (visible.has(neighbor) || projected.has(neighbor)) continue;
      visible.add(neighbor);
      queue.push(neighbor);
    }
  }
  return visible;
}

/**
 * Slice rows in query order and retain their connected structural nodes.
 * Pinned resources are included even when their rows belong to another batch.
 * A single batch returns the original result unchanged.
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
  const visibleUris = expandRowTopology(result, rowUrisSet);
  for (const uri of pinnedUris) {
    visibleUris.add(uri);
  }

  const restricted = restrictResultToUris(result, visibleUris);
  return { result: { ...restricted, bindings }, lotCount, currentLot: lot };
}
