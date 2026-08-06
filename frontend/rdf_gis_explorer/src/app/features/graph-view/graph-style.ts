import type cytoscape from 'cytoscape';
import type { EntityColorService } from '@core/services/entity-color.service';

export function createGraphStyle(
  colorService: EntityColorService,
  isDark: () => boolean,
  detailLevel: () => 'summary' | 'exploration' | 'detail' = () => 'exploration',
): cytoscape.StylesheetStyle[] {
  return [
    {
      selector: 'node',
      style: {
        'background-color': (ele: cytoscape.NodeSingular) =>
          colorService.colorForClass(ele.data('classUri') as string | undefined),
        'border-color': (ele: cytoscape.NodeSingular) => {
          const c = colorService.colorForClass(ele.data('classUri') as string | undefined);
          return isDark() ? shade(c, -0.3) : shade(c, -0.4);
        },
        'border-width': 1.5,
        width: (ele: cytoscape.NodeSingular) => {
          const deg = (ele.data('degree') as number) ?? 0;
          return Math.max(20, Math.min(80, 20 + deg * 3));
        },
        height: (ele: cytoscape.NodeSingular) => {
          const deg = (ele.data('degree') as number) ?? 0;
          return Math.max(20, Math.min(80, 20 + deg * 3));
        },
        color: () => (isDark() ? '#f1f5f9' : '#212529'),
        label: (ele: cytoscape.NodeSingular) =>
          detailLevel() === 'summary' ? '' : (ele.data('label') as string),
        'font-size': '11px',
        'text-valign': 'bottom',
        'text-margin-y': 5,
        'text-wrap': 'wrap',
        'text-max-width': '120px',
        'text-outline-color': () => (isDark() ? '#0f172a' : '#ffffff'),
        'text-outline-width': 2,
      } as cytoscape.Css.Node,
    },
    {
      selector: 'node[aggregate = true]',
      style: {
        shape: 'round-rectangle',
        'border-width': 3,
        'font-weight': 'bold',
      } as cytoscape.Css.Node,
    },
    {
      selector: 'edge',
      style: {
        'curve-style': 'bezier',
        width: (ele: cytoscape.EdgeSingular) =>
          detailLevel() === 'summary'
            ? 1
            : Math.min(5, 1.5 + (((ele.data('multiplicity') as number) ?? 1) - 1) * 0.75),
        'line-color': () => (isDark() ? '#475569' : '#B0BEC5'),
        'target-arrow-color': () => (isDark() ? '#475569' : '#B0BEC5'),
        'target-arrow-shape': 'triangle',
        // El backend emite una arista por predicado (el edgeId incluye el
        // predicado), así que dos entidades pueden tener varias entre sí. Bezier
        // las abanica solo; el default de 40 las deja muy juntas en un cuadrante.
        'control-point-step-size': 55,
      },
    },
    {
      selector: 'edge[aggregate = true]',
      style: {
        'line-style': 'dashed',
        label: (ele: cytoscape.EdgeSingular) =>
          detailLevel() === 'detail' ? (ele.data('predicateLabel') as string) : '',
        'text-rotation': 'autorotate',
      } as cytoscape.Css.Edge,
    },
    {
      selector: 'edge:not([aggregate = true])',
      style: {
        label: (ele: cytoscape.EdgeSingular) =>
          detailLevel() === 'detail' ? (ele.data('predicateLabel') as string) : '',
        'text-rotation': 'autorotate',
      } as cytoscape.Css.Edge,
    },
    {
      // Sin esto todos los self-loops de un nodo usan el mismo -45deg/-90deg por
      // default y quedan exactamente encimados.
      selector: 'edge:loop',
      style: {
        'curve-style': 'bezier',
        'loop-direction': '-45deg',
        'loop-sweep': '-30deg',
        'control-point-step-size': 35,
      },
    },
    // Estado visual por clases en vez de mutar opacity inline: se revierte con un
    // removeClass sobre toda la colección y no se pisa con re-estilados.
    {
      selector: 'node.is-selected',
      style: {
        'border-width': 4,
        'border-color': '#1565C0',
        'text-outline-width': 3,
        'font-weight': 'bold',
      } as cytoscape.Css.Node,
    },
    {
      selector: '.is-dimmed',
      style: {
        opacity: 0.15,
      },
    },
    {
      selector: 'edge.is-focus-edge',
      style: {
        width: 2.5,
        'line-color': '#1565C0',
        'target-arrow-color': '#1565C0',
        opacity: 1,
      },
    },
  ];
}

function shade(hex: string, percent: number): string {
  // Lighten (negative percent) or darken (positive) a hex color by mixing
  // toward black or white. Used to derive a node border from its background.
  const m = hex.replace('#', '');
  if (m.length !== 6) return hex;
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  const mix = (c: number) => {
    const target = percent < 0 ? 255 : 0;
    const p = Math.abs(percent);
    return Math.round(c + (target - c) * p);
  };
  return (
    '#' +
    [mix(r), mix(g), mix(b)]
      .map((n) => n.toString(16).padStart(2, '0'))
      .join('')
  );
}
