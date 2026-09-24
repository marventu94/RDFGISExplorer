import { describe, it, expect } from 'vitest';
import type cytoscape from 'cytoscape';

import {
  buildCanvasElements,
  canvasGraphInstanceChanged,
  filterLabel,
} from './canvas-graph.elements';
import { CHILD_HEIGHT, CHILD_PADDING, FILTER_HEIGHT, NODE_TITLE_HEIGHT } from './canvas-graph.styles';
import { PropertyGraph } from '../domain/graph';
import { GenericAdapter } from '../domain/endpoint/generic-adapter';

function createGraph(): PropertyGraph {
  return new PropertyGraph({
    labelUri: 'http://www.w3.org/2000/01/rdf-schema#label',
    lang: 'en',
    prefixes: [{ prefix: 'rdfs', uri: 'http://www.w3.org/2000/01/rdf-schema#' }],
    endpointAdapter: new GenericAdapter(),
  });
}

function positionOf(
  elements: cytoscape.ElementDefinition[],
  id: string,
): cytoscape.Position {
  const el = elements.find(e => e.data.id === id);
  expect(el, `element ${id} was not found`).toBeDefined();
  const position = (el as cytoscape.NodeDefinition).position;
  expect(position, `element ${id} has no position`).toBeDefined();
  return position!;
}

