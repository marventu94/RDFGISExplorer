import { describe, it, expect } from 'vitest';
import {
  VirtuosoAdapter,
  FusekiAdapter,
  GenericAdapter,
  createEndpointAdapter,
} from './endpoint-adapter';

describe('VirtuosoAdapter', () => {
  it('produces bif:contains triple', () => {
    const a = new VirtuosoAdapter();
    const result = a.textSearchTriple('label', 'Einstein', 20);
    expect(result).toContain("bif:contains");
    expect(result).toContain("'Einstein'");
    expect(result).toContain('?label');
  });
});

describe('FusekiAdapter', () => {
  it('produces text:query triple with limit', () => {
    const a = new FusekiAdapter();
    const result = a.textSearchTriple('label', 'Einstein', 20);
    expect(result).toContain('text:query');
    expect(result).toContain('"Einstein"');
    expect(result).toContain('20');
  });
});

describe('GenericAdapter', () => {
  it('produces FILTER regex fragment', () => {
    const a = new GenericAdapter();
    const result = a.textSearchTriple('label', 'Einstein', 20);
    expect(result).toContain('FILTER regex');
    expect(result).toContain('?label');
    expect(result).toContain('"Einstein"');
    expect(result).toContain('"i"');
  });
});

describe('createEndpointAdapter', () => {
  it('returns VirtuosoAdapter for virtuoso', () => {
    expect(createEndpointAdapter('virtuoso')).toBeInstanceOf(VirtuosoAdapter);
  });

  it('returns FusekiAdapter for fuseki', () => {
    expect(createEndpointAdapter('fuseki')).toBeInstanceOf(FusekiAdapter);
  });

  it('returns GenericAdapter for other', () => {
    expect(createEndpointAdapter('other')).toBeInstanceOf(GenericAdapter);
  });
});
