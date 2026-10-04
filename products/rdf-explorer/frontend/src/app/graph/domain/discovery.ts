import type { DiscoveryExample, DiscoveryFocus, DiscoveryStep } from '@rdfgis/contracts';
import { PropertyGraph } from './graph';
import { Node } from './node';
import type { RDFResource } from './rdf-resource';
import { Filter } from './filter';

export const TYPE_URI = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const validIri = (uri: string) => /^[a-z][a-z0-9+.-]*:[^\s<>"\\{}|^`]*$/i.test(uri);

export function nodeClasses(graph: PropertyGraph, node: Node): string[] {
  return graph.edges.filter(e => e.source.parentNode === node && !e.source.isVariable()
    && e.source.getUri() === TYPE_URI && !e.target.isVariable()).flatMap(e => e.target.uris);
}
export function discoveryFocus(node: Node): DiscoveryFocus | null {
  if (!node.isVariable()) return node.getUri() ? { uri: node.getUri()! } : null;
  const query = node.createQuery()?.toSparqlFullProjection();
  return query ? { query, variable: node.variable.getName() } : null;
}
function connect(graph: PropertyGraph, from: Node, predicate: string, to: Node, optional: boolean): void {
  const p = from.newProp();
  p.addUri(predicate); p.mkConst(); p.optional = optional;
  graph.addEdge(p, to);
}
export function addClassNode(graph: PropertyGraph, uri: string, x = 0, y = 0): Node {
  if (!validIri(uri)) throw new Error('Invalid class IRI');
  const node = graph.addNode().setPosition(x, y);
  const type = graph.addNode().setPosition(x + 240, y - 120);
  type.addUri(uri); type.mkConst();
  connect(graph, node, TYPE_URI, type, false);
  return node;
}
/** Atomic caller snapshots this mutation. Literal values remain typed filters, not interpolated constants. */
export function addDiscoveryPath(
  graph: PropertyGraph, source: Node, steps: DiscoveryStep[], optional = false, example?: DiscoveryExample,
): RDFResource {
  for (const [i, step] of steps.entries()) {
    if (!validIri(step.predicate) || (step.targetClass && !validIri(step.targetClass))
      || (step.datatype && !validIri(step.datatype)) || (step.kind === 'literal' && (step.direction === 'in' || i < steps.length - 1))) {
      throw new Error('Invalid discovery path');
    }
  }
  if (example?.kind === 'bnode') throw new Error('Blank nodes cannot be reused outside their result');
  if (example?.kind === 'uri' && !validIri(example.value)) throw new Error('Invalid example IRI');
  let current = source;
  for (const [i, step] of steps.entries()) {
    const last = i === steps.length - 1;
    if (step.kind === 'literal') {
      const existing = current.properties.find(p => !p.isVariable() && p.getUri() === step.predicate && p.optional === optional && p.literal
        && p.literal.variable.filters.find(f => f.type === 'datatype')?.data.datatype === step.datatype);
      const prop = existing ?? current.newProp();
      prop.addUri(step.predicate); prop.mkConst(); prop.optional = optional;
      const lit = prop.literal ?? prop.mkLiteral()!;
      if (!existing) {
        lit.variable.filters.push(new Filter(lit.variable, 'isliteral', {}));
        if (step.datatype) lit.variable.filters.push(new Filter(lit.variable, 'datatype', { datatype: step.datatype }));
      }
      if (example && last) lit.variable.filters.push(new Filter(lit.variable, 'equals', {
        value: example.value, datatype: example.datatype, language: example.lang,
      }));
      return lit;
    }
    // Reuse an already-added branch only when its direction, class and optionality agree.
    // This keeps adding columns to the same address instead of multiplying address rows.
    const existing = graph.edges.find(edge => {
      const neighbor = step.direction === 'out' ? edge.target : edge.source.parentNode;
      const anchor = step.direction === 'out' ? edge.source.parentNode : edge.target;
      return anchor === current && !edge.source.isVariable() && edge.source.getUri() === step.predicate
        && edge.source.optional === optional && neighbor.isVariable()
        && (step.targetClass ? nodeClasses(graph, neighbor).includes(step.targetClass) : nodeClasses(graph, neighbor).length === 0);
    });
    if (existing) {
      current = step.direction === 'out' ? existing.target : existing.source.parentNode;
      if (last && example?.kind === 'uri') { current.addUri(example.value); current.mkConst(); }
      continue;
    }
    const next = graph.addNode().setPosition(current.x + 320, current.y + i * 100);
    if (example?.kind === 'uri' && last) { next.addUri(example.value); next.mkConst(); }
    else next.variable.filters.push(new Filter(next.variable, 'isresource', {}));
    if (step.direction === 'out') connect(graph, current, step.predicate, next, optional);
    else connect(graph, next, step.predicate, current, optional);
    if (step.targetClass) {
      const type = graph.addNode().setPosition(next.x + 160, next.y - 140);
      type.addUri(step.targetClass); type.mkConst();
      connect(graph, next, TYPE_URI, type, optional);
    }
    current = next;
  }
  return current;
}
