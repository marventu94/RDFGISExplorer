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
  it('retains opaque bnodes unchanged', () => {
    expect(shortenUri('_:b0')).toBe('_:b0');
  });

  it('abbreviates by fragment when present', () => {
    expect(shortenUri('http://example.org/ontology#Listing')).toBe('…#Listing');
  });

  it('retains the last two path segments', () => {
    expect(shortenUri('http://example.org/resource/listing/0')).toBe('…/listing/0');
  });

  it('does not abbreviate an already short value', () => {
    expect(shortenUri('urn:x')).toBe('urn:x');
  });
});

describe('buildEntityModeElements', () => {
  it('draws every subgraph node and edge without trimming', () => {
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

  it('marks the root with its role and style class', () => {
    const fixture = realEstateFixture();
    const subgraph = subgraphOf();
    const built = buildEntityModeElements(subgraph);
    const root = built.elements.find((element) => element.data['id'] === fixture.root)!;

    expect(root.data['entityRole']).toBe('root');
    expect(root.classes).toContain('entity-role-root');
  });

  it('distinguishes active, pinned, and hub nodes', () => {
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

  it('records pending-neighbor counts for expandable nodes', () => {
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

  it('provides deterministic seed positions for incremental layout', () => {
    const first = buildEntityModeElements(subgraphOf());
    const second = buildEntityModeElements(subgraphOf());

    expect(first.elements.map((element) => element.position)).toEqual(
      second.elements.map((element) => element.position),
    );
    expect(first.elements[0].position).toBeDefined();
  });

  it('counts drawn degree per node', () => {
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
  it('resolves the root above every other role', () => {
    const subgraph = subgraphOf();
    const root = subgraph.nodes.find((node) => node.isRoot)!;
    expect(entityNodeRole({ ...root, isPinned: true, isHub: true })).toBe('root');
  });
});

describe('literals by node', () => {
  it('shows each attribute only on its owning node', () => {
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

  it('does not print URI or blank-node references as node literals', () => {
    const subgraph = subgraphOf();
    const specification = subgraph.nodes[1];
    specification.node.directAttributes = {
      precio: { type: 'literal', value: '125000' },
      priceTime: { type: 'bnode', value: 'node273935' },
      about: { type: 'uri', value: 'https://example.test/estate' },
    };

    const graph = buildEntityModeElements(subgraph);
    const element = graph.elements.find((candidate) => candidate.data['id'] === specification.uri);

    expect(element?.data['attributeLabel']).toBe('precio: 125000');
  });
});

describe('ramas', () => {
  it('lists active-node branches with their counts', () => {
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

  it('marks branches that reach a shared resource', () => {
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

  it('bounds other branches and excludes the active node from them', () => {
    const subgraph = subgraphOf();
    const items = otherBranchItems(subgraph, 2);

    expect(items.length).toBeLessThanOrEqual(2);
    expect(items.every((item) => item.nodeUri !== subgraph.activeUri)).toBe(true);
    expect(items.every((item) => item.pendingCount > 0)).toBe(true);
    expect(items.every((item) => item.revealedUri !== null)).toBe(true);
    // Include the node in text to identify where the branch originates.
    for (const item of items) expect(item.label).toContain(item.nodeLabel);
  });

  it('does not offer a branch without pending nodes for expansion', () => {
    const subgraph = subgraphOf();
    const items = activeBranchItems(subgraph);
    for (const item of items) {
      if (item.pendingCount === 0) expect(item.canExpand).toBe(false);
    }
  });

  it('always produces the same order for the same subgraph', () => {
    expect(otherBranchItems(subgraphOf()).map((item) => item.id)).toEqual(
      otherBranchItems(subgraphOf()).map((item) => item.id),
    );
  });
});

describe('breadcrumb and metrics', () => {
  it('marks only the latest root as current', () => {
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

  it('does not invent text without a subgraph', () => {
    expect(entityMetricsLabel(null)).toBe('');
    expect(entityWarningsLabel(null)).toBe('');
  });

  it('exposes subgraph warnings in a single text', () => {
    const fixture = realEstateFixture();
    const subgraph = buildEntitySubgraph({
      visibleResult: { ...fixture.result, nodes: [], edges: [], bindings: [] },
      fullResult: fixture.result,
      rootUri: fixture.root,
    });

    expect(entityWarningsLabel(subgraph)).toContain('resultado completo');
  });

  it('falls back to the URI when resolving labels', () => {
    const labelOf = entityLabelResolver(subgraphOf());
    expect(labelOf('http://example.org/listing/0')).toBe('Aviso 0');
    expect(labelOf('http://example.org/desconocido')).toBe('http://example.org/desconocido');
  });
});
