import { abbreviateUri } from './abbreviate-uri';

describe('abbreviateUri', () => {
  it('abbreviates OVS resources with the exact hash namespace, without treating slash URIs as equivalent', () => {
    const base = 'http://www.semanticweb.org/luciana/ontologies/2024/8/inmontology';
    expect(abbreviateUri(`${base}#House`, { inm: `${base}#` })).toBe('inm:House');
    expect(abbreviateUri(`${base}/House`, { inm: `${base}#` })).toBe('House');
  });
  it('uses the most specific namespace', () => {
    expect(abbreviateUri('http://www.wikidata.org/entity/Q42', {
      wiki: 'http://www.wikidata.org/', wd: 'http://www.wikidata.org/entity/',
    })).toBe('wd:Q42');
  });
  it('keeps the full local name when the namespace is unknown', () => {
    const name = 'a-very-long-identifier-with-an-important-final-suffix';
    expect(abbreviateUri(`https://example.org/${name}`, {})).toBe(name);
    expect(abbreviateUri('https://example.org/schema#price', {})).toBe('price');
    expect(abbreviateUri('urn:example:price', {})).toBe('price');
  });
});
