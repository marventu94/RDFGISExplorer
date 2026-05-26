import type cytoscape from 'cytoscape';

export interface LayoutConfig {
  name: string;
  options: cytoscape.LayoutOptions;
  animationDuration: number;
}

export const LAYOUT_CONFIGS: Record<string, LayoutConfig> = {
  cola: {
    name: 'cola',
    animationDuration: 500,
    options: {
      name: 'cola',
      animate: true,
      animationDuration: 500,
      fit: false,
      padding: 50,
      nodeSpacing: 15,
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
