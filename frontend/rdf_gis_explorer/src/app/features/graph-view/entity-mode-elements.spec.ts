import { describe, expect, it } from 'vitest';
import { buildEntitySubgraph, type EntitySubgraph } from './entity-subgraph';
import {
  activeBranchItems,
  buildEntityModeElements,
  entityBreadcrumb,
  entityLabelResolver,
  entityMetricsLabel,
  entityNodeRole,
  entityWarningsLabel,
  otherBranchItems,
  shortenUri,
} from './entity-mode-elements';
import { realEstateFixture, wideStarFixture } from './testing/entity-subgraph-fixtures';

function subgraphOf(
  overrides: Partial<Parameters<typeof buildEntitySubgraph>[0]> = {},
): EntitySubgraph {
  const fixture = realEstateFixture();
  return buildEntitySubgraph({
    visibleResult: fixture.result,
    rootUri: fixture.root,
    ...overrides,
  });
}

describe('shortenUri', () => {
  it('conserva los bnodes opacos tal cual', () => {
    expect(shortenUri('_:b0')).toBe('_:b0');
  });

  it('abrevia por fragmento cuando lo hay', () => {
    expect(shortenUri('http://example.org/ontology#Listing')).toBe('…#Listing');
  });

  it('deja los dos últimos segmentos de la ruta', () => {
    expect(shortenUri('http://example.org/resource/listing/0')).toBe('…/listing/0');
  });

  it('no abrevia lo que ya es corto', () => {
    expect(shortenUri('urn:x')).toBe('urn:x');
  });
});

describe('buildEntityModeElements', () => {
  it('dibuja todos los nodos y aristas del subgrafo, sin recortar', () => {
    const subgraph = subgraphOf();
    const built = buildEntityModeElements(subgraph);

    const nodeIds = built.elements
      .filter((element) => !('source' in element.data))
      .map((element) => element.data['id']);
    const edgeIds = built.elements
      .filter((element) => 'source' in element.data)
      .map((element) => element.data['id']);

    expect(nodeIds).toEqual(subgraph.nodes.map((node) => node.uri));
    expect(edgeIds).toEqual(subgraph.edges.map((edge) => edge.id));
    expect(built.nodeCount).toBe(subgraph.nodes.length);
    expect(built.edgeCount).toBe(subgraph.edges.length);
  });

  it('marca la raíz con su papel y su clase de estilo', () => {
    const fixture = realEstateFixture();
    const subgraph = subgraphOf();
    const built = buildEntityModeElements(subgraph);
    const root = built.elements.find((element) => element.data['id'] === fixture.root)!;

    expect(root.data['entityRole']).toBe('root');
    expect(root.classes).toContain('entity-role-root');
  });

  it('distingue nodo activo, fijado y hub', () => {
    const fixture = realEstateFixture();
    const subgraph = buildEntitySubgraph({
      visibleResult: fixture.result,
      rootUri: fixture.root,
      activeUri: fixture.estate,
      pinnedUris: [fixture.address],
    });
    const built = buildEntityModeElements(subgraph);
    const byId = new Map(built.elements.map((element) => [element.data['id'], element]));

    expect(byId.get(fixture.estate)!.data['entityRole']).toBe('active');
    expect(byId.get(fixture.address)!.data['entityRole']).toBe('pinned');
    const partido = byId.get(fixture.partido);
    if (partido) {
      expect(partido.data['entityHub']).toBe(true);
      expect(partido.classes).toContain('entity-hub');
    }
  });

  it('anota cuántos vecinos pendientes tiene cada nodo expandible', () => {
    const subgraph = buildEntitySubgraph({
      visibleResult: wideStarFixture(12),
      rootUri: 'http://example.org/star/root',
      budget: { maxNodes: 4 },
    });
    const built = buildEntityModeElements(subgraph);
    const hub = built.elements.find(
      (element) => element.data['id'] === 'http://example.org/star/hub',
    )!;

    expect(hub.data['entityPending'] as number).toBeGreaterThan(0);
    expect(hub.classes).toContain('entity-expandable');
  });

  it('entrega posiciones semilla deterministas para el layout incremental', () => {
    const first = buildEntityModeElements(subgraphOf());
    const second = buildEntityModeElements(subgraphOf());

    expect(first.elements.map((element) => element.position)).toEqual(
      second.elements.map((element) => element.position),
    );
    expect(first.elements[0].position).toBeDefined();
  });

  it('cuenta el grado dibujado por nodo', () => {
    const fixture = realEstateFixture();
    const subgraph = subgraphOf();
    const built = buildEntityModeElements(subgraph);
    const root = built.elements.find((element) => element.data['id'] === fixture.root)!;
    const drawn = subgraph.edges.filter(
      (edge) => edge.source === fixture.root || edge.target === fixture.root,
    ).length;

    expect(root.data['degree']).toBe(drawn);
  });
});

describe('entityNodeRole', () => {
  it('resuelve la raíz por encima de cualquier otro papel', () => {
    const subgraph = subgraphOf();
    const root = subgraph.nodes.find((node) => node.isRoot)!;
    expect(entityNodeRole({ ...root, isPinned: true, isHub: true })).toBe('root');
  });
});

