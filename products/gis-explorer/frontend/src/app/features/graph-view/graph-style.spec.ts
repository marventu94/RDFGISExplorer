import type cytoscape from 'cytoscape';
import { createGraphStyle } from './graph-style';

function element(data: Record<string, unknown>): cytoscape.NodeSingular {
  return { data: (key: string) => data[key] } as unknown as cytoscape.NodeSingular;
}

describe('createGraphStyle', () => {
  const colorService = {
    colorForClass: () => '#90a4ae',
  };

  it('shows aggregate motif labels in Summary', () => {
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

  it('shows motif predicate and multiplicity in Summary', () => {
    const styles = createGraphStyle(colorService as never, () => false, () => 'summary');
    const motifStyle = styles.find(
      (style) => style.selector === 'edge[aggregateKind = "repeated-component-edge"]',
    )!.style as Record<string, unknown>;
    const label = motifStyle['label'] as (edge: cytoscape.EdgeSingular) => string;

    expect(label(element({ predicateLabel: 'about ×326' }) as unknown as cytoscape.EdgeSingular)).toBe(
      'about ×326',
    );
  });

  it('reserves larger typography for aggregates and selection', () => {
    const styles = createGraphStyle(colorService as never, () => false, () => 'detail');
    const node = styles.find((style) => style.selector === 'node')!.style as Record<string, unknown>;
    const aggregate = styles.find((style) => style.selector === 'node[aggregate]')!.style as Record<string, unknown>;
    const selected = styles.find((style) => style.selector === 'node.is-selected')!.style as Record<string, unknown>;

    expect((node['font-size'] as () => string)()).toBe('10px');
    expect(node['text-wrap']).toBe('wrap');
    expect((node['text-max-width'] as () => string)()).toBe('160px');
    expect(aggregate['font-size']).toBe('11px');
    expect(selected['font-size']).toBe('11px');
    expect(selected['font-weight']).toBe('bold');
  });

  it('maintains label contrast in the dark theme', () => {
    const styles = createGraphStyle(colorService as never, () => true, () => 'detail');
    const node = styles.find((style) => style.selector === 'node')!.style as Record<string, unknown>;
    const edge = styles.find((style) => style.selector === 'edge')!.style as Record<string, unknown>;

    expect((node['color'] as () => string)()).toBe('#e8e2dc');
    expect((node['text-outline-color'] as () => string)()).toBe('#201f1d');
    expect((edge['text-background-color'] as () => string)()).toBe('#242321');
  });

  it('keeps unselected nodes visible', () => {
    const styles = createGraphStyle(colorService as never, () => false, () => 'detail');
    const dimmed = styles.find((style) => style.selector === '.is-dimmed')!.style as Record<string, unknown>;
    const muted = styles.find((style) => style.selector === '.is-muted')!.style as Record<string, unknown>;

    expect(dimmed['opacity']).toBe(0.4);
    expect(muted['opacity']).toBe(0.7);
  });
});
