import type cytoscape from 'cytoscape';
import { createGraphStyle } from './graph-style';

function element(data: Record<string, unknown>): cytoscape.NodeSingular {
  return { data: (key: string) => data[key] } as unknown as cytoscape.NodeSingular;
}

describe('createGraphStyle', () => {
  const colorService = {
    colorForClass: () => '#90a4ae',
  };

  it('muestra las etiquetas del motivo agregado en Resumen', () => {
    const styles = createGraphStyle(colorService as never, () => false, () => 'summary');
    const nodeStyle = styles.find((style) => style.selector === 'node')!.style as Record<
      string,
      unknown
    >;
    const label = nodeStyle['label'] as (node: cytoscape.NodeSingular) => string;

    expect(label(element({ label: 'listing (326)', aggregateKind: 'repeated-component' }))).toBe(
      'listing (326)',
    );
    expect(label(element({ label: 'listing_site1_1' }))).toBe('');
  });

  it('muestra el predicado y la multiplicidad del motivo en Resumen', () => {
    const styles = createGraphStyle(colorService as never, () => false, () => 'summary');
    const motifStyle = styles.find(
      (style) => style.selector === 'edge[aggregateKind = "repeated-component-edge"]',
    )!.style as Record<string, unknown>;
    const label = motifStyle['label'] as (edge: cytoscape.EdgeSingular) => string;

    expect(label(element({ predicateLabel: 'about ×326' }) as unknown as cytoscape.EdgeSingular)).toBe(
      'about ×326',
    );
  });
});