describe('literales por nodo', () => {
  it('muestra cada atributo sólo en el nodo que lo posee', () => {
    const subgraph = subgraphOf();
    const listing = subgraph.nodes[0];
    const specification = subgraph.nodes[1];
    listing.node.attributes = {};
    specification.node.attributes = {
      moneda: { type: 'literal', value: 'USD' },
      precio: { type: 'literal', value: '125000' },
    };

    const graph = buildEntityModeElements(subgraph);
    const listingElement = graph.elements.find((element) => element.data['id'] === listing.uri);
    const specificationElement = graph.elements.find(
      (element) => element.data['id'] === specification.uri,
    );

    expect(listingElement?.data['attributeLabel']).toBe('');
    expect(specificationElement?.data['attributeLabel']).toBe(
      'moneda: USD\nprecio: 125000',
    );
  });
});

describe('ramas', () => {
  it('lista las ramas del nodo activo con sus conteos', () => {
    const fixture = realEstateFixture();
    const subgraph = buildEntitySubgraph({
      visibleResult: fixture.result,
      rootUri: fixture.root,
      activeUri: fixture.estate,
    });
    const items = activeBranchItems(subgraph);

    expect(items.length).toBeGreaterThan(0);
    expect(items.every((item) => item.nodeUri === fixture.estate)).toBe(true);
    const about = items.find((item) => item.direction === 'incoming');
    expect(about?.label.startsWith('←')).toBe(true);
    expect(items[0].detail).toContain('tripleta');
  });

  it('marca las ramas que llegan a un recurso compartido', () => {
    const fixture = realEstateFixture();
    const subgraph = buildEntitySubgraph({
      visibleResult: fixture.result,
      rootUri: fixture.root,
      budget: { maxNodes: 3 },
    });
    const hubBranches = [...activeBranchItems(subgraph), ...otherBranchItems(subgraph)].filter(
      (item) => item.reachesHub,
    );

    for (const branch of hubBranches) expect(branch.detail).toContain('recurso compartido');
  });

  it('las otras ramas excluyen al nodo activo y se acotan', () => {
    const subgraph = subgraphOf();
    const items = otherBranchItems(subgraph, 2);

    expect(items.length).toBeLessThanOrEqual(2);
    expect(items.every((item) => item.nodeUri !== subgraph.activeUri)).toBe(true);
    expect(items.every((item) => item.pendingCount > 0)).toBe(true);
    expect(items.every((item) => item.revealedUri !== null)).toBe(true);
    // Con nodo en el texto: hace falta para saber de dónde sale la rama.
    for (const item of items) expect(item.label).toContain(item.nodeLabel);
  });

  it('una rama sin pendientes no se ofrece para expandir', () => {
    const subgraph = subgraphOf();
    const items = activeBranchItems(subgraph);
    for (const item of items) {
      if (item.pendingCount === 0) expect(item.canExpand).toBe(false);
    }
  });

  it('produce siempre el mismo orden para el mismo subgrafo', () => {
    expect(otherBranchItems(subgraphOf()).map((item) => item.id)).toEqual(
      otherBranchItems(subgraphOf()).map((item) => item.id),
    );
  });
});

describe('breadcrumb y métricas', () => {
  it('marca sólo la última raíz como vigente', () => {
    const crumbs = entityBreadcrumb(['http://example.org/a', 'http://example.org/b'], (uri) => uri);

    expect(crumbs.map((crumb) => crumb.current)).toEqual([false, true]);
    expect(crumbs[0].shortUri).toBe(shortenUri('http://example.org/a'));
  });

  it('informa visibles, disponibles y omitidos', () => {
    const subgraph = buildEntitySubgraph({
      visibleResult: wideStarFixture(12),
      rootUri: 'http://example.org/star/root',
      budget: { maxNodes: 4 },
    });
    const label = entityMetricsLabel(subgraph);

    expect(label).toContain('nodos');
    expect(label).toContain('tripleta');
    expect(label).toContain('disponibles');
    if (subgraph.omitted.nodes.length > 0) expect(label).toContain('omitidos');
  });

  it('no inventa texto sin subgrafo', () => {
    expect(entityMetricsLabel(null)).toBe('');
    expect(entityWarningsLabel(null)).toBe('');
  });

  it('expone las advertencias del subgrafo en un solo texto', () => {
    const fixture = realEstateFixture();
    const subgraph = buildEntitySubgraph({
      visibleResult: { ...fixture.result, nodes: [], edges: [], bindings: [] },
      fullResult: fixture.result,
      rootUri: fixture.root,
    });

    expect(entityWarningsLabel(subgraph)).toContain('resultado completo');
  });

  it('resuelve etiquetas con la URI como último recurso', () => {
    const labelOf = entityLabelResolver(subgraphOf());
    expect(labelOf('http://example.org/listing/0')).toBe('Aviso 0');
    expect(labelOf('http://example.org/desconocido')).toBe('http://example.org/desconocido');
  });
});
