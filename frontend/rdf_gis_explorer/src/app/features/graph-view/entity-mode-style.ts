import type cytoscape from 'cytoscape';
import type { GraphDetailLevel } from './graph-layouts';

/**
 * Etapa 5: reglas de estilo adicionales del modo entidad.
 *
 * Se anexan al final de `createGraphStyle()` en vez de modificarlo: todas
 * seleccionan por clases (`.entity-*`) que sólo existen cuando el modo entidad
 * está dibujando, así que la vista de resultado queda exactamente igual.
 */
export function entityModeStyleRules(
  isDark: () => boolean,
  detailLevel: () => GraphDetailLevel,
): cytoscape.StylesheetStyle[] {
  const accent = '#1565C0';
  const activeAccent = '#EF6C00';
  return [
    {
      // En el modo entidad siempre se lee la etiqueta: se vino a inspeccionar
      // una estructura concreta, no a mirar una nube.
      selector: 'node.entity-node',
      style: {
        label: (ele: cytoscape.NodeSingular) => {
          if (detailLevel() === 'summary') return '';
          const label = (ele.data('label') as string) ?? '';
          const attributes = (ele.data('attributeLabel') as string) ?? '';
          return (detailLevel() === 'literals' || detailLevel() === 'literals-detail') && attributes
            ? `${label}\n${attributes}`
            : label;
        },
        'font-size': '10px',
      } as cytoscape.Css.Node,
    },
    {
      selector: 'node.entity-expandable',
      style: {
        'border-style': 'double',
        'border-width': 3,
      } as cytoscape.Css.Node,
    },
    {
      selector: 'node.entity-hub',
      style: {
        shape: 'hexagon',
      } as cytoscape.Css.Node,
    },
    {
      selector: 'node.entity-boundary',
      style: {
        'border-style': 'dashed',
        'background-opacity': 0.55,
      } as cytoscape.Css.Node,
    },
    {
      selector: 'node.entity-pinned',
      style: {
        'border-color': '#6A1B9A',
        'border-width': 4,
        'border-style': 'solid',
      } as cytoscape.Css.Node,
    },
    {
      selector: 'node.entity-role-active',
      style: {
        'border-color': activeAccent,
        'border-width': 4,
        'border-style': 'solid',
        'font-weight': 'bold',
      } as cytoscape.Css.Node,
    },
    {
      // La raíz va última para ganarle a cualquier otro papel: es el origen de
      // la exploración y tiene que reconocerse de un vistazo.
      selector: 'node.entity-role-root',
      style: {
        shape: 'round-rectangle',
        'border-color': accent,
        'border-width': 5,
        'border-style': 'solid',
        'font-size': '12px',
        'font-weight': 'bold',
        'text-outline-width': 3,
      } as cytoscape.Css.Node,
    },
    {
      selector: 'edge.entity-edge',
      style: {
        width: 2,
        'line-color': () => (isDark() ? '#64748b' : '#90A4AE'),
        'target-arrow-color': () => (isDark() ? '#64748b' : '#90A4AE'),
      } as cytoscape.Css.Edge,
    },
  ];
}
