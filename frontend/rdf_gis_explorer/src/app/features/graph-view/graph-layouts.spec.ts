import { chooseGraphLayout } from './graph-layouts';

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

  it('uses cola for cycles and self-loops', () => {
    expect(
      chooseGraphLayout({
        nodes: [node('a'), node('b')],
        edges: [edge('ab', 'a', 'b'), edge('ba', 'b', 'a')],
      }),
    ).toBe('cola');
    expect(chooseGraphLayout({ nodes: [node('a')], edges: [edge('aa', 'a', 'a')] })).toBe('cola');
  });
});
