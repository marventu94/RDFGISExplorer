import { describe, it, expect } from 'vitest';
import type cytoscape from 'cytoscape';

import { buildCanvasElements } from './canvas-graph.elements';
import { CHILD_HEIGHT, CHILD_PADDING, NODE_TITLE_HEIGHT } from './canvas-graph.styles';
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
});
