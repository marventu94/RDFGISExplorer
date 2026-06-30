import { describe, it, expect } from 'vitest';
import {
  querySearch,
  queryGetClasses,
  queryGetProperties,
  queryCountValuesType,
  queryGetPropUri,
  queryGetPropObject,
  queryGetPropDatatype,
} from './query.service';

describe('querySearch', () => {
  const baseOpts = (overrides = {}) => ({
    endpointType: 'other' as const,
    ...overrides,
  });

  it('emits a DISTINCT SELECT on ?uri ?label ?type ?tlabel', () => {
    const q = querySearch('Einstein', baseOpts());
    expect(q).toContain('SELECT DISTINCT ?uri ?label ?type ?tlabel');
  });

  it('includes FILTER regex for generic endpoint type', () => {
    const q = querySearch('Einstein', baseOpts({ endpointType: 'other' }));
    expect(q).toContain('FILTER regex');
  });

  it('includes bif:contains for virtuoso endpoint type', () => {
    const q = querySearch('Einstein', baseOpts({ endpointType: 'virtuoso' }));
    expect(q).toContain("bif:contains");
    expect(q).toContain("'Einstein'");
  });

  it('includes text:query for fuseki endpoint type', () => {
    const q = querySearch('Einstein', baseOpts({ endpointType: 'fuseki' }));
    expect(q).toContain('text:query');
  });

  it('adds fuseki PREFIX text: header', () => {
    const q = querySearch('Einstein', baseOpts({ endpointType: 'fuseki' }));
    expect(q).toContain('PREFIX text:');
  });

  it('respects limit and offset', () => {
    const q = querySearch('test', baseOpts({ limit: 10, offset: 5 }));
    expect(q).toContain('LIMIT 10');
    expect(q).toContain('OFFSET 5');
  });

  it('defaults limit to 20 when not provided', () => {
    const q = querySearch('test', baseOpts());
    expect(q).toContain('LIMIT 20');
  });

  it('defaults type to dbo:Person when not provided', () => {
    const q = querySearch('test', baseOpts());
    expect(q).toContain('?uri rdf:type ?type');
  });

  it('accepts type option without injecting it into query', () => {
    const q = querySearch('test', baseOpts({ type: 'http://example.org/Foo' }));
    expect(q).toContain('SELECT DISTINCT ?uri ?label ?type ?tlabel');
  });

  it('escapes double quotes in keyword', () => {
    const q = querySearch('test"evil', baseOpts({ endpointType: 'other' }));
    expect(q).toContain('\\"');
    expect(q).not.toContain('test"evil');
  });

  it('escapes backslashes in keyword', () => {
    const q = querySearch('test\\evil', baseOpts({ endpointType: 'other' }));
    expect(q).toContain('\\\\');
  });

  it('escapes double-quote and backslash in keyword to prevent SPARQL injection', () => {
    const q = querySearch('\'"; DROP', baseOpts({ endpointType: 'other' }));
    expect(q).toContain('\\"');
    expect(q).toContain('FILTER regex');
    const evil = 'evil\\" ; DROP';
    const q2 = querySearch(evil, baseOpts({ endpointType: 'other' }));
    expect(q2).toContain('\\\\');
  });
});

describe('queryGetClasses', () => {
  it('emits SELECT DISTINCT ?uri ?label for a given URI', () => {
    const q = queryGetClasses('http://example.org/Foo');
    expect(q).toContain('SELECT DISTINCT ?uri ?label');
    expect(q).toContain('<http://example.org/Foo> a ?uri');
    expect(q).toContain('PREFIX rdfs:');
  });

  it('adds limit and offset when provided', () => {
    const q = queryGetClasses('http://example.org/Foo', { limit: 5, offset: 10 });
    expect(q).toContain('limit 5');
    expect(q).toContain('offset 10');
  });

  it('omits limit/offset when not provided', () => {
    const q = queryGetClasses('http://example.org/Foo');
    expect(q).not.toContain('limit');
    expect(q).not.toContain('offset');
  });
});

describe('queryGetProperties', () => {
  it('includes wikibase:directClaim for Wikidata model', () => {
    const q = queryGetProperties('http://www.wikidata.org/entity/Q146', { wikibase: true });
    expect(q).toContain('wikibase:directClaim');
    expect(q).toContain('?property []');
    expect(q).toContain('ObjectProperty');
    expect(q).toContain('DatatypeProperty');
    expect(q).toContain('?kind');
  });

  it('omits wikibase:directClaim for generic backends', () => {
    const q = queryGetProperties('http://example.org/Q146', { wikibase: false });
    expect(q).not.toContain('wikibase:directClaim');
    expect(q).not.toContain('PREFIX wikibase');
    expect(q).toContain('?property []');
    expect(q).toContain('ObjectProperty');
    expect(q).toContain('DatatypeProperty');
    expect(q).toContain('?kind');
  });
});

describe('queryCountValuesType', () => {
  it('emits sum(?u) ?uris sum(?l) ?lits', () => {
    const q = queryCountValuesType('http://example.org/Foo', 'http://example.org/bar');
    expect(q).toContain('sum(?u) as ?uris');
    expect(q).toContain('sum(?l) as ?lits');
    expect(q).toContain('ISURI(?o)');
  });
});

describe('queryGetPropUri', () => {
  it('selects ?uri for given subject and property', () => {
    const q = queryGetPropUri('http://example.org/Foo', 'http://example.org/bar');
    expect(q).toContain('SELECT ?uri');
    expect(q).toContain('<http://example.org/Foo>');
    expect(q).toContain('<http://example.org/bar>');
  });
});

describe('queryGetPropObject', () => {
  it('selects ?uri ?uriLabel with OPTIONAL rdfs:label', () => {
    const q = queryGetPropObject('http://example.org/Foo', 'http://example.org/bar');
    expect(q).toContain('SELECT DISTINCT ?uri ?uriLabel');
    expect(q).toContain('OPTIONAL');
    expect(q).toContain('rdfs:label');
  });
});

describe('queryGetPropDatatype', () => {
  it('selects ?lit filtered by lang', () => {
    const q = queryGetPropDatatype('http://example.org/Foo', 'http://example.org/bar');
    expect(q).toContain('SELECT DISTINCT ?lit');
    expect(q).toContain('lang(?lit)');
  });
});
