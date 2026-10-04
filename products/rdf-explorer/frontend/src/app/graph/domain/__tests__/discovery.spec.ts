import { describe, expect, it } from 'vitest';
import { addClassNode, addDiscoveryPath, discoveryFocus } from '../discovery';
import { PropertyGraph } from '../graph';
import { WikidataAdapter } from '../endpoint/wikidata-adapter';
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
  it('uses P31 for Wikidata classes and reuses typed discovered branches', () => {
    const graph = new PropertyGraph({ endpointAdapter: new WikidataAdapter() });
    const writer = addClassNode(graph, 'http://www.wikidata.org/entity/Q49757');
    const step = { predicate: 'http://www.wikidata.org/prop/direct/P19', direction: 'out' as const,
      kind: 'resource' as const, targetClass: 'http://www.wikidata.org/entity/Q515' };
    const city = addDiscoveryPath(graph, writer, [step]);
    expect(addDiscoveryPath(graph, writer, [step])).toBe(city);
    expect(graph.edges.filter(edge => edge.source.getUri() === 'http://www.wikidata.org/prop/direct/P31')).toHaveLength(2);
    expect(discoveryFocus(writer)?.query).not.toContain('rdf-syntax-ns#type');
  });
  it('names discovered objects and literals after their predicates and preserves names through persistence', () => {
    const graph = new PropertyGraph();
    const house = addClassNode(graph, 'urn:House');
    const address = addDiscoveryPath(graph, house, [{
      predicate: 'https://example.org/addressFeature', direction: 'out', kind: 'resource', targetClass: 'urn:Address',
    }]);
    expect(house.variable.get()).toBe('?house');
    expect(address.variable.get()).toBe('?addressFeature');
    const literal = addDiscoveryPath(graph, address as typeof house, [{
      predicate: 'urn:postalCode', direction: 'out', kind: 'literal',
    }]);
    expect(literal.variable.get()).toBe('?postalCode');
    const query = discoveryFocus(house)!.query!;
    expect(query).toContain('?addressFeature');
    expect(query).toContain('?postalCode');
    const restored = new PropertyGraph();
    deserializeGraph(restored, serializeGraph(graph));
    expect(discoveryFocus(restored.nodes[0])!.query).toBe(query);
  });
  it('avoids name collisions and preserves a custom alias when reusing a branch', () => {
    const graph = new PropertyGraph();
    const house = addClassNode(graph, 'urn:House');
    const step = { predicate: 'urn:addressFeature', direction: 'out' as const, kind: 'resource' as const, targetClass: 'urn:Address' };
    const first = addDiscoveryPath(graph, house, [step]);
    const optional = addDiscoveryPath(graph, house, [step], true);
    expect(first.variable.get()).toBe('?addressFeature');
    expect(optional.variable.get()).toBe('?addressFeature2');
    first.variable.setAlias('myAddress', graph);
    expect(addDiscoveryPath(graph, house, [step])).toBe(first);
    expect(first.variable.get()).toBe('?myAddress');
  });
  it('sanitizes cached endpoint labels into valid variable names', () => {
    const graph = new PropertyGraph({ labelProvider: { getLabel: () => 'Código postal / área' } });
    const source = graph.addNode();
    const literal = addDiscoveryPath(graph, source, [{ predicate: 'urn:P123', direction: 'out', kind: 'literal' }]);
    expect(literal.variable.get()).toBe('?codigoPostalArea');
    const unnamedGraph = new PropertyGraph();
    const next = addDiscoveryPath(unnamedGraph, unnamedGraph.addNode(), [{ predicate: 'urn:123-feature', direction: 'in', kind: 'resource' }]);
    expect(next.variable.get()).toBe('?value123Feature');
  });
  it('drops a class as a named typed variable at the canvas position', () => {
    const graph = new PropertyGraph();
    graph.applyDrop({ kind: 'class', uri: 'urn:House' }, { x: 120, y: 80 });
    const selected = graph.selected!;
    expect(selected.isVariable()).toBe(true);
    expect(selected.variable.get()).toBe('?house');
    expect({ x: selected.x, y: selected.y }).toEqual({ x: 120, y: 80 });
    expect(graph.edges[0].source.getUri()).toBe('http://www.w3.org/1999/02/22-rdf-syntax-ns#type');
    expect(graph.edges[0].target.getUri()).toBe('urn:House');
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
