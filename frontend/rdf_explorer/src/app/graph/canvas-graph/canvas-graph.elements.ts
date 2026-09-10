import type cytoscape from 'cytoscape';

import { CHILD_HEIGHT, CHILD_PADDING, NODE_TITLE_HEIGHT } from './canvas-graph.styles';
import type { Node, Edge, RDFResource } from '../domain';

/**
 * Traduccion dominio -> elementos de cytoscape.
 *
 * Las posiciones que se devuelven son ABSOLUTAS (coordenadas del grafo), tambien
 * las de los hijos de un compound. Cytoscape interpreta como absoluto todo lo que
 * recibe, tanto en `cytoscape({ elements })` como en `cy.add()` y `el.position()`,
 * asi que no puede haber dos convenciones dando vueltas: emitir relativas hacia
 * `cytoscape({ elements })` apilaba todos los nodos en la misma columna, porque
 * cada hijo caia en x=0 y la posicion de un compound se deriva del bounding box
 * de sus hijos.
 *
 * Esta en un modulo aparte y sin dependencias de Angular ni de cytoscape en
 * runtime para poder testear la geometria sola.
 */
export function buildCanvasElements(
  nodes: readonly Node[],
  edges: readonly Edge[],
): cytoscape.ElementDefinition[] {
  const elements: cytoscape.ElementDefinition[] = [];

  for (const node of nodes) {
    const block = CHILD_HEIGHT + CHILD_PADDING;
    const totalChildren = node.properties.reduce(
      (n, p) => n + 1 + (p.literal ? 1 : 0),
      0,
    );
    // El bloque de hijos se acomoda para que el compound (titulo + hijos +
    // padding) quede centrado en (node.x, node.y). Sin hijos, childY no se usa:
    // de ese caso se encarga el estilo :childless.
    const childrenBlockHeight =
      totalChildren > 0
        ? totalChildren * CHILD_HEIGHT + (totalChildren - 1) * CHILD_PADDING
        : 0;
    const compoundHeight = NODE_TITLE_HEIGHT + childrenBlockHeight + CHILD_PADDING;
    let childY = node.y - compoundHeight / 2 + NODE_TITLE_HEIGHT + CHILD_HEIGHT / 2;

    elements.push({
      group: 'nodes',
      data: {
        id: `n${node.id}`,
        kind: 'node',
        color: node.isVariable() ? '#2ca02c' : '#1f77b4',
        label: nodeLabel(node),
        domain: node,
      },
      position: { x: node.x, y: node.y },
      classes: 'cy-node',
    });

    if (totalChildren > 0) {
      elements.push({
        group: 'nodes',
        data: { id: `t${node.id}`, parent: `n${node.id}`, kind: 'title-spacer' },
        position: {
          x: node.x,
          y: node.y - compoundHeight / 2 + NODE_TITLE_HEIGHT / 2,
        },
        classes: 'cy-spacer',
      });
    }

    for (const prop of node.properties) {
      const propColor = prop.isLiteral()
        ? '#9467bd'
        : prop.isVariable()
          ? '#d62728'
          : '#ff7f0e';

      elements.push({
        group: 'nodes',
        data: {
          id: `p${prop.id}`,
          parent: `n${node.id}`,
          kind: 'property',
          color: propColor,
          label: resourceLabel(prop),
          domain: prop,
        },
        position: { x: node.x, y: childY },
        classes: 'cy-prop',
      });
      childY += block;

      if (prop.literal) {
        elements.push({
          group: 'nodes',
          data: {
            id: `l${prop.id}`,
            parent: `n${node.id}`,
            kind: 'literal',
            color: '#9467bd',
            label: resourceLabel(prop.literal),
            domain: prop.literal,
          },
          position: { x: node.x, y: childY },
          classes: 'cy-lit',
        });
        childY += block;
      }
    }
  }

  for (const edge of edges) {
    elements.push({
      group: 'edges',
      data: {
        id: `e${edge.source.id}-${edge.target.id}`,
        source: `p${edge.source.id}`,
        target: `n${edge.target.id}`,
        kind: 'edge',
        domain: edge,
      },
      classes: 'cy-edge',
    });
  }

  return elements;
}

export function nodeLabel(node: Node): string {
  return node.getRepr() ?? 'No values set!';
}

export function resourceLabel(r: RDFResource): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (r as any).getRepr?.() ?? 'No values set!';
}
