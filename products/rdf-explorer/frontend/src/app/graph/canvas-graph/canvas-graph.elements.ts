import type cytoscape from 'cytoscape';

import {
  CHILD_HEIGHT,
  CHILD_PADDING,
  FILTER_HEIGHT,
  NODE_TITLE_HEIGHT,
} from './canvas-graph.styles';
import type { Node, Edge, RDFResource } from '../domain';
import type { Filter } from '../domain/filter';

const FILTER_VALUE_MAX_LENGTH = 34;

function compactFilterValue(value: unknown): string {
  const normalized = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= FILTER_VALUE_MAX_LENGTH) return normalized;
  return `${normalized.slice(0, FILTER_VALUE_MAX_LENGTH - 1)}…`;
}

/** Human-readable, compact representation of the actual SPARQL constraint. */
export function filterLabel(filter: Filter): string {
  switch (filter.type) {
    case 'text':
      return `⌕ text · “${compactFilterValue(filter.data.keyword)}”`;
    case 'lang':
      return `⌕ lang · ${compactFilterValue(filter.data.language)}`;
    case 'regex':
      return `⌕ regex · /${compactFilterValue(filter.data.regex)}/i`;
    case 'leq':
      return `⌕ < ${compactFilterValue(filter.data.number)}`;
    case 'geq':
      return `⌕ > ${compactFilterValue(filter.data.number)}`;
    case 'isuri':
      return '⌕ isIRI';
    case 'isliteral':
      return '⌕ isLiteral';
    case 'datefrom':
      return `⌕ ≥ ${compactFilterValue(filter.data.date)}`;
    case 'dateto':
      return `⌕ ≤ ${compactFilterValue(filter.data.date)}`;
  }
}

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
    const rowHeights: number[] = [
      ...node.variable.filters.map(() => FILTER_HEIGHT),
      ...node.properties.flatMap((prop) => [
        CHILD_HEIGHT,
        ...prop.variable.filters.map(() => FILTER_HEIGHT),
        ...(prop.literal
          ? [CHILD_HEIGHT, ...prop.literal.variable.filters.map(() => FILTER_HEIGHT)]
          : []),
      ]),
    ];
    const totalChildren = rowHeights.length;
    // El bloque de hijos se acomoda para que el compound (titulo + hijos +
    // padding) quede centrado en (node.x, node.y). Sin hijos, rowTop no se usa:
    // de ese caso se encarga el estilo :childless.
    const childrenBlockHeight =
      totalChildren > 0
        ? rowHeights.reduce((sum, height) => sum + height, 0) +
          (totalChildren - 1) * CHILD_PADDING
        : 0;
    const compoundHeight = NODE_TITLE_HEIGHT + childrenBlockHeight + CHILD_PADDING;
    let rowTop = node.y - compoundHeight / 2 + NODE_TITLE_HEIGHT;

    const addFilterRows = (resource: RDFResource, ownerId: string): void => {
      resource.variable.filters.forEach((filter, index) => {
        elements.push({
          group: 'nodes',
          data: {
            id: `f-${resource.variable.id}-${index}`,
            parent: `n${node.id}`,
            kind: 'filter',
            label: filterLabel(filter),
            domain: resource,
            ownerId,
          },
          position: { x: node.x, y: rowTop + FILTER_HEIGHT / 2 },
          classes: 'cy-filter',
        });
        rowTop += FILTER_HEIGHT + CHILD_PADDING;
      });
    };

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

    addFilterRows(node, `n${node.id}`);

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
        position: { x: node.x, y: rowTop + CHILD_HEIGHT / 2 },
        classes: 'cy-prop',
      });
      rowTop += CHILD_HEIGHT + CHILD_PADDING;
      addFilterRows(prop, `p${prop.id}`);

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
          position: { x: node.x, y: rowTop + CHILD_HEIGHT / 2 },
          classes: 'cy-lit',
        });
        rowTop += CHILD_HEIGHT + CHILD_PADDING;
        addFilterRows(prop.literal, `l${prop.id}`);
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

/**
 * Detecta cuando IDs visuales iguales pertenecen a otra instancia del grafo.
 *
 * Los IDs del dominio se vuelven a numerar al deserializar cada panel, por lo
 * que C1 y C2 pueden contener ambos `n0`, `p1`, etc. En ese caso Cytoscape no
 * debe reutilizar los compounds existentes: actualizar `data.parent` no mueve
 * de forma fiable un hijo a su nuevo padre y deja mezclada la geometría de los
 * dos paneles.
 */
export function canvasGraphInstanceChanged(
  existingDomains: ReadonlyMap<string, unknown>,
  desired: readonly cytoscape.ElementDefinition[],
): boolean {
  return desired.some((definition) => {
    const id = definition.data.id as string | undefined;
    const domain = (definition.data as { domain?: unknown }).domain;
    return id !== undefined
      && domain !== undefined
      && existingDomains.has(id)
      && existingDomains.get(id) !== domain;
  });
}

export function nodeLabel(node: Node): string {
  return node.getRepr() ?? 'No values set!';
}

export function resourceLabel(r: RDFResource): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (r as any).getRepr?.() ?? 'No values set!';
}
