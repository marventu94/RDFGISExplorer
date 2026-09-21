import {
  DEFAULT_SUBGRAPH_BUDGET,
  buildEntitySubgraph,
  type EntitySubgraph,
  type EntitySubgraphSource,
  type SubgraphBranch,
  type SubgraphBudget,
} from './entity-subgraph';

/**
 * Etapa 4 del plan de mejoras del graph-view: estado PURO de exploración
 * local. Es un reducer sin dependencias de Angular, Cytoscape ni del DOM: cada
 * operación recibe un estado y devuelve uno nuevo (nunca muta el recibido).
 *
 * El estado por sí solo no dibuja nada: describe qué se está explorando
 * (raíz, nodo activo, ramas expandidas, nodos fijados, historial) y se combina
 * con el `QueryResult` mediante `explorationSubgraph()` para obtener el
 * subgrafo determinista de la etapa 3.
 *
 * Reglas de control (§8 del plan):
 * - La expansión es **manual y de un salto**: sólo `expandBranch` incorpora
 *   nodos nuevos, y sólo los de esa rama.
 * - Los hubs **no se atraviesan solos**: la etapa 3 los deja como frontera y
 *   únicamente una expansión explícita de su rama los recorre.
 * - Una expansión que no entra en el presupuesto **se rechaza entera** con una
 *   explicación (`lastRejection`); jamás se recorta en silencio.
 * - Raíz, nodo activo y nodos fijados tienen **prioridad absoluta**.
 * - El **foco coordinado** que llega del viewport de otra vista no entra al
 *   modo entidad ni expande nada (`applyCoordinatedFocus`).
 */

export type ExplorationMode = 'result' | 'entity';

/**
 * Origen de un pedido de entrada al modo entidad. Sólo una selección explícita
 * (o una acción de usuario) habilita el modo: `coordinated-focus` es el foco
 * masivo del viewport y se rechaza siempre.
 */
export type EntityModeTrigger =
  | 'table-selection'
  | 'map-selection'
  | 'timeline-selection'
  | 'graph-selection'
  | 'user-action'
  | 'coordinated-focus';

export type ExplorationRejectionCode =
  /** La operación exige modo entidad y el estado está en `result`. */
  | 'not-in-entity-mode'
  /** El foco coordinado no puede iniciar ni modificar la exploración. */
  | 'focus-not-explicit'
  /** El nodo pedido no existe en el subgrafo actual. */
  | 'unknown-node'
  /** La rama pedida no existe en el subgrafo actual. */
  | 'unknown-branch'
  /** La expansión no entra en el presupuesto: se rechaza completa. */
  | 'budget-exceeded'
  /** No hay pasos previos en el historial. */
  | 'no-history'
  /** La operación no cambiaría nada (p. ej. usar la raíz como raíz). */
  | 'no-op';

export interface ExplorationRejection {
  code: ExplorationRejectionCode;
  /** Mensaje listo para UI (español). */
  message: string;
  /** Rama o nodo involucrado, si aplica. */
  ref?: string;
  /** Sólo en `budget-exceeded`: cuántos nodos pedía y cuántos había libres. */
  required?: number;
  available?: number;
}

/** Foto del estado navegable. No incluye `mode` ni `budget`: no se deshacen. */
export interface ExplorationSnapshot {
  rootUri: string | null;
  activeUri: string | null;
  expandedBranchIds: readonly string[];
  collapsedBranchIds: readonly string[];
  pinnedUris: readonly string[];
}

export interface ExplorationState extends ExplorationSnapshot {
  mode: ExplorationMode;
  /** Pasos anteriores, del más viejo al más reciente. Tope `MAX_HISTORY`. */
  history: readonly ExplorationSnapshot[];
  budget: SubgraphBudget;
  /** Motivo por el que la última operación no se aplicó; `null` si se aplicó. */
  lastRejection: ExplorationRejection | null;
}

/** Resultado y contexto necesarios para resolver el subgrafo del estado. */
export type ExplorationContext = EntitySubgraphSource;

/** Tope del historial: suficiente para deshacer una sesión de exploración. */
export const MAX_HISTORY = 50;

