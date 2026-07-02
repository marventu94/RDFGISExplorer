import type cytoscape from 'cytoscape';
import type { EntityColorService } from '@core/services/entity-color.service';

export function createGraphStyle(colorService: EntityColorService): cytoscape.StylesheetStyle[] {
  return [
    {
      selector: 'node',
      style: {
        'background-color': (ele: cytoscape.NodeSingular) =>
          colorService.colorForType(ele.data('type') as string | undefined),
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
}
