import { Parser } from 'sparqljs';
import {
  catalogQuery,
  connectionsQuery,
  focusPattern,
  focusSample,
  iri,
} from './discovery-query';
import type { DiscoveryFocus } from '@rdfgis/contracts';

describe('discovery SPARQL', () => {
  const parser = new Parser();
  it.each(['class', 'property', 'resource'] as const)(
    'builds a safe %s catalogue including unlabelled URI matches',
    (kind) => {
      const query = catalogQuery(kind, 'House"\'\\\n$&', 61);
      expect(() => parser.parse(query)).not.toThrow();
      expect(query).toContain('OPTIONAL');
      expect(query).toContain('STR(?uri)');
    },
  );
  it.each(['out', 'in'] as const)(
    'queries %s relationships on the same joined context, including blank nodes',
    (direction) => {
      const focus: DiscoveryFocus = {
        query:
          'PREFIX ex: <https://example.org/> SELECT ?house WHERE { ?house a ex:House . ?listing ex:about ?house; ex:function ex:Sell }',
        variable: 'house',
        steps: [
          {
            predicate: 'https://example.org/feature',
            direction: 'out',
            kind: 'resource',
            targetClass: 'https://example.org/Address',
          },
        ],
      };
      const query = connectionsQuery(focus, direction, 200, 61);
      expect(() => parser.parse(query)).not.toThrow();
      expect(query).not.toContain('PREFIX');
      expect(query).toContain('!isLiteral(?__d_step0)');
      expect(query).toContain('COUNT(DISTINCT ?__d_focus)');
      expect(query).toContain('LIMIT 200');
      expect(query).toContain('https://example.org/Sell');
      expect(query).toContain(
        direction === 'out'
          ? '?__d_focus ?predicate ?neighbor'
          : '?neighbor ?predicate ?__d_focus',
      );
    },
  );
  it('keeps OPTIONAL and filters in context', () => {
    const query = focusSample(
      {
        query:
          'SELECT ?x WHERE { ?x <urn:p> ?v . FILTER(?v > 2) OPTIONAL { ?x <urn:q> ?z } } LIMIT 5',
        variable: 'x',
      },
      200,
    );
    expect(() => parser.parse(`SELECT * WHERE { ${query} }`)).not.toThrow();
    expect(query).toContain('OPTIONAL');
    expect(query).toContain('LIMIT 5');
  });
  it.each([
    {},
    { uri: 'urn:x', classUri: 'urn:C' },
    { uri: '_:b0' },
    { query: 'DELETE WHERE { ?s ?p ?o }', variable: 's' },
    { query: 'SELECT ?x WHERE { ?x <urn:p> ?o }', variable: 'missing' },
    { query: 'SELECT ?x WHERE { ?x <urn:p> ?__d_root }', variable: 'x' },
    {
      classUri: 'urn:C',
      steps: [{ predicate: 'urn:p', kind: 'literal', direction: 'in' }],
    },
  ])('rejects malformed or unsafe focuses: %j', (focus) => {
    expect(() => focusPattern(focus as DiscoveryFocus)).toThrow();
  });
  it.each(['urn:x> ?s ?p ?o', 'urn:a\\b', 'urn:a{b}', 'relative', '_:b0'])(
    'rejects unsafe IRI %s',
    (uri) => {
      expect(() => iri(uri)).toThrow();
    },
  );
});
