import { escapeSparqlLiteral, isValidUri } from './sparql-text';

describe('escapeSparqlLiteral', () => {
  it('escapes backslashes before quotes (order matters)', () => {
    expect(escapeSparqlLiteral('a\\b')).toBe('a\\\\b');
    expect(escapeSparqlLiteral('a"b')).toBe('a\\"b');
    expect(escapeSparqlLiteral('a\\"b')).toBe('a\\\\\\"b');
  });

  it('escapes newlines and carriage returns', () => {
    expect(escapeSparqlLiteral('a\nb\rc')).toBe('a\\nb\\rc');
  });

  it('leaves normal text untouched', () => {
    expect(escapeSparqlLiteral('Buenos Aires')).toBe('Buenos Aires');
  });
});

describe('isValidUri', () => {
  it('accepts IRIs with scheme', () => {
    expect(isValidUri('http://example.org/Class')).toBe(true);
    expect(isValidUri('urn:isbn:123')).toBe(true);
  });

  it('rejects what would break a <...> or a literal', () => {
    expect(isValidUri('not a uri with spaces')).toBe(false);
    expect(isValidUri('http://example.org/a>b')).toBe(false);
    expect(isValidUri('http://example.org/a"b')).toBe(false);
    expect(isValidUri('')).toBe(false);
  });
});
