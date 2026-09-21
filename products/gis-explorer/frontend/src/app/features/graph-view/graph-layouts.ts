import type cytoscape from 'cytoscape';
import type { QueryResult } from '@shared/models';
import type { UiTextKey } from '@rdfgis/platform-bridge';

export type GraphLayout = 'cola' | 'dagre' | 'grid';
export type GraphDetailLevel =
  | 'summary'
  | 'exploration'
  | 'detail'
  | 'literals'
  | 'literals-detail';

export interface GraphLayoutOption {
  value: GraphLayout;
  label: UiTextKey;
  description: UiTextKey;
}

export const GRAPH_LAYOUT_OPTIONS: readonly GraphLayoutOption[] = [
  {
    value: 'dagre',
    label: 'Jerárquico',
    description: 'Ordena relaciones dirigidas por niveles',
  },
  {
    value: 'cola',
    label: 'Orgánico',
    description: 'Distribuye redes mediante fuerzas',
  },
  {
    value: 'grid',
    label: 'Cuadrícula',
    description: 'Ordena nodos sin relaciones',
  },
];

export interface LayoutConfig {
  name: string;
  options: cytoscape.LayoutOptions;
  /**
   * Cuánto tarda el layout en asentarse, para saber cuándo encuadrar.
   * Para `cola` es su `maxSimulationTime` (no acepta `animationDuration`:
   * la ignora, y usar 500 encuadraba mientras la simulación seguía corriendo).
   */
  animationDuration: number;
}

/** Techo de la simulación de cola; también es su "duración" a efectos del fit. */
const COLA_SIMULATION_MS = 4000;

export const LAYOUT_CONFIGS: Record<string, LayoutConfig> = {
  cola: {
    name: 'cola',
    animationDuration: COLA_SIMULATION_MS,
    options: {
      name: 'cola',
      animate: true,
      fit: false,
      padding: 50,
      maxSimulationTime: COLA_SIMULATION_MS,
      // Tendencia DAG hacia abajo: es lo que más reduce los cruces de aristas
      // sin perder el aspecto orgánico del force-directed.
      flow: { axis: 'y', minSeparation: 30 },
      // El default de cola es 10; el 15 anterior casi no separaba nada.
      nodeSpacing: 30,
      edgeLength: 80,
      // Los labels van debajo del nodo, así que sin esto no cuentan para el
      // espaciado y se pisan entre sí.
      nodeDimensionsIncludeLabels: true,
      // Ya son los defaults de cola; explícitos para dejar la intención escrita:
      // reusar las posiciones que ya tienen los nodos en vez de re-tirarlas.
      randomize: false,
      avoidOverlap: true,
      handleDisconnected: true,
    } as cytoscape.LayoutOptions,
  },
  dagre: {
    name: 'dagre',
    animationDuration: 500,
    options: {
      name: 'dagre',
      animate: true,
      animationDuration: 500,
      fit: false,
      padding: 50,
      rankDir: 'TB',
      nodeDimensionsIncludeLabels: true,
    } as cytoscape.LayoutOptions,
  },
  grid: {
    name: 'grid',
    animationDuration: 500,
    options: {
      name: 'grid',
      animate: true,
      animationDuration: 500,
      fit: false,
      padding: 50,
    } as cytoscape.LayoutOptions,
  },
};

const DAGRE_SPACING: Record<GraphDetailLevel, Record<'nodeSep' | 'rankSep' | 'edgeSep', number>> = {
  summary: { nodeSep: 34, rankSep: 70, edgeSep: 14 },
  exploration: { nodeSep: 60, rankSep: 95, edgeSep: 24 },
  detail: { nodeSep: 78, rankSep: 125, edgeSep: 36 },
  literals: { nodeSep: 78, rankSep: 125, edgeSep: 36 },
  'literals-detail': { nodeSep: 90, rankSep: 140, edgeSep: 42 },
};

export function layoutOptionsFor(
  layout: GraphLayout,
  detailLevel: GraphDetailLevel,
): cytoscape.LayoutOptions {
  const base = LAYOUT_CONFIGS[layout]?.options ?? LAYOUT_CONFIGS['dagre'].options;
  if (layout !== 'dagre') return { ...base } as cytoscape.LayoutOptions;
  return { ...base, ...DAGRE_SPACING[detailLevel] } as cytoscape.LayoutOptions;
}

/**
 * Cola escala mejor si parte de la semilla determinista ya dibujada. En grafos
 * grandes se quita además la restricción de flujo: imponer niveles a una red
 * cíclica/heterogénea hace que la simulación se estire y cruce componentes.
 */
export function initialColaOptions(
  detailLevel: GraphDetailLevel,
  nodeCount: number,
): cytoscape.LayoutOptions {
  const options: Record<string, unknown> = {
    ...(layoutOptionsFor('cola', detailLevel) as unknown as Record<string, unknown>),
    animate: true,
    randomize: false,
  };
  if (nodeCount > 100) delete options['flow'];
  return options as unknown as cytoscape.LayoutOptions;
}

export function chooseGraphLayout(result: Pick<QueryResult, 'nodes' | 'edges'>): GraphLayout {
  if (result.edges.length === 0) return 'grid';
  // Dagre tolera ciclos y self-loops: no son motivo para degradar el default a
  // un layout de fuerzas menos predecible. Cola queda como alternativa manual.
  return 'dagre';
}