export const INITIAL_EXPLORATION_STATE: ExplorationState = {
  mode: 'result',
  rootUri: null,
  activeUri: null,
  expandedBranchIds: [],
  collapsedBranchIds: [],
  pinnedUris: [],
  history: [],
  budget: DEFAULT_SUBGRAPH_BUDGET,
  lastRejection: null,
};

/** Estado inicial en modo resultado, con presupuesto opcionalmente ajustado. */
export function createExplorationState(budget?: Partial<SubgraphBudget>): ExplorationState {
  return {
    ...INITIAL_EXPLORATION_STATE,
    budget: { ...DEFAULT_SUBGRAPH_BUDGET, ...budget },
  };
}

/** `true` si hay una exploración de entidad en curso con raíz resuelta. */
export function isExplorationActive(state: ExplorationState): boolean {
  return state.mode === 'entity' && state.rootUri !== null;
}

function snapshot(state: ExplorationState): ExplorationSnapshot {
  return {
    rootUri: state.rootUri,
    activeUri: state.activeUri,
    expandedBranchIds: state.expandedBranchIds,
    collapsedBranchIds: state.collapsedBranchIds,
    pinnedUris: state.pinnedUris,
  };
}

function pushHistory(state: ExplorationState): readonly ExplorationSnapshot[] {
  const next = [...state.history, snapshot(state)];
  return next.length > MAX_HISTORY ? next.slice(next.length - MAX_HISTORY) : next;
}

function reject(state: ExplorationState, rejection: ExplorationRejection): ExplorationState {
  return { ...state, lastRejection: rejection };
}

function accept(state: ExplorationState, changes: Partial<ExplorationState>): ExplorationState {
  return { ...state, ...changes, lastRejection: null };
}

const NOT_IN_ENTITY_MODE: ExplorationRejection = {
  code: 'not-in-entity-mode',
  message: 'No hay una entidad en exploración.',
};

/**
 * Subgrafo correspondiente al estado actual. Devuelve `null` en modo
 * resultado o sin raíz: la vista global no pasa por este modelo.
 */
export function explorationSubgraph(
  context: ExplorationContext,
  state: ExplorationState,
): EntitySubgraph | null {
  if (!isExplorationActive(state)) return null;
  return buildEntitySubgraph({
    visibleResult: context.visibleResult,
    fullResult: context.fullResult ?? null,
    rootUri: state.rootUri!,
    activeUri: state.activeUri,
    expandedBranchIds: state.expandedBranchIds,
    pinnedUris: state.pinnedUris,
    budget: state.budget,
  });
}

/**
 * Entra al modo entidad desde una selección explícita. El foco coordinado
 * (`coordinated-focus`) se rechaza: recorrer filas o mover el mapa no debe
 * cambiar de modo ni destruir la cámara global.
 *
 * Reentrar con la misma raíz es idempotente (no pisa la exploración en curso);
 * con otra raíz reinicia la exploración y guarda la anterior en el historial.
 */
export function enterEntityMode(
  state: ExplorationState,
  options: { rootUri: string; trigger: EntityModeTrigger },
): ExplorationState {
  if (options.trigger === 'coordinated-focus') {
    return reject(state, {
      code: 'focus-not-explicit',
      message: 'El foco coordinado no inicia la exploración: seleccioná una entidad.',
      ref: options.rootUri,
    });
  }
  if (state.mode === 'entity' && state.rootUri === options.rootUri) {
    return reject(state, {
      code: 'no-op',
      message: 'La entidad ya está en exploración.',
      ref: options.rootUri,
    });
  }
  return accept(state, {
    mode: 'entity',
    rootUri: options.rootUri,
    activeUri: options.rootUri,
    expandedBranchIds: [],
    collapsedBranchIds: [],
    pinnedUris: [],
    history: state.mode === 'entity' ? pushHistory(state) : state.history,
  });
}

/**
 * Vuelve al resultado completo. Conserva el historial vacío: el estado de
 * exploración es transitorio (§9 del plan) y no se persiste en el dashboard.
 */
