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
  it('siembra posiciones distintas para que el layout no parta con aristas de longitud cero', () => {
    const source = makeNode('source');
    const target = makeNode('target');

    const built = buildGraphElements(
      makeQueryResult([source, target], [makeEdge(source.uri, target.uri, 'relatedTo')]),
      { maxNodes: 300 },
    );
    const positions = built.elements
      .filter((element) => !('source' in element.data))
      .map((element) => element.position);

    expect(positions).toHaveLength(2);
    expect(positions[0]).toBeDefined();
    expect(positions[1]).toBeDefined();
    expect(positions[0]).not.toEqual(positions[1]);
  });

  it('resume componentes multi-etapa isomorfos sin perder sus relaciones', () => {
    const nodes = Array.from({ length: 2 }, (_, index) => [
      makeNode(`listing-${index}`, { queryVariable: 'listing' }),
      makeNode(`estate-${index}`, { queryVariable: 'realEstate' }),
      makeNode(`geometry-${index}`, { queryVariable: 'geometry' }),
    ]).flat();
    const edges = Array.from({ length: 2 }, (_, index) => [
      makeEdge(`listing-${index}`, `estate-${index}`, 'http://example.org/about'),
      makeEdge(`estate-${index}`, `geometry-${index}`, 'http://example.org/hasGeometry'),
    ]).flat();
    const bindings = Array.from({ length: 2 }, (_, index) => ({
      listing: { type: 'uri' as const, value: `listing-${index}` },
      realEstate: { type: 'uri' as const, value: `estate-${index}` },
      geometry: { type: 'uri' as const, value: `geometry-${index}` },
    }));

    const built = buildGraphElements(makeQueryResult(nodes, edges, bindings), {
      maxNodes: 300,
      detailLevel: 'summary',
    });

    expect(
      built.elements.filter((element) => element.data['aggregateKind'] === 'repeated-component'),
    ).toHaveLength(3);
    expect(
      built.elements.filter(
        (element) => element.data['aggregateKind'] === 'repeated-component-edge',
      ),
    ).toHaveLength(2);
    expect(built.abstractedNodes).toBe(6);
    expect(built.motifCount).toBe(1);
  });

  it('conserva multiplicidades internas al resumir variantes estructurales repetidas', () => {
    const nodes = Array.from({ length: 2 }, (_, component) => [
      makeNode(`listing-${component}`, { queryVariable: 'listing' }),
      makeNode(`address-${component}-a`, { queryVariable: 'address' }),
      makeNode(`address-${component}-b`, { queryVariable: 'address' }),
    ]).flat();
    const edges = Array.from({ length: 2 }, (_, component) => [
      makeEdge(`listing-${component}`, `address-${component}-a`, 'http://example.org/hasAddress'),
      makeEdge(`listing-${component}`, `address-${component}-b`, 'http://example.org/hasAddress'),
    ]).flat();

    const built = buildGraphElements(makeQueryResult(nodes, edges), {
      maxNodes: 300,
      detailLevel: 'summary',
    });
    const motifNodes = built.elements.filter(
      (element) => element.data['aggregateKind'] === 'repeated-component',
    );
    const motifEdge = built.elements.find(
      (element) => element.data['aggregateKind'] === 'repeated-component-edge',
    );

    expect(motifNodes.map((element) => element.data['label']).sort()).toEqual([
      'address (4)',
      'listing (2)',
    ]);
    expect(motifEdge?.data['componentCount']).toBe(2);
    expect(motifEdge?.data['multiplicity']).toBe(4);
    expect(motifEdge?.data['representedTriples']).toBe(4);
  });

  it('resume componentes de dos nodos repetidos como un motivo reversible', () => {
    const nodes = Array.from({ length: 3 }, (_, index) => [
      makeNode(`listing-${index}`, { queryVariable: 'listing' }),
      makeNode(`estate-${index}`, { queryVariable: 'realEstate' }),
    ]).flat();
    const edges = Array.from({ length: 3 }, (_, index) =>
      makeEdge(`listing-${index}`, `estate-${index}`, 'http://rdfs.org/sioc/ns#about'),
    );
    const bindings = Array.from({ length: 3 }, (_, index) => ({
      listing: { type: 'uri' as const, value: `listing-${index}` },
      realEstate: { type: 'uri' as const, value: `estate-${index}` },
    }));

    const built = buildGraphElements(makeQueryResult(nodes, edges, bindings), {
      maxNodes: 300,
      detailLevel: 'summary',
    });
    const motifNodes = built.elements.filter(
      (element) => element.data['aggregateKind'] === 'repeated-component',
    );
    const sourceMotif = motifNodes.find(
      (element) => element.data['groupingValue'] === 'listing',
    );
    const motifEdge = built.elements.find(
      (element) => element.data['aggregateKind'] === 'repeated-component-edge',
    );

    expect(motifNodes).toHaveLength(2);
    expect(motifNodes.map((element) => element.data['label'])).toEqual([
      'listing (3)',
      'realEstate (3)',
    ]);
    expect(sourceMotif?.data['groupingSource']).toBe('query-variable');
    expect(sourceMotif?.data['groupingValue']).toBe('listing');
    expect(motifEdge?.data['componentCount']).toBe(3);
    expect(motifEdge?.data['multiplicity']).toBe(3);
    expect(motifEdge?.data['representedTriples']).toBe(3);
    expect(motifEdge?.data['direction']).toBe('directed');
    expect(motifEdge?.data['memberEdgeIds']).toEqual(edges.map((edge) => edge.id));
    expect(built.abstractedNodes).toBe(6);
    expect(built.motifCount).toBe(1);
  });

  it('conserva el id del motivo en sus aristas expandidas para poder contraerlo', () => {
    const nodes = Array.from({ length: 2 }, (_, index) => [
      makeNode(`listing-${index}`, { queryVariable: 'listing' }),
      makeNode(`estate-${index}`, { queryVariable: 'realEstate' }),
    ]).flat();
    const edges = Array.from({ length: 2 }, (_, index) =>
      makeEdge(`listing-${index}`, `estate-${index}`, 'http://rdfs.org/sioc/ns#about'),
    );
    const bindings = Array.from({ length: 2 }, (_, index) => ({
      listing: { type: 'uri' as const, value: `listing-${index}` },
      realEstate: { type: 'uri' as const, value: `estate-${index}` },
    }));
    const result = makeQueryResult(nodes, edges, bindings);
    const summary = buildGraphElements(result, { maxNodes: 300, detailLevel: 'summary' });
    const motifId = String(
      summary.elements.find(
        (element) => element.data['aggregateKind'] === 'repeated-component-edge',
      )!.data['motifId'],
    );

    const expanded = buildGraphElements(result, {
      maxNodes: 300,
      detailLevel: 'summary',
      expandedMotifIds: [motifId],
    });
    const expandedEdges = expanded.elements.filter((element) => 'source' in element.data);

    expect(expandedEdges).toHaveLength(2);
    expect(expandedEdges.every((element) => element.data['motifId'] === motifId)).toBe(true);
  });

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
