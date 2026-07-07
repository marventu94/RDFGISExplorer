import { describe, it, expect } from 'vitest';
import { labelOf, toCurie } from './label.util';
import type { Prefix } from './services/app-config.service';

const prefixes: readonly Prefix[] = [
  { prefix: 'wd', uri: 'http://www.wikidata.org/entity/' },
  { prefix: 'wdt', uri: 'http://www.wikidata.org/prop/direct/' },
  { prefix: 'rdfs', uri: 'http://www.w3.org/2000/01/rdf-schema#' },
];

const cache = new Map<string, string>([
  ['http://www.wikidata.org/entity/Q146', 'house cat'],
]);

describe('toCurie', () => {
  it('returns curie and prefix object when a prefix matches', () => {
    const [curie, prefix] = toCurie('http://www.wikidata.org/entity/Q146', prefixes);
    expect(curie).toBe('wd:Q146');
    expect(prefix).toBe(prefixes[0]);
  });

  it('returns <uri> and null when no prefix matches', () => {
    const [curie, prefix] = toCurie('http://example.org/foo', prefixes);
    expect(curie).toBe('<http://example.org/foo>');
    expect(prefix).toBeNull();
  });

  it('matches the first prefix in order', () => {
    const [curie] = toCurie('http://www.wikidata.org/prop/direct/P31', prefixes);
    expect(curie).toBe('wdt:P31');
  });
});

describe('labelOf', () => {
  it('returns cached label when available', () => {
    expect(labelOf('http://www.wikidata.org/entity/Q146', prefixes, cache)).toBe('house cat');
  });

  it('returns curie when not cached but prefix matches', () => {
    expect(labelOf('http://www.wikidata.org/prop/direct/P31', prefixes, cache)).toBe('wdt:P31');
  });

  it('returns original URI when neither cached nor prefix matches', () => {
    const result = labelOf('http://example.org/foo', prefixes, cache);
    expect(result).toBe('<http://example.org/foo>');
  });

  it('returns curie for cached URIs that have matching prefixes if not in cache', () => {
    expect(labelOf('http://www.wikidata.org/entity/Q999', prefixes, new Map())).toBe('wd:Q999');
  });
});
