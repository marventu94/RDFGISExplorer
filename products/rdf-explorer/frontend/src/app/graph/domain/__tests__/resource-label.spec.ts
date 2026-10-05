import { describe, expect, it } from 'vitest';
import { PropertyGraph } from '../graph';
import { curieLocal } from '../rdf-resource';

const ontology = 'http://www.semanticweb.org/luciana/ontologies/2024/8/inmontology#';
describe('canvas resource labels', () => {
  it('uses local names for classes and predicates without cached labels or prefixes', () => {
    const graph = new PropertyGraph();
    const node = graph.addNode(); node.addUri(ontology + 'Address'); node.mkConst();
    expect(node.getRepr()).toBe('Address');
    const property = graph.addNode().newProp(); property.addUri(ontology + 'hasFeature'); property.mkConst();
    expect(property.getRepr()).toBe('hasFeature');
    graph.addEdge(property, node);
    const query = property.parentNode.createQuery()!.toSparql()!;
    expect(query).toContain('<' + ontology + 'Address>');
    expect(query).toContain('<' + ontology + 'hasFeature>');
    expect(curieLocal(ontology + 'Address', [])).toEqual(['<' + ontology + 'Address>', null]);
  });
  it('prefers cached labels, then registered prefixes', () => {
    const graph = new PropertyGraph({ prefixes: [{ prefix: 'inm', uri: ontology }],
      labelProvider: { getLabel: uri => uri.endsWith('Address') ? 'Domicilio' : undefined } });
    const node = graph.addNode();
    expect(node.labelOf(ontology + 'Address')).toBe('Domicilio');
    expect(node.labelOf(ontology + 'House')).toBe('inm:House');
  });
  it('handles encoded names and empty labels without losing the URI', () => {
    const graph = new PropertyGraph({ labelProvider: { getLabel: () => '' } });
    const node = graph.addNode();
    expect(node.labelOf('https://example.org/C%C3%B3digo')).toBe('Código');
    expect(node.labelOf('https://example.org/bad%encoding')).toBe('bad%encoding');
  });
});
