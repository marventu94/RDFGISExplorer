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
  expect(el, `no se encontro el elemento ${id}`).toBeDefined();
  const position = (el as cytoscape.NodeDefinition).position;
  expect(position, `el elemento ${id} no trae posicion`).toBeDefined();
  return position!;
}

describe('buildCanvasElements', () => {
  it('posiciona a los hijos en coordenadas ABSOLUTAS, no relativas al padre', () => {
    // Es el caso que rompia al volver al Explorer desde el GIS sin recargar:
    // el canvas se creaba con `cytoscape({ elements })` y los hijos venian con
    // x=0 (relativo). Cytoscape los tomaba como absolutos, y como la posicion de
    // un compound se deriva del bounding box de sus hijos, TODOS los nodos
    // terminaban apilados en la misma columna.
    const graph = createGraph();
    const a = graph.addNode().setPosition(100, 50);
    const b = graph.addNode().setPosition(900, 400);
    a.newProp();
    b.newProp();

    const elements = buildCanvasElements(graph.nodes, graph.edges);

    expect(positionOf(elements, `p${a.properties[0].id}`).x).toBe(100);
    expect(positionOf(elements, `p${b.properties[0].id}`).x).toBe(900);
    // Lo esencial: los hijos de nodos distintos NO comparten abscisa.
    expect(positionOf(elements, `p${a.properties[0].id}`).x).not.toBe(
      positionOf(elements, `p${b.properties[0].id}`).x,
    );
  });

  it('centra el bloque de hijos sobre (node.x, node.y)', () => {
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

  it('mantiene el desplazamiento del padre al apilar varios hijos', () => {
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
    // Centrado sobre el padre: el bloque queda repartido alrededor de node.y.
    expect(firstY).toBeLessThan(250);
    expect(secondY).toBeGreaterThan(250);
  });

  it('deja al nodo sin hijos en su propia posicion y sin spacer', () => {
    const graph = createGraph();
    const node = graph.addNode().setPosition(42, 84);

    const elements = buildCanvasElements(graph.nodes, graph.edges);

    expect(positionOf(elements, `n${node.id}`)).toEqual({ x: 42, y: 84 });
    expect(elements.find(e => e.data.id === `t${node.id}`)).toBeUndefined();
  });
});
