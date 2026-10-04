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
  it.each(['class', 'property'] as const)(
    'builds a safe %s catalogue including unlabelled URI matches',
    (kind) => {
      const query = catalogQuery(kind, 'House"\'\\\n$&', 61);
      expect(() => parser.parse(query)).not.toThrow();
      expect(query).toContain('OPTIONAL');
      expect(query).toContain('STR(?uri)');
    },
  );
  it.each(['class', 'property'] as const)(
    'pages distinct %s terms before enriching labels and evidence',
    (kind) => {
      const query = catalogQuery(kind, 'house', 51, 50);
      const ast = parser.parse(query);
      expect(ast.type).toBe('query');
      if (ast.type !== 'query') throw new Error('Query required');
      const page = ast.where![0];
      if (page.type !== 'group' || page.patterns[0].type !== 'query')
        throw new Error('Bounded subquery required');
      const candidates = page.patterns[0];
      expect(candidates.limit).toBe(51);
      expect(candidates.offset).toBe(50);
      expect(candidates.distinct).toBe(true);
      expect(candidates.variables).toHaveLength(1);
      expect(JSON.stringify(candidates.where)).toContain('house');
      expect(query).toContain('EXISTS');
      expect(query).toContain('MIN(STR(?candidateLabel))');
      expect(query).toContain('GROUP BY ?uri ?evidence');
    },
  );
  it.each(['class', 'property'] as const)(
    'bounds both %s statement scans before distinct/filter/sort',
    (kind) => {
      const ast = parser.parse(catalogQuery(kind, 'house', 51, 0, 123));
      if (ast.type !== 'query' || ast.where![0].type !== 'group')
        throw new Error('Query required');
      const page = ast.where![0].patterns[0];
      if (page.type !== 'query' || page.where![0].type !== 'group')
        throw new Error('Page required');
      const union = page.where![0].patterns[0];
      if (union.type !== 'union') throw new Error('Union required');
      expect(union.patterns).toHaveLength(2);
      for (const branch of union.patterns) {
        if (branch.type !== 'query')
          throw new Error('Statement sample required');
        const scan = branch;
        expect(scan.limit).toBe(123);
        expect(scan.distinct).toBeUndefined();
        expect(scan.order).toBeUndefined();
        expect(JSON.stringify(scan.where)).not.toContain('house');
      }
    },
  );
  it('does not search labels or add an always-true text filter when browsing', () => {
    const query = catalogQuery('class', '', 51);
    expect(() => parser.parse(query)).not.toThrow();
    expect(query).not.toContain('CONTAINS');
    expect(query).not.toContain('?searchLabel');
  });
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
  it.each(['out', 'in'] as const)(
    'anchors a concrete resource directly for %s Wikidata exploration',
    (direction) => {
      const query = connectionsQuery(
        { uri: 'http://www.wikidata.org/entity/Q5879' },
        direction,
        200,
        61,
        {
          classPredicate: 'http://www.wikidata.org/prop/direct/P31',
          predicateNamespace: 'http://www.wikidata.org/prop/direct/',
          wikidataLabels: true,
        },
      );
      expect(() => parser.parse(query)).not.toThrow();
      expect(query).not.toContain('VALUES');
      expect(query).toContain(
        direction === 'out'
          ? '<http://www.wikidata.org/entity/Q5879> ?predicate ?neighbor'
          : '?neighbor ?predicate <http://www.wikidata.org/entity/Q5879>',
      );
      expect(query).toContain('STRSTARTS');
      expect(query).toContain(
        '?neighbor <http://www.wikidata.org/prop/direct/P31> ?targetClass',
      );
      expect(query).toContain('LIMIT 61');
      expect(query).toContain(
        '?propertyEntity <http://www.w3.org/2000/01/rdf-schema#label> ?label',
      );
      expect(query).toContain(
        '?exampleUri <http://www.w3.org/2000/01/rdf-schema#label> ?exampleLabel',
      );
    },
  );
  it('uses the adapter class predicate in class and traversed focuses', () => {
    const sample = focusSample(
      {
        classUri: 'urn:Writer',
        steps: [
          {
            predicate: 'urn:author',
            direction: 'in',
            kind: 'resource',
            targetClass: 'urn:Book',
          },
        ],
      },
      200,
      'urn:instanceOf',
    );
    expect(sample).toContain('?__d_root <urn:instanceOf> <urn:Writer>');
    expect(sample).toContain('?__d_step0 <urn:instanceOf> <urn:Book>');
    expect(() => parser.parse(`SELECT * WHERE { ${sample} }`)).not.toThrow();
  });
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
