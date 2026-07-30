import type cytoscape from 'cytoscape';

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
const COLA_SIMULATION_MS = 1500;

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
      nodeSpacing: 40,
      edgeLength: 90,
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
      nodeSep: 30,
      edgeSep: 10,
      rankSep: 60,
    } as cytoscape.LayoutOptions,
  },
  circle: {
    name: 'circle',
    animationDuration: 500,
    options: {
      name: 'circle',
      animate: true,
      animationDuration: 500,
      fit: false,
      padding: 50,
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