describe('buildCanvasElements', () => {
  it('detects reused Cytoscape IDs that belong to another restored panel', () => {
    const firstGraph = createGraph();
    const secondGraph = createGraph();
    const firstElements = buildCanvasElements(firstGraph.nodes, firstGraph.edges);
    const firstDomains = new Map<string, unknown>();

    for (const element of firstElements) {
      const domain = (element.data as { domain?: unknown }).domain;
      if (domain !== undefined) firstDomains.set(element.data.id as string, domain);
    }

    expect(canvasGraphInstanceChanged(firstDomains, firstElements)).toBe(false);

    firstGraph.addNode();
    secondGraph.addNode();
    const restoredFirst = buildCanvasElements(firstGraph.nodes, firstGraph.edges);
    const restoredSecond = buildCanvasElements(secondGraph.nodes, secondGraph.edges);
    const restoredDomains = new Map<string, unknown>();
    for (const element of restoredFirst) {
      const domain = (element.data as { domain?: unknown }).domain;
      if (domain !== undefined) restoredDomains.set(element.data.id as string, domain);
    }

    expect(canvasGraphInstanceChanged(restoredDomains, restoredFirst)).toBe(false);
    expect(canvasGraphInstanceChanged(restoredDomains, restoredSecond)).toBe(true);
  });

  it('positions children at ABSOLUTE coordinates rather than parent-relative coordinates', () => {
    // This failed when returning from GIS without reloading: children arrived
    // with relative x=0 but Cytoscape treated it as absolute. Because compound
    // position derives from child bounds, every node stacked in one column.
    const graph = createGraph();
    const a = graph.addNode().setPosition(100, 50);
    const b = graph.addNode().setPosition(900, 400);
    a.newProp();
    b.newProp();

    const elements = buildCanvasElements(graph.nodes, graph.edges);

    expect(positionOf(elements, `p${a.properties[0].id}`).x).toBe(100);
    expect(positionOf(elements, `p${b.properties[0].id}`).x).toBe(900);
    // Crucially, children of different nodes do NOT share an x coordinate.
    expect(positionOf(elements, `p${a.properties[0].id}`).x).not.toBe(
      positionOf(elements, `p${b.properties[0].id}`).x,
    );
  });

  it('centers the child block on (node.x, node.y)', () => {
    const graph = createGraph();
    const node = graph.addNode().setPosition(0, 0);
    const prop = node.newProp();

    const elements = buildCanvasElements(graph.nodes, graph.edges);

    const compoundHeight = NODE_TITLE_HEIGHT + CHILD_HEIGHT + CHILD_PADDING;
    expect(positionOf(elements, `t${node.id}`).y).toBe(
      -compoundHeight / 2 + NODE_TITLE_HEIGHT / 2,
    );
    expect(positionOf(elements, `p${prop.id}`).y).toBe(
      -compoundHeight / 2 + NODE_TITLE_HEIGHT + CHILD_HEIGHT / 2,
    );
  });

  it('retains the parent offset when stacking multiple children', () => {
    const graph = createGraph();
    const node = graph.addNode().setPosition(500, 250);
    const first = node.newProp();
    const second = node.newProp();

    const elements = buildCanvasElements(graph.nodes, graph.edges);

    const firstY = positionOf(elements, `p${first.id}`).y;
    const secondY = positionOf(elements, `p${second.id}`).y;

    expect(positionOf(elements, `p${first.id}`).x).toBe(500);
    expect(positionOf(elements, `p${second.id}`).x).toBe(500);
    expect(secondY - firstY).toBe(CHILD_HEIGHT + CHILD_PADDING);
    // Centered on the parent, the block is distributed around node.y.
    expect(firstY).toBeLessThan(250);
    expect(secondY).toBeGreaterThan(250);
  });

  it('keeps a childless node at its own position without a spacer', () => {
    const graph = createGraph();
    const node = graph.addNode().setPosition(42, 84);

    const elements = buildCanvasElements(graph.nodes, graph.edges);

    expect(positionOf(elements, `n${node.id}`)).toEqual({ x: 42, y: 84 });
    expect(elements.find(e => e.data.id === `t${node.id}`)).toBeUndefined();
  });

  it('renders filters inside the compound immediately after their resource', () => {
    const graph = createGraph();
    const node = graph.addNode().setPosition(100, 200);
    node.mkVariable();
    node.variable.addFilter('regex', { regex: 'Berisso' }, graph);
    const prop = node.newProp();
    prop.mkVariable();
    prop.variable.addFilter('lang', { language: 'es' }, graph);

    const elements = buildCanvasElements(graph.nodes, graph.edges);
    const nodeFilter = elements.find(e => e.data.id === `f-${node.variable.id}-0`);
    const propFilter = elements.find(e => e.data.id === `f-${prop.variable.id}-0`);

    expect(nodeFilter?.data).toMatchObject({
      parent: `n${node.id}`,
      kind: 'filter',
      label: '⌕ regex · /Berisso/i',
      domain: node,
    });
    expect(propFilter?.data).toMatchObject({
      parent: `n${node.id}`,
      kind: 'filter',
      label: '⌕ lang · es',
      domain: prop,
    });
    expect(positionOf(elements, `f-${node.variable.id}-0`).y).toBeLessThan(
      positionOf(elements, `p${prop.id}`).y,
    );
    expect(positionOf(elements, `f-${prop.variable.id}-0`).y).toBeGreaterThan(
      positionOf(elements, `p${prop.id}`).y,
    );
  });

  it('uses filter height in the compound geometry', () => {
    const graph = createGraph();
    const node = graph.addNode().setPosition(0, 0);
    node.mkVariable();
    node.variable.addFilter('isuri', {}, graph);

    const elements = buildCanvasElements(graph.nodes, graph.edges);
    const compoundHeight = NODE_TITLE_HEIGHT + FILTER_HEIGHT + CHILD_PADDING;

    expect(positionOf(elements, `t${node.id}`).y).toBe(
      -compoundHeight / 2 + NODE_TITLE_HEIGHT / 2,
    );
    expect(positionOf(elements, `f-${node.variable.id}-0`).y).toBe(
      -compoundHeight / 2 + NODE_TITLE_HEIGHT + FILTER_HEIGHT / 2,
    );
  });

  it('formats every supported filter as a compact query constraint', () => {
    const graph = createGraph();
    const variable = graph.addNode().variable;
    const make = (type: Parameters<typeof variable.addFilter>[0], data: Parameters<typeof variable.addFilter>[1]) =>
      variable.addFilter(type, data, graph);

    expect(filterLabel(make('text', { keyword: 'casa' }))).toBe('⌕ text · “casa”');
    expect(filterLabel(make('leq', { number: 10 }))).toBe('⌕ < 10');
    expect(filterLabel(make('geq', { number: 5 }))).toBe('⌕ > 5');
    expect(filterLabel(make('isuri', {}))).toBe('⌕ isIRI');
    expect(filterLabel(make('isliteral', {}))).toBe('⌕ isLiteral');
    expect(filterLabel(make('datefrom', { date: '2020', granularity: 'year' }))).toBe('⌕ ≥ 2020');
    expect(filterLabel(make('dateto', { date: '2024-06', granularity: 'month' }))).toBe('⌕ ≤ 2024-06');
  });

  it('keeps multiple filters in distinct rows without colliding with later resources', () => {
    const graph = createGraph();
    const node = graph.addNode().setPosition(0, 0);
    const prop = node.newProp();
    prop.mkVariable();
    prop.variable.addFilter('regex', { regex: 'first' }, graph);
    prop.variable.addFilter('text', { keyword: 'second' }, graph);
    const literal = prop.mkLiteral()!;
    literal.variable.addFilter('isuri', {}, graph);

    const elements = buildCanvasElements(graph.nodes, graph.edges);
    const propY = positionOf(elements, `p${prop.id}`).y;
    const firstY = positionOf(elements, `f-${prop.variable.id}-0`).y;
    const secondY = positionOf(elements, `f-${prop.variable.id}-1`).y;
    const literalY = positionOf(elements, `l${prop.id}`).y;
    const literalFilterY = positionOf(elements, `f-${literal.variable.id}-0`).y;

    expect(firstY - propY).toBe(CHILD_HEIGHT / 2 + CHILD_PADDING + FILTER_HEIGHT / 2);
    expect(secondY - firstY).toBe(FILTER_HEIGHT + CHILD_PADDING);
    expect(literalY - secondY).toBe(FILTER_HEIGHT / 2 + CHILD_PADDING + CHILD_HEIGHT / 2);
    expect(literalFilterY - literalY).toBe(CHILD_HEIGHT / 2 + CHILD_PADDING + FILTER_HEIGHT / 2);
  });

  it('uses the compound centre x for resources and every filter capsule', () => {
    const graph = createGraph();
    const node = graph.addNode().setPosition(375, 140);
    node.variable.addFilter('regex', { regex: 'node filter' }, graph);
    const prop = node.newProp();
    prop.variable.addFilter('text', { keyword: 'property filter' }, graph);
    prop.variable.addFilter('lang', { language: 'es' }, graph);
    const literal = prop.mkLiteral()!;
    literal.variable.addFilter('datefrom', { date: '2020', granularity: 'year' }, graph);

    const elements = buildCanvasElements(graph.nodes, graph.edges);
    const rowIds = [
      `t${node.id}`,
      `f-${node.variable.id}-0`,
      `p${prop.id}`,
      `f-${prop.variable.id}-0`,
      `f-${prop.variable.id}-1`,
      `l${prop.id}`,
      `f-${literal.variable.id}-0`,
    ];

    expect(rowIds.map((id) => positionOf(elements, id).x)).toEqual(
      rowIds.map(() => node.x),
    );
  });

  it('normalizes and truncates long filter values inside the compact capsule', () => {
    const graph = createGraph();
    const filter = graph.addNode().variable.addFilter(
      'regex',
      { regex: `a   value\nwith spaces ${'x'.repeat(60)}` },
      graph,
    );

    const label = filterLabel(filter);
    expect(label).not.toContain('\n');
    expect(label).not.toContain('   ');
    expect(label).toContain('…/i');
    expect(label.length).toBeLessThan(50);
  });
});
