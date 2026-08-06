import { buildGraphElements } from './graph-elements';
import {
  makeEdge,
  makeHubWithLeaves,
  makeNode,
  makeParallelRelations,
  makeQueryResult,
} from './testing/graph-fixtures';

function nodeIds(result: ReturnType<typeof buildGraphElements>): string[] {
  return result.elements.filter((e) => !('source' in e.data)).map((e) => String(e.data.id));
}

function edgeIds(result: ReturnType<typeof buildGraphElements>): string[] {
  return result.elements.filter((e) => 'source' in e.data).map((e) => String(e.data.id));
}

describe('buildGraphElements', () => {
  it('un pinned de grado cero sobrevive al cap aunque compita contra hubs', () => {
    // Hub con 40 hojas + un nodo aislado: con maxNodes 2, sin pinning entrarían
    // el hub y una hoja; el aislado (seleccionado) tiene grado cero.
    const base = makeHubWithLeaves(40);
    const lonely = makeNode('http://example.org/lonely');
    const result = makeQueryResult([...base.nodes, lonely], base.edges);

    const built = buildGraphElements(result, { maxNodes: 2, pinnedUris: [lonely.uri] });

    expect(nodeIds(built)).toContain(lonely.uri);
    expect(nodeIds(built)).toContain('http://example.org/hub');
    expect(built.drawnNodes).toBe(2);
  });

  it('no privilegia un hub estructural sobre un pinned', () => {
    // El hub estructural concentra el grado; el pinned es una hoja cualquiera.
    // Pinned primero: la hoja seleccionada desplaza a otras hojas de igual grado.
    const base = makeHubWithLeaves(10);
    const pinnedLeaf = 'http://example.org/leaf9';

    const built = buildGraphElements(base, { maxNodes: 3, pinnedUris: [pinnedLeaf] });
    const ids = nodeIds(built);

    expect(ids[0]).toBe(pinnedLeaf);
    expect(ids).toContain('http://example.org/hub');
    expect(ids).toHaveLength(3);
  });

  it('es determinista ante empates de grado (conserva el orden de entrada)', () => {
    const base = makeHubWithLeaves(10); // todas las hojas empatan con grado 1
    const first = buildGraphElements(base, { maxNodes: 4 });
    const second = buildGraphElements(base, { maxNodes: 4 });

    expect(nodeIds(first)).toEqual(nodeIds(second));
    // Hub + las 3 primeras hojas en el orden del resultado.
    expect(nodeIds(first)).toEqual([
      'http://example.org/hub',
      'http://example.org/leaf0',
      'http://example.org/leaf1',
      'http://example.org/leaf2',
    ]);
  });

  it('dibuja una arista solo si ambos extremos sobrevivieron al corte', () => {
    const nodes = ['Q1', 'Q2', 'Q3'].map((id) => makeNode(id));
    const edges = [makeEdge('Q1', 'Q2'), makeEdge('Q1', 'Q3')];
    const built = buildGraphElements(makeQueryResult(nodes, edges), { maxNodes: 2 });

    // Q1 (grado 2) y una de Q2/Q3 sobreviven; la arista al descartado no se dibuja
    // y cuenta como oculta por truncado.
    expect(edgeIds(built)).toHaveLength(1);
    expect(built.edgesHiddenByTruncation).toBe(1);
  });

  it('no muta el QueryResult ni el orden de sus nodos/aristas', () => {
    const base = makeHubWithLeaves(10);
    const nodesBefore = [...base.nodes];
    const edgesBefore = [...base.edges];

    buildGraphElements(base, { maxNodes: 2, pinnedUris: ['http://example.org/leaf5'] });

    // Mismas referencias y mismo orden: el recorte trabaja sobre copias.
    expect(base.nodes.map((n) => n.uri)).toEqual(nodesBefore.map((n) => n.uri));
    expect(base.edges).toEqual(edgesBefore);
  });

  it('dibuja self-loops y aristas paralelas (mismo par, predicados distintos)', () => {
    const built = buildGraphElements(makeParallelRelations(), { maxNodes: 300 });
    const drawn = built.elements.filter((e) => 'source' in e.data);

    expect(drawn).toHaveLength(3);
    const byPredicate = drawn.map((e) => String(e.data['predicate']));
    expect(new Set(byPredicate).size).toBe(3);
    // El self-loop tiene source === target y aun así entra.
    expect(
      drawn.some((e) => e.data['source'] === 'http://example.org/a' && e.data['target'] === 'http://example.org/a'),
    ).toBe(true);
    expect(drawn.find((e) => e.data['source'] === 'http://example.org/a' && e.data['target'] === 'http://example.org/b')?.data['multiplicity']).toBe(2);
  });

  it('expone classUri y queryVariable en el data del nodo', () => {
    const node = makeNode('http://example.org/n1', {
      classes: ['http://example.org/class/Person', 'http://example.org/class/Agent'],
      queryVariable: 'person',
    });
    const built = buildGraphElements(makeQueryResult([node]), { maxNodes: 300 });
    const data = built.elements[0].data as Record<string, unknown>;

    expect(data['classUri']).toBe('http://example.org/class/Person');
    expect(data['classes']).toEqual(['http://example.org/class/Person', 'http://example.org/class/Agent']);
    expect(data['queryVariable']).toBe('person');
  });

  it('un pinned que no existe en el resultado no rompe nada ni cuenta', () => {
    const base = makeHubWithLeaves(5);
    const built = buildGraphElements(base, { maxNodes: 3, pinnedUris: ['http://example.org/ghost'] });

    expect(built.drawnNodes).toBe(3);
    expect(nodeIds(built)).not.toContain('http://example.org/ghost');
  });

  it('sin recorte devuelve todos los nodos y aristas', () => {
    const base = makeParallelRelations();
    const built = buildGraphElements(base, { maxNodes: 300 });

    expect(built.drawnNodes).toBe(2);
    expect(built.totalNodes).toBe(2);
    expect(built.edgesHiddenByTruncation).toBe(0);
    expect(built.elements).toHaveLength(2 + 3);
  });
});