export function exitToResult(state: ExplorationState): ExplorationState {
  if (state.mode === 'result') {
    return reject(state, { code: 'no-op', message: 'Ya estás en el resultado completo.' });
  }
  return accept(state, {
    mode: 'result',
    rootUri: null,
    activeUri: null,
    expandedBranchIds: [],
    collapsedBranchIds: [],
    pinnedUris: [],
    history: [],
  });
}

/** Marca un nodo del subgrafo como activo. No cambia la raíz. */
export function setActiveNode(
  context: ExplorationContext,
  state: ExplorationState,
  uri: string,
): ExplorationState {
  if (!isExplorationActive(state)) return reject(state, NOT_IN_ENTITY_MODE);
  if (state.activeUri === uri) {
    return reject(state, { code: 'no-op', message: 'El nodo ya está activo.', ref: uri });
  }
  const subgraph = explorationSubgraph(context, state)!;
  if (!subgraph.nodes.some((node) => node.uri === uri)) {
    return reject(state, {
      code: 'unknown-node',
      message: 'El nodo no forma parte de la estructura explorada.',
      ref: uri,
    });
  }
  return accept(state, { activeUri: uri, history: pushHistory(state) });
}

/**
 * Notifica una selección llegada de otra vista mientras el modo entidad está
 * activo. **Nunca reemplaza la raíz**: si el nodo pertenece a la estructura
 * explorada pasa a ser el nodo activo; si no, el estado queda igual y la UI
 * decide si ofrecer "explorar esta otra entidad" (`enterEntityMode`).
 */
export function notifySelection(
  context: ExplorationContext,
  state: ExplorationState,
  uri: string | null,
): ExplorationState {
  if (!isExplorationActive(state) || uri === null) {
    return reject(state, { code: 'no-op', message: 'Sin cambios en la exploración.' });
  }
  return setActiveNode(context, state, uri);
}

/**
 * El foco coordinado (viewport de otra vista) es explícitamente inerte para la
 * exploración: no entra al modo entidad, no cambia la raíz y no expande ramas.
 * Existe como función para que el llamador documente la decisión en un solo
 * lugar en vez de "olvidarse" de conectar el foco.
 */
export function applyCoordinatedFocus(
  state: ExplorationState,
  _focusUris: readonly string[],
): ExplorationState {
  return state;
}

function findBranch(subgraph: EntitySubgraph, branchId: string): SubgraphBranch | undefined {
  return subgraph.branches.find((branch) => branch.id === branchId);
}

/**
 * Expande una rama: incorpora **de un solo salto** los vecinos de ese nodo por
 * ese predicado y sentido. Atómica: si no entran todos en el presupuesto, no
 * entra ninguno y se devuelve `budget-exceeded` con cuántos hacían falta.
 *
 * Expandir una rama cuyos vecinos ya están visibles por otro motivo es válido
 * y no es un no-op: registra la intención del usuario, de modo que contraer la
 * otra rama no se lleve puestos esos vecinos.
 */
export function expandBranch(
  context: ExplorationContext,
  state: ExplorationState,
  branchId: string,
): ExplorationState {
  if (!isExplorationActive(state)) return reject(state, NOT_IN_ENTITY_MODE);
  const subgraph = explorationSubgraph(context, state)!;
  const branch = findBranch(subgraph, branchId);
  if (!branch) {
    return reject(state, {
      code: 'unknown-branch',
      message: 'La rama no existe en la estructura explorada.',
      ref: branchId,
    });
  }
  if (state.expandedBranchIds.includes(branchId)) {
    return reject(state, { code: 'no-op', message: 'La rama ya está expandida.', ref: branchId });
  }

  const candidate: ExplorationState = {
    ...state,
    expandedBranchIds: [...state.expandedBranchIds, branchId],
    collapsedBranchIds: state.collapsedBranchIds.filter((id) => id !== branchId),
  };
  const expanded = explorationSubgraph(context, candidate)!;
  const admitted = new Set(expanded.nodes.map((node) => node.uri));
  const missing = branch.pendingUris.filter((uri) => !admitted.has(uri));
  if (missing.length > 0) {
    return reject(state, {
      code: 'budget-exceeded',
      message: `La rama agrega ${branch.pendingUris.length} elemento(s) y el presupuesto de ${state.budget.maxNodes} nodos no alcanza. Contraé otra rama o quitá un nodo fijado.`,
      ref: branchId,
      required: branch.pendingUris.length,
      available: Math.max(0, state.budget.maxNodes - subgraph.metrics.nodeCount),
    });
  }

  return accept(candidate, { history: pushHistory(state) });
}

