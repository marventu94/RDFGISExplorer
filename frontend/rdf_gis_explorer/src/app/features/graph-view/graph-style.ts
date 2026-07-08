import type cytoscape from 'cytoscape';
import type { EntityColorService } from '@core/services/entity-color.service';

export function createGraphStyle(
  colorService: EntityColorService,
  isDark: () => boolean,
): cytoscape.StylesheetStyle[] {
  return [
    {
      selector: 'node',
      style: {
        'background-color': (ele: cytoscape.NodeSingular) =>
          colorService.colorForType(ele.data('type') as string | undefined),
        'border-color': (ele: cytoscape.NodeSingular) => {
          const c = colorService.colorForType(ele.data('type') as string | undefined);
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
        label: 'data(label)',
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
      selector: 'edge',
      style: {
        'curve-style': 'bezier',
        width: 1.5,
        'line-color': () => (isDark() ? '#475569' : '#B0BEC5'),
        'target-arrow-color': () => (isDark() ? '#475569' : '#B0BEC5'),
        'target-arrow-shape': 'triangle',
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
