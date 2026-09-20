import {
  DEFAULT_SUBGRAPH_BUDGET,
  buildEntitySubgraph,
  type EntitySubgraph,
  type EntitySubgraphSource,
  type SubgraphBudget,
} from './entity-subgraph';

/**
 * Etapa 6 del plan de mejoras del graph-view (parte 1 de 2): resolución PURA
 * del alcance **estructura disponible**.
 *
 * `Copiar vista actual` describe el subgrafo tal como quedó tras la
 * exploración del usuario (etapas 3 y 4). `Copiar estructura completa`
 * necesita, en cambio, la porción de resultado que *existe* para la raíz aunque
 * todavía no se haya expandido en el lienzo. Este módulo la construye
 * reutilizando `buildEntitySubgraph` —no duplica su lógica de admisión— y
 * expandiendo ramas hasta punto fijo.
 *
 * Reglas heredadas del plan que se mantienen aquí:
 * - **Los hubs no se atraviesan.** Un recurso compartido (partido, clase RDF,
 *   función comercial) entra como frontera, pero sus ramas nunca se expanden:
 *   copiar la estructura de un aviso no debe arrastrar los otros 200 avisos de
 *   Berisso. Esas ramas quedan listadas en `hubBranchIds`.
 * - **Nada se recorta en silencio.** Si el presupuesto se agota, `complete`
 *   queda en `false` y el subgrafo reporta sus omisiones como siempre.
 * - **Determinismo total.** Las ramas se expanden en orden por id, así que dos
 *   corridas con el mismo input producen el mismo cierre y el mismo orden.
 */

/**
 * Presupuesto del alcance "estructura disponible": mucho más amplio que el de
 * la vista explorada (`DEFAULT_SUBGRAPH_BUDGET`, pensado para dibujar) porque
 * acá el destino es un texto, no el lienzo. Sigue siendo un tope: la copia
 * tiene que terminar y ser legible.
 */
export const DEFAULT_STRUCTURE_BUDGET: SubgraphBudget = {
  ...DEFAULT_SUBGRAPH_BUDGET,
  maxNodes: 500,
  maxEdges: 1000,
};

/**
 * Tope de iteraciones del cierre. Cada iteración expande todas las ramas
 * pendientes conocidas, así que el cierre avanza al menos un salto por vuelta:
 * 32 cubre cualquier resultado razonable y evita un bucle infinito si una
 * rama se regenerara.
 */
export const MAX_STRUCTURE_ITERATIONS = 32;

export interface AvailableStructureInput extends EntitySubgraphSource {
  rootUri: string;
  /** Nodo activo de la exploración; sólo afecta el marcado, no el cierre. */
  activeUri?: string | null;
  pinnedUris?: readonly string[];
  /** Override parcial de `DEFAULT_STRUCTURE_BUDGET`. */
  budget?: Partial<SubgraphBudget>;
  maxIterations?: number;
}

export interface AvailableStructure {
  /** Subgrafo con todas las ramas no-hub expandidas. */
  subgraph: EntitySubgraph;
  /** Ramas expandidas para llegar a este cierre, en orden determinista. */
  expandedBranchIds: string[];
  /**
   * `true` si el cierre terminó sin ramas pendientes fuera de los hubs.
   * `false` si lo cortó el presupuesto o el tope de iteraciones: el texto lo
   * anuncia como estructura **incompleta**.
   */
  complete: boolean;
  /** Vueltas de expansión consumidas (0 = no hacía falta expandir nada). */
  iterations: number;
  /** Ramas que nacen de un recurso compartido y no se atraviesan. */
  hubBranchIds: string[];
}

/**
 * Cierre de la estructura disponible para `rootUri`: expande repetidamente
 * toda rama con vecinos pendientes que **no** nazca de un hub, hasta que no
 * quede ninguna o hasta agotar presupuesto/iteraciones.
 */
export function buildAvailableStructure(input: AvailableStructureInput): AvailableStructure {
  const budget: SubgraphBudget = { ...DEFAULT_STRUCTURE_BUDGET, ...input.budget };
  const maxIterations = input.maxIterations ?? MAX_STRUCTURE_ITERATIONS;

  const build = (expandedBranchIds: readonly string[]): EntitySubgraph =>
    buildEntitySubgraph({
      visibleResult: input.visibleResult,
      fullResult: input.fullResult ?? null,
      rootUri: input.rootUri,
      activeUri: input.activeUri ?? null,
      pinnedUris: input.pinnedUris ?? [],
      expandedBranchIds,
      budget,
    });

  const expanded: string[] = [];
  const expandedSet = new Set<string>();
  let subgraph = build(expanded);
  let iterations = 0;

  while (iterations < maxIterations) {
    // Una rama que sale de un hub no se recorre nunca sin acción explícita del
    // usuario; tampoco se reintenta una ya expandida (su pendiente sólo puede
    // deberse al presupuesto, y volver a pedirla no lo agranda).
    const pending = subgraph.branches
      .filter(
        (branch) =>
          branch.pendingUris.length > 0 && !branch.fromHub && !expandedSet.has(branch.id),
      )
      .map((branch) => branch.id)
      .sort();
    if (pending.length === 0) break;

    for (const id of pending) {
      expanded.push(id);
      expandedSet.add(id);
    }
    subgraph = build(expanded);
    iterations++;

    // El presupuesto se agotó: el cierre no puede completarse y el subgrafo ya
    // dejó las omisiones registradas. Se corta acá para no iterar en vano.
    if (subgraph.omitted.nodeBudgetExceeded) break;
  }

  const hubBranchIds = subgraph.branches
    .filter((branch) => branch.fromHub && branch.pendingUris.length > 0)
    .map((branch) => branch.id)
    .sort();
  const pendingNonHub = subgraph.branches.some(
    (branch) => branch.pendingUris.length > 0 && !branch.fromHub,
  );

  return {
    subgraph,
    expandedBranchIds: [...expanded].sort(),
    complete: !pendingNonHub && !subgraph.omitted.nodeBudgetExceeded,
    iterations,
    hubBranchIds,
  };
}
