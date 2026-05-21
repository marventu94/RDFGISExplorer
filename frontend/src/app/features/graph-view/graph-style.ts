import type cytoscape from 'cytoscape';
import { colorForType } from '../../shared/entity-colors';

export const GRAPH_STYLE: cytoscape.StylesheetStyle[] = [
  {
    selector: 'node',
    style: {
      'background-color': (ele: cytoscape.NodeSingular) =>
        colorForType(ele.data('type') as string | undefined),
      width: (ele: cytoscape.NodeSingular) => {
        const deg = (ele.data('degree') as number) ?? 0;
        return Math.max(20, Math.min(80, 20 + deg * 3));
      },
      height: (ele: cytoscape.NodeSingular) => {
        const deg = (ele.data('degree') as number) ?? 0;
        return Math.max(20, Math.min(80, 20 + deg * 3));
      },
      label: 'data(label)',
      'font-size': '11px',
      'text-valign': 'bottom',
      'text-margin-y': 5,
      'text-wrap': 'wrap',
      'text-max-width': '120px',
    } as cytoscape.Css.Node,
  },
  {
    selector: '.anomaly',
    style: {
      'border-color': '#FF9800',
      'border-width': 3,
    },
  },
  {
    selector: '.confirmed-duplicate',
    style: {
      'border-style': 'dashed',
      'border-color': '#9C27B0',
      'border-width': 2,
    },
  },
  {
    selector: 'edge',
    style: {
      'curve-style': 'bezier',
      width: 1.5,
      'line-color': '#B0BEC5',
      'target-arrow-color': '#B0BEC5',
      'target-arrow-shape': 'triangle',
    },
  },
];
