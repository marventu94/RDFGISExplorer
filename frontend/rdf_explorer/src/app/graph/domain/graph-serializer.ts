import type { PropertyGraph } from './graph';
import type { Node } from './node';
import type { Property } from './property';
import type { Literal } from './literal';
import type { FilterType, FilterData } from './filter';
import type { Variable } from './variable';

export interface SerializedGraphNode {
  id: string;
  type: string;
  data: Record<string, unknown>;
}

export interface SerializedGraphEdge {
  id: string;
  source: string;
  target: string;
  data: Record<string, unknown>;
}

export interface ExplorerSerializedGraph {
  nodes: SerializedGraphNode[];
  edges: SerializedGraphEdge[];
}

interface SerializedVariable {
  alias: string;
  filters: Array<{ type: FilterType; data: FilterData }>;
  options: { show: boolean; count: boolean };
}

function serializeVariable(v: Variable): SerializedVariable {
  return {
    alias: v.alias,
    filters: v.filters.map(f => ({ type: f.type, data: { ...f.data } })),
    options: { ...v.options },
  };
}

function restoreVariable(v: Variable, snap: SerializedVariable, usedAliases: Set<string>): void {
  if (snap.alias) {
    v.alias = snap.alias;
    usedAliases.add(snap.alias);
  }
  v.options = { ...snap.options };
  for (const f of snap.filters) {
    v.addFilter(f.type, { ...f.data }, { usedAliases, log: () => {} });
  }
}

function nodeId(n: Node): string {
  return `node-${n.id}`;
}

function propId(p: Property): string {
  return `prop-${p.parentNode.id}-${p.id}`;
}

function litId(l: Literal): string {
  return `lit-${l.parent.parentNode.id}-${l.parent.id}`;
}

export function serializeGraph(graph: PropertyGraph): ExplorerSerializedGraph {
  const nodes: SerializedGraphNode[] = [];
  const edges: SerializedGraphEdge[] = [];

  for (const node of graph.nodes) {
    nodes.push({
      id: nodeId(node),
      type: 'node',
      data: {
        isVar: node.isVar,
        uris: [...node.uris],
        cur: node.cur,
        star: node.star,
        hide: node.hide,
        x: node.x,
        y: node.y,
        variable: serializeVariable(node.variable),
      },
    });

    for (const prop of node.properties) {
      nodes.push({
        id: propId(prop),
        type: 'property',
        data: {
          isVar: prop.isVar,
          uris: [...prop.uris],
          cur: prop.cur,
          star: prop.star,
          hide: prop.hide,
          variable: serializeVariable(prop.variable),
        },
      });

      if (prop.literal) {
        nodes.push({
          id: litId(prop.literal),
          type: 'literal',
          data: {
            isVar: prop.literal.isVar,
            uris: [...prop.literal.uris],
            cur: prop.literal.cur,
            star: prop.literal.star,
            hide: prop.literal.hide,
            variable: serializeVariable(prop.literal.variable),
          },
        });
      }
    }
  }

  for (const edge of graph.edges) {
    edges.push({
      id: `edge-${edge.source.parentNode.id}-${edge.source.id}-${edge.target.id}`,
      source: propId(edge.source),
      target: nodeId(edge.target),
      data: {},
    });
  }

  return { nodes, edges };
}

export function deserializeGraph(
  graph: PropertyGraph,
  snapshot: ExplorerSerializedGraph,
): void {
  graph.reset();

  const nodeMap = new Map<string, Node>();
  const propMap = new Map<string, Property>();
  const litMap = new Map<string, Literal>();

  // Pass 1: create nodes
  for (const el of snapshot.nodes) {
    if (el.type === 'node') {
      const node = graph.addNode();
      const data = el.data as {
        isVar: boolean;
        uris: string[];
        cur: number;
        star: boolean;
        hide: boolean;
        x: number;
        y: number;
        variable: SerializedVariable;
      };
      node.isVar = data.isVar;
      node.uris = [...data.uris];
      node.cur = data.cur;
      node.star = data.star;
      node.hide = data.hide;
      node.x = data.x;
      node.y = data.y;
      nodeMap.set(el.id, node);
    }
  }

  // Pass 2: create properties (need parent nodes)
  for (const el of snapshot.nodes) {
    if (el.type === 'property') {
      const parts = el.id.split('-');
      const parentId = `node-${parts[1]}`;
      const parentNode = nodeMap.get(parentId);
      if (!parentNode) continue;
      const prop = parentNode.newProp();
      const data = el.data as {
        isVar: boolean;
        uris: string[];
        cur: number;
        star: boolean;
        hide: boolean;
        variable: SerializedVariable;
      };
      prop.isVar = data.isVar;
      prop.uris = [...data.uris];
      prop.cur = data.cur;
      prop.star = data.star;
      prop.hide = data.hide;
      propMap.set(el.id, prop);
    }
  }

  // Pass 3: create literals (need parent properties)
  for (const el of snapshot.nodes) {
    if (el.type === 'literal') {
      const parts = el.id.split('-');
      const propKey = `prop-${parts[1]}-${parts[2]}`;
      const parentProp = propMap.get(propKey);
      if (!parentProp) continue;
      const lit = parentProp.mkLiteral();
      if (!lit) continue;
      const data = el.data as {
        isVar: boolean;
        uris: string[];
        cur: number;
        star: boolean;
        hide: boolean;
        variable: SerializedVariable;
      };
      lit.isVar = data.isVar;
      lit.uris = [...data.uris];
      lit.cur = data.cur;
      lit.star = data.star;
      lit.hide = data.hide;
      litMap.set(el.id, lit);
    }
  }

  // Pass 4: restore variables
  for (const el of snapshot.nodes) {
    const target =
      el.type === 'node'
        ? nodeMap.get(el.id)
        : el.type === 'property'
          ? propMap.get(el.id)
          : litMap.get(el.id);
    if (!target) continue;
    const data = el.data as { variable: SerializedVariable };
    restoreVariable(target.variable, data.variable, graph.usedAliases);
  }

  // Pass 5: create edges
  for (const el of snapshot.edges) {
    const sourceProp = propMap.get(el.source);
    const targetNode = nodeMap.get(el.target);
    if (sourceProp && targetNode) {
      graph.addEdge(sourceProp, targetNode);
    }
  }

  // Pass 6: register URIs in uriToNode
  for (const node of graph.nodes) {
    for (const uri of node.uris) {
      graph.registerUriNode(uri, node);
    }
  }
}
