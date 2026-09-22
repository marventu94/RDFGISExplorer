import type cytoscape from 'cytoscape';
import type { EntityColorService } from '@core/services/entity-color.service';
import type { GraphDetailLevel } from './graph-layouts';

export function createGraphStyle(
  colorService: EntityColorService,
  isDark: () => boolean,
  detailLevel: () => GraphDetailLevel = () => 'exploration',
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
        color: () => (isDark() ? '#e8e2dc' : '#212529'),
        label: (ele: cytoscape.NodeSingular) => {
          const isMotif = ele.data('aggregateKind') === 'repeated-component';
          return detailLevel() === 'summary' && !isMotif ? '' : (ele.data('label') as string);
        },
        'font-size': () => (detailLevel() === 'summary' ? '9px' : '10px'),
        'text-valign': 'bottom',
        'text-margin-y': 5,
        'text-wrap': 'wrap',
        'text-max-width': () =>
          detailLevel() === 'detail' || detailLevel() === 'literals-detail'
            ? '160px'
            : '140px',
        'text-outline-color': () => (isDark() ? '#201f1d' : '#ffffff'),
        'text-outline-width': 2,
      } as cytoscape.Css.Node,
    },
    {
      selector: 'node[aggregate]',
      style: {
        shape: 'round-rectangle',
        'border-width': 3,
        'font-weight': 'bold',
        'font-size': '11px',
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
        'line-color': () => (isDark() ? '#68615b' : '#B0BEC5'),
        'target-arrow-color': () => (isDark() ? '#68615b' : '#B0BEC5'),
        'target-arrow-shape': 'triangle',
        'font-size': '9px',
        'text-wrap': 'wrap',
        'text-max-width': '140px',
        'text-background-color': () => (isDark() ? '#242321' : '#ffffff'),
        'text-background-opacity': 0.9,
        'text-background-padding': '2px',
        // El backend emite una arista por predicado (el edgeId incluye el
        // predicado), así que dos entidades pueden tener varias entre sí. Bezier
        // las abanica solo; el default de 40 las deja muy juntas en un cuadrante.
        'control-point-step-size': 55,
      },
    },
    {
      selector: 'edge[aggregate]',
      style: {
        'line-style': 'dashed',
        label: (ele: cytoscape.EdgeSingular) =>
          detailLevel() === 'detail' || detailLevel() === 'literals-detail'
            ? (ele.data('predicateLabel') as string)
            : '',
        'text-rotation': 'autorotate',
      } as cytoscape.Css.Edge,
    },
    {
      selector: 'edge[aggregateKind = "repeated-component-edge"]',
      style: {
        width: 5,
        'line-style': 'solid',
        label: (ele: cytoscape.EdgeSingular) => ele.data('predicateLabel') as string,
        'font-size': '11px',
        'font-weight': 'bold',
        'text-background-color': () => (isDark() ? '#242321' : '#ffffff'),
        'text-background-opacity': 0.9,
        'text-background-padding': '3px',
        'text-rotation': 'autorotate',
      } as cytoscape.Css.Edge,
    },
    {
      selector: 'edge:not([aggregate])',
      style: {
        label: (ele: cytoscape.EdgeSingular) =>
          detailLevel() === 'detail' || detailLevel() === 'literals-detail'
            ? (ele.data('predicateLabel') as string)
            : '',
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
        'border-color': () => (isDark() ? '#79a7e3' : '#1565C0'),
        'text-outline-width': 3,
        'font-weight': 'bold',
        'font-size': '11px',
      } as cytoscape.Css.Node,
    },
    {
      selector: '.is-dimmed',
      style: {
        opacity: 0.4,
      },
    },
    {
      // Dentro del foco coordinado, lo que no es el nodo seleccionado: se ve,
      // pero deja de competir con él. Sin esto, con el foco que mandan el mapa
      // y la timeline (decenas de nodos) el seleccionado no se distinguía.
      selector: '.is-muted',
      style: {
        opacity: 0.7,
      },
    },
    {
      // Después de las reglas de atenuación: el seleccionado nunca se atenúa.
      selector: '.is-selected',
      style: {
        opacity: 1,
      },
    },
    {
      selector: 'edge.is-focus-edge',
      style: {
        width: 2.5,
        'line-color': () => (isDark() ? '#79a7e3' : '#1565C0'),
        'target-arrow-color': () => (isDark() ? '#79a7e3' : '#1565C0'),
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
