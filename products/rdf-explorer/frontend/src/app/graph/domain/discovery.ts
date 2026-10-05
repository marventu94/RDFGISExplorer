import type { DiscoveryExample, DiscoveryFocus, DiscoveryStep } from '@rdfgis/contracts';
import type { PropertyGraph } from './graph';
import { Node } from './node';
import type { RDFResource } from './rdf-resource';
import { Filter } from './filter';

export const TYPE_URI = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const validIri = (uri: string) => /^[a-z][a-z0-9+.-]*:[^\s<>"\\{}|^`]*$/i.test(uri);

export function nodeClasses(graph: PropertyGraph, node: Node): string[] {
  return graph.edges.filter(e => e.source.parentNode === node && !e.source.isVariable()
    && e.source.getUri() === (graph.endpointAdapter.classPredicate ?? TYPE_URI) && !e.target.isVariable()).flatMap(e => e.target.uris);
}
export function discoveryFocus(node: Node): DiscoveryFocus | null {
  if (!node.isVariable()) return node.getUri() ? { uri: node.getUri()! } : null;
  const query = node.createQuery()?.toSparql({ structural: true });
  return query ? { query, variable: node.variable.getName() } : null;
}
/** Give new discovery variables stable, readable names without changing existing branches. */
function nameVariable(graph: PropertyGraph, resource: RDFResource, uri: string, suffix = '', owner = ''): void {
  let local = uri.split(/[#/:]/).filter(Boolean).pop() ?? '';
  try { local = decodeURIComponent(local); } catch { /* Keep malformed percent escapes as text. */ }
  const text = graph.labelProvider.getLabel(uri) || local;
  const words = text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').split(/[^a-zA-Z0-9_]+/).filter(Boolean);
  let base = words.map((word, index) => index ? word[0].toUpperCase() + word.slice(1) : word[0].toLowerCase() + word.slice(1)).join('');
  if (!base) base = 'value';
  if (/^[0-9]/.test(base)) base = 'value' + base;
  if (owner) base = owner + base[0].toUpperCase() + base.slice(1);
  if (suffix && !base.toLowerCase().endsWith(suffix.toLowerCase())) base += suffix;
  // Generated IDs are query names too, even though they are absent from usedAliases.
  const names = new Set(graph.usedAliases);
  for (const node of graph.nodes) {
    names.add(node.variable.getName());
    for (const property of node.properties) {
      names.add(property.variable.getName());
      if (property.literal) names.add(property.literal.variable.getName());
    }
  }
  let alias = base;
  for (let suffix = 2; names.has(alias); suffix++) alias = base + suffix;
  resource.variable.setAlias(alias, graph);
}
function connect(graph: PropertyGraph, from: Node, predicate: string, to: Node, optional: boolean): void {
  const p = from.newProp();
  p.addUri(predicate); p.mkConst(); p.optional = optional;
  graph.addEdge(p, to);
}
export function addClassNode(graph: PropertyGraph, uri: string, x = 0, y = 0): Node {
  if (!validIri(uri)) throw new Error('Invalid class IRI');
  const node = graph.addNode().setPosition(x, y);
  nameVariable(graph, node, uri);
  const type = graph.addNode().setPosition(x + 240, y - 120);
  type.addUri(uri); type.mkConst();
  connect(graph, node, graph.endpointAdapter.classPredicate ?? TYPE_URI, type, false);
  return node;
}
/** Atomic caller snapshots this mutation. Literal values remain typed filters, not interpolated constants. */
export function addDiscoveryPath(
  graph: PropertyGraph, source: Node, steps: DiscoveryStep[], optional = false, example?: DiscoveryExample, constrainObserved = false,
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
        && (!constrainObserved || !p.literal.variable.filters.some(f => f.type === 'datatype')
          || p.literal.variable.filters.some(f => f.type === 'datatype' && f.data.datatype === step.datatype)));
      const prop = existing ?? current.newProp();
      prop.addUri(step.predicate); prop.mkConst(); prop.optional = optional;
      const lit = prop.literal ?? prop.mkLiteral()!;
      if (!existing) {
        nameVariable(graph, lit, step.predicate, '', current.variable.getName());
      }
      if (constrainObserved) {
        if (!lit.variable.filters.some(f => f.type === 'isliteral')) lit.variable.filters.push(new Filter(lit.variable, 'isliteral', {}));
        if (step.datatype && !lit.variable.filters.some(f => f.type === 'datatype' && f.data.datatype === step.datatype))
          lit.variable.filters.push(new Filter(lit.variable, 'datatype', { datatype: step.datatype }));
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
        && (!constrainObserved || !step.targetClass || nodeClasses(graph, neighbor).length === 0 || nodeClasses(graph, neighbor).includes(step.targetClass));
    });
    let next: Node;
    if (existing) {
      next = step.direction === 'out' ? existing.target : existing.source.parentNode;
    } else {
      next = graph.addNode().setPosition(current.x + 320, current.y + i * 100);
      const predicateName = step.predicate.split(/[#/:]/).pop();
      const suffix = step.targetClass && predicateName === 'hasFeature' ? 'Feature' : '';
      nameVariable(graph, next, step.targetClass ?? step.predicate, suffix);
      if (step.direction === 'out') connect(graph, current, step.predicate, next, optional);
      else connect(graph, next, step.predicate, current, optional);
    }
    if (example?.kind === 'uri' && last) { next.addUri(example.value); next.mkConst(); }
    if (constrainObserved && step.targetClass && !nodeClasses(graph, next).includes(step.targetClass)) {
      const type = graph.addNode().setPosition(next.x + 160, next.y - 140);
      type.addUri(step.targetClass); type.mkConst();
      connect(graph, next, graph.endpointAdapter.classPredicate ?? TYPE_URI, type, optional);
    }
    current = next;
  }
  return current;
}
