import {
  chooseGraphLayout,
  GRAPH_LAYOUT_OPTIONS,
  initialColaOptions,
  layoutOptionsFor,
} from './graph-layouts';

const node = (uri: string) => ({ uri, label: uri, attributes: {} });
const edge = (id: string, source: string, target: string) => ({
  id,
  source,
  target,
  predicate: 'p',
});

describe('chooseGraphLayout', () => {
  it('uses grid for isolated nodes', () => {
    expect(chooseGraphLayout({ nodes: [node('a')], edges: [] })).toBe('grid');
  });

  it('uses dagre for an acyclic directed graph', () => {
    expect(
      chooseGraphLayout({
        nodes: [node('a'), node('b'), node('c')],
        edges: [edge('ab', 'a', 'b'), edge('bc', 'b', 'c')],
      }),
    ).toBe('dagre');
  });

  it('uses dagre for cycles and self-loops', () => {
    expect(
      chooseGraphLayout({
        nodes: [node('a'), node('b')],
        edges: [edge('ab', 'a', 'b'), edge('ba', 'b', 'a')],
      }),
    ).toBe('dagre');
    expect(chooseGraphLayout({ nodes: [node('a')], edges: [edge('aa', 'a', 'a')] })).toBe('dagre');
  });
});

describe('layoutOptionsFor', () => {
  it('keeps stable persisted ids behind user-facing names', () => {
    expect(GRAPH_LAYOUT_OPTIONS.map(({ value, label }) => ({ value, label }))).toEqual([
      { value: 'dagre', label: 'Jerárquico' },
      { value: 'cola', label: 'Orgánico' },
      { value: 'grid', label: 'Cuadrícula' },
    ]);
  });

  it('includes labels and increases dagre separation with detail', () => {
    const summary = layoutOptionsFor('dagre', 'summary') as unknown as Record<string, unknown>;
    const entities = layoutOptionsFor('dagre', 'exploration') as unknown as Record<string, unknown>;
    const relations = layoutOptionsFor('dagre', 'detail') as unknown as Record<string, unknown>;

    expect(summary['nodeDimensionsIncludeLabels']).toBe(true);
    expect(summary).toMatchObject({ nodeSep: 34, rankSep: 70, edgeSep: 14 });
    expect(entities).toMatchObject({ nodeSep: 60, rankSep: 95, edgeSep: 24 });
    expect(relations).toMatchObject({ nodeSep: 78, rankSep: 125, edgeSep: 36 });
  });

  it('keeps cola deterministic and drops the flow constraint for large graphs', () => {
    const small = initialColaOptions('exploration', 40) as unknown as Record<string, unknown>;
    const large = initialColaOptions('exploration', 300) as unknown as Record<string, unknown>;

    expect(small).toMatchObject({ randomize: false, maxSimulationTime: 4000 });
    expect(small['flow']).toBeDefined();
    expect(large['flow']).toBeUndefined();
  });
});