/**
 * Contrae una rama previamente expandida. No borra nodos: el subgrafo se
 * recalcula, así que un nodo que otra rama visible (o un camino, un pin, la
 * raíz o el nodo activo) necesita sigue presente — raíz, selección y fijados
 * tienen prioridad absoluta también al contraer. La rama queda registrada en
 * `collapsedBranchIds` para que la UI distinga "contraída" de "nunca
 * expandida".
 */
export function collapseBranch(
  context: ExplorationContext,
  state: ExplorationState,
  branchId: string,
): ExplorationState {
  if (!isExplorationActive(state)) return reject(state, NOT_IN_ENTITY_MODE);
  if (!state.expandedBranchIds.includes(branchId)) {
    return reject(state, {
      code: 'no-op',
      message: 'La rama no estaba expandida.',
      ref: branchId,
    });
  }
  const expandedBranchIds = state.expandedBranchIds.filter((id) => id !== branchId);
  const collapsedBranchIds = state.collapsedBranchIds.includes(branchId)
    ? state.collapsedBranchIds
    : [...state.collapsedBranchIds, branchId];
  const next = accept(state, {
    expandedBranchIds,
    collapsedBranchIds,
    history: pushHistory(state),
  });

  // Si el nodo activo desapareció del resultado (no del subgrafo: el activo
  // siempre entra al presupuesto), el modelo ya volvió a la raíz: se sincroniza.
  const subgraph = explorationSubgraph(context, next)!;
  return subgraph.activeUri === next.activeUri ? next : { ...next, activeUri: subgraph.activeUri };
}

/** Fija un nodo: entra siempre al presupuesto, aunque se contraiga su rama. */
export function pinNode(
  context: ExplorationContext,
  state: ExplorationState,
  uri: string,
): ExplorationState {
  if (!isExplorationActive(state)) return reject(state, NOT_IN_ENTITY_MODE);
  if (state.pinnedUris.includes(uri)) {
    return reject(state, { code: 'no-op', message: 'El nodo ya está fijado.', ref: uri });
  }
  const subgraph = explorationSubgraph(context, state)!;
  if (!subgraph.nodes.some((node) => node.uri === uri)) {
    return reject(state, {
      code: 'unknown-node',
      message: 'Sólo se pueden fijar nodos de la estructura explorada.',
      ref: uri,
    });
  }
  return accept(state, { pinnedUris: [...state.pinnedUris, uri], history: pushHistory(state) });
}

/** Desfija un nodo. El nodo puede seguir visible por otra razón. */
export function unpinNode(state: ExplorationState, uri: string): ExplorationState {
  if (!isExplorationActive(state)) return reject(state, NOT_IN_ENTITY_MODE);
  if (!state.pinnedUris.includes(uri)) {
    return reject(state, { code: 'no-op', message: 'El nodo no estaba fijado.', ref: uri });
  }
  return accept(state, {
    pinnedUris: state.pinnedUris.filter((pinned) => pinned !== uri),
    history: pushHistory(state),
  });
}

/** Alterna el fijado de un nodo. */
export function togglePin(
  context: ExplorationContext,
  state: ExplorationState,
  uri: string,
): ExplorationState {
  return state.pinnedUris.includes(uri) ? unpinNode(state, uri) : pinNode(context, state, uri);
}

/**
 * Usa el nodo activo como nueva raíz. Conserva ramas expandidas y nodos
 * fijados (el subgrafo se recalcula desde la nueva raíz y descarta lo que ya
 * no aplica) y deja el paso anterior en el historial, así `goBack` recupera la
 * raíz original.
 */
