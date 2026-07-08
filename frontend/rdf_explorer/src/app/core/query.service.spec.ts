import { describe, it, expect } from 'vitest';
import {
  querySearch,
  queryGetClasses,
  queryGetProperties,
  queryCountValuesType,
  queryGetPropUri,
  queryGetPropObject,
  queryGetPropDatatype,
  DEFAULT_QUERY_CONTEXT,
  type QueryContext,
} from './query.service';

const ctx: QueryContext = { ...DEFAULT_QUERY_CONTEXT };

describe('querySearch', () => {
  const baseOpts = (overrides = {}) => ({
    ...ctx,
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

  it('uses rdf:type for class constraint', () => {
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

  it('uses the configured labelUri in triples', () => {
    const q = querySearch('test', { ...ctx, labelUri: 'http://example.org/myLabel' });
    expect(q).toContain('?uri <http://example.org/myLabel> ?label');
    expect(q).not.toContain('rdfs:label');
  });

  it('uses the configured lang in FILTER', () => {
    const q = querySearch('test', { ...ctx, lang: 'es' });
    expect(q).toContain('FILTER (lang(?label) = "es")');
    expect(q).not.toContain('"en"');
  });
});

describe('queryGetClasses', () => {
  it('emits SELECT DISTINCT ?uri ?label for a given URI', () => {
    const q = queryGetClasses('http://example.org/Foo', ctx);
    expect(q).toContain('SELECT DISTINCT ?uri ?label');
    expect(q).toContain('<http://example.org/Foo> a ?uri');
  });

  it('adds limit and offset when provided', () => {
    const q = queryGetClasses('http://example.org/Foo', { ...ctx, limit: 5, offset: 10 });
    expect(q).toContain('limit 5');
    expect(q).toContain('offset 10');
  });

  it('omits limit/offset when not provided', () => {
    const q = queryGetClasses('http://example.org/Foo', ctx);
    expect(q).not.toContain('limit');
    expect(q).not.toContain('offset');
  });
});

describe('queryGetProperties', () => {
  it('includes wikibase:directClaim when wikibase adapter enabled', () => {
    const q = queryGetProperties('http://www.wikidata.org/entity/Q146', { ...ctx, supportsWikibaseLabel: true });
    expect(q).toContain('wikibase:directClaim');
    expect(q).toContain('?property []');
    expect(q).toContain('wikibase:propertyType');
    expect(q).toContain('wikibase:WikibaseItem');
    expect(q).toContain('?kind');
    expect(q).toContain('?p wikibase:propertyType');
    expect(q).not.toContain('?property wikibase:propertyType');
    expect(q).not.toContain('SERVICE wikibase:label');
    expect(q).not.toContain('SELECT ?property WHERE');
  });

  it('omits wikibase:directClaim when wikibase adapter disabled', () => {
    const q = queryGetProperties('http://example.org/Q146', { ...ctx, supportsWikibaseLabel: false });
    expect(q).not.toContain('wikibase:directClaim');
    expect(q).not.toContain('PREFIX wikibase');
    expect(q).toContain('?property []');
    expect(q).toContain('BIND("0" AS ?kind)');
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
  it('selects ?uri ?uriLabel with OPTIONAL label', () => {
    const q = queryGetPropObject('http://example.org/Foo', 'http://example.org/bar', ctx);
    expect(q).toContain('SELECT DISTINCT ?uri ?uriLabel');
    expect(q).toContain('OPTIONAL');
    expect(q).toContain('?uri <http://www.w3.org/2000/01/rdf-schema#label> ?uriLabel');
  });

  it('uses configured labelUri', () => {
    const q = queryGetPropObject('http://example.org/Foo', 'http://example.org/bar', { ...ctx, labelUri: 'http://example.org/x' });
    expect(q).toContain('?uri <http://example.org/x> ?uriLabel');
  });

  it('uses configured lang', () => {
    const q = queryGetPropObject('http://example.org/Foo', 'http://example.org/bar', { ...ctx, lang: 'fr' });
    expect(q).toContain('FILTER (lang(?uriLabel) = "fr")');
  });
});

describe('queryGetPropDatatype', () => {
  it('selects ?lit filtered by lang', () => {
    const q = queryGetPropDatatype('http://example.org/Foo', 'http://example.org/bar', ctx);
    expect(q).toContain('SELECT DISTINCT ?lit');
    expect(q).toContain('lang(?lit)');
  });

  it('uses configured lang in fallback filter', () => {
    const q = queryGetPropDatatype('http://example.org/Foo', 'http://example.org/bar', { ...ctx, lang: 'pt' });
    expect(q).toContain('"pt"');
  });
});
