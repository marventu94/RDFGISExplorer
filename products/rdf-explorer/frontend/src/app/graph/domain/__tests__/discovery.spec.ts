import { describe, expect, it } from 'vitest';
import { addClassNode, addDiscoveryPath, discoveryFocus } from '../discovery';
import { PropertyGraph } from '../graph';
import { serializeGraph, deserializeGraph } from '../graph-serializer';

describe('structural discovery graph mutations', () => {
  it('starts with a typed variable instead of a constant instance', () => {
    const graph = new PropertyGraph();
    const house = addClassNode(graph, 'urn:House');
    expect(house.isVariable()).toBe(true);
    const focus = discoveryFocus(house);
    expect(focus?.query).toContain('<urn:House>');
    expect(focus?.query).toContain('rdf-syntax-ns#type');
    expect(focus?.variable).toBe(house.variable.getName());
  });
  it('constructs the C1 direction from house to listing and filters Sell', () => {
    const graph = new PropertyGraph();
    const house = addClassNode(graph, 'urn:House');
    addDiscoveryPath(graph, house, [
      { predicate: 'urn:about', direction: 'in', kind: 'resource', targetClass: 'urn:Listing' },
      { predicate: 'urn:function', direction: 'out', kind: 'resource' },
    ], false, { kind: 'uri', value: 'urn:Sell' });
    const query = discoveryFocus(house)!.query!;
    expect(query).toContain(`<urn:about> ${house.variable}`);
    expect(query).toContain('<urn:function> <urn:Sell>');
  });
  it('keeps an entire optional branch, including its type, inside OPTIONAL', () => {
    const graph = new PropertyGraph();
    const house = addClassNode(graph, 'urn:House');
    addDiscoveryPath(graph, house, [
      { predicate: 'urn:feature', direction: 'out', kind: 'resource', targetClass: 'urn:Address' },
      { predicate: 'urn:value', direction: 'out', kind: 'literal' },
    ], true);
    const query = discoveryFocus(house)!.query!;
    const optional = query.slice(query.indexOf('OPTIONAL'));
    expect(optional).toContain('<urn:Address>');
    expect(optional).toContain('<urn:feature>');
    expect(optional).toContain('<urn:value>');
  });
  it('escapes exact literals and preserves datatype and language through persistence', () => {
    const graph = new PropertyGraph();
    const house = addClassNode(graph, 'urn:House');
    addDiscoveryPath(graph, house, [{ predicate: 'urn:label', direction: 'out', kind: 'literal' }], false,
      { kind: 'literal', value: 'Berisso"\n\\$&', lang: 'es', datatype: 'urn:langString' });
    const before = discoveryFocus(house)!.query!;
    expect(before).toContain('Berisso\\"\\n\\\\$&');
    expect(before).toContain('LANG(');
    expect(before).toContain('urn:langString');
    const restored = new PropertyGraph();
    deserializeGraph(restored, serializeGraph(graph));
    expect(discoveryFocus(restored.nodes[0])!.query).toBe(before);
  });
  it('does not turn blank-node examples into constants', () => {
    const graph = new PropertyGraph();
    const house = addClassNode(graph, 'urn:House');
    const before = serializeGraph(graph);
    expect(() => addDiscoveryPath(graph, house, [{ predicate: 'urn:feature', direction: 'out', kind: 'resource' }], false,
      { kind: 'bnode', value: 'b0' })).toThrow();
    expect(serializeGraph(graph)).toEqual(before);
  });
  it('reuses the same address branch when adding another column or filter', () => {
    const graph = new PropertyGraph();
    const house = addClassNode(graph, 'urn:House');
    const path = [
      { predicate: 'urn:feature', direction: 'out' as const, kind: 'resource' as const, targetClass: 'urn:Address' },
      { predicate: 'urn:label', direction: 'out' as const, kind: 'literal' as const },
    ];
    addDiscoveryPath(graph, house, path);
    const before = graph.nodes.length;
    addDiscoveryPath(graph, house, path, false, { kind: 'literal', value: 'Berisso' });
    expect(graph.nodes).toHaveLength(before);
    expect(graph.edges.filter(e => e.source.getUri() === 'urn:feature')).toHaveLength(1);
    expect(discoveryFocus(house)!.query).toContain('Berisso');
  });
});