export function promoteActiveToRoot(state: ExplorationState): ExplorationState {
  if (!isExplorationActive(state)) return reject(state, NOT_IN_ENTITY_MODE);
  if (!state.activeUri || state.activeUri === state.rootUri) {
    return reject(state, { code: 'no-op', message: 'El nodo activo ya es la raíz.' });
  }
  return accept(state, { rootUri: state.activeUri, history: pushHistory(state) });
}

/** Vuelve el foco a la raíz sin tocar expansiones ni fijados. */
export function goToRoot(state: ExplorationState): ExplorationState {
  if (!isExplorationActive(state)) return reject(state, NOT_IN_ENTITY_MODE);
  if (state.activeUri === state.rootUri) {
    return reject(state, { code: 'no-op', message: 'Ya estás en la raíz.' });
  }
  return accept(state, { activeUri: state.rootUri, history: pushHistory(state) });
}

/** Deshace el último paso de navegación. */
export function goBack(state: ExplorationState): ExplorationState {
  if (!isExplorationActive(state)) return reject(state, NOT_IN_ENTITY_MODE);
  if (state.history.length === 0) {
    return reject(state, { code: 'no-history', message: 'No hay pasos previos.' });
  }
  const previous = state.history[state.history.length - 1];
  return accept(state, { ...previous, history: state.history.slice(0, -1) });
}

/**
 * Restablece la exploración: conserva la raíz y descarta expansiones, ramas
 * contraídas y fijados. Queda en el historial, así que es reversible.
 */
export function resetExploration(state: ExplorationState): ExplorationState {
  if (!isExplorationActive(state)) return reject(state, NOT_IN_ENTITY_MODE);
  const alreadyClean =
    state.expandedBranchIds.length === 0 &&
    state.collapsedBranchIds.length === 0 &&
    state.pinnedUris.length === 0 &&
    state.activeUri === state.rootUri;
  if (alreadyClean) {
    return reject(state, { code: 'no-op', message: 'La exploración ya está en su estado inicial.' });
  }
  return accept(state, {
    activeUri: state.rootUri,
    expandedBranchIds: [],
    collapsedBranchIds: [],
    pinnedUris: [],
    history: pushHistory(state),
  });
}

/**
 * Ajusta el presupuesto (p. ej. cuando cambia la config del backend). No es
 * un paso de navegación: no entra al historial.
 */
export function setExplorationBudget(
  state: ExplorationState,
  budget: Partial<SubgraphBudget>,
): ExplorationState {
  return accept(state, { budget: { ...state.budget, ...budget } });
}

/**
 * Ramas que la UI puede ofrecer para expandir: las que tienen vecinos
 * pendientes, ordenadas por cercanía a la raíz, luego por el nodo y el
 * predicado (orden ya determinista en `subgraph.branches`).
 */
export function expandableBranches(subgraph: EntitySubgraph): SubgraphBranch[] {
  const depthByUri = new Map(subgraph.nodes.map((node) => [node.uri, node.depth ?? Number.MAX_SAFE_INTEGER]));
  return subgraph.branches
    .filter((branch) => branch.pendingUris.length > 0)
    .map((branch, index) => ({ branch, index }))
    .sort((a, b) => {
      const depthA = depthByUri.get(a.branch.nodeUri) ?? Number.MAX_SAFE_INTEGER;
      const depthB = depthByUri.get(b.branch.nodeUri) ?? Number.MAX_SAFE_INTEGER;
      if (depthA !== depthB) return depthA - depthB;
      return a.index - b.index;
    })
    .map(({ branch }) => branch);
}

/**
 * Breadcrumb de navegación: raíces recorridas en orden, terminando en la
 * actual. Sirve para el control de la etapa 5 sin exponerle el historial.
 */
export function explorationBreadcrumb(state: ExplorationState): string[] {
  const crumbs: string[] = [];
  for (const step of state.history) {
    if (step.rootUri && crumbs[crumbs.length - 1] !== step.rootUri) crumbs.push(step.rootUri);
  }
  if (state.rootUri && crumbs[crumbs.length - 1] !== state.rootUri) crumbs.push(state.rootUri);
  return crumbs;
}

/** Id de rama a partir de sus partes, reexportado para la UI. */
export { makeBranchId, parseBranchId } from './entity-subgraph';
