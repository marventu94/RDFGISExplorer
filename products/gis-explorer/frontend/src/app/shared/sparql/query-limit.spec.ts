import { describe, it, expect } from 'vitest';
import { buildQueryLimitNotice, detectTopLevelLimit } from './query-limit';

const BASE = 'SELECT * WHERE { ?s ?p ?o }';

describe('detectTopLevelLimit', () => {
  it('returns the outer-level LIMIT', () => {
    expect(detectTopLevelLimit(`${BASE} LIMIT 500`)).toBe(500);
  });

  it('returns null when the query declares no LIMIT', () => {
    expect(detectTopLevelLimit(BASE)).toBeNull();
  });

  it('ignores subquery LIMIT because it does not bound what the dashboard receives', () => {
    const query = 'SELECT * WHERE { { SELECT * WHERE { ?s ?p ?o } LIMIT 10 } }';
    expect(detectTopLevelLimit(query)).toBeNull();
  });

  it('returns null while the text cannot be parsed', () => {
    expect(detectTopLevelLimit('SELECT * WHERE { ?s ?p')).toBeNull();
  });

  it('returns null for an empty editor', () => {
    expect(detectTopLevelLimit('   ')).toBeNull();
  });
});

describe('buildQueryLimitNotice', () => {
  it('does not warn on unbounded queries', () => {
    expect(buildQueryLimitNotice(BASE)).toBeNull();
  });
  it('warns on a manual LIMIT regardless of the server batch size', () => {
    expect(buildQueryLimitNotice(`${BASE} LIMIT 5000`)).toEqual({ limit: 5000, offset: null });
    expect(buildQueryLimitNotice(`${BASE} LIMIT 0`)).toEqual({ limit: 0, offset: null });
  });
  it('warns on OFFSET alone and combined with LIMIT', () => {
    expect(buildQueryLimitNotice(`${BASE} OFFSET 20`)).toEqual({ limit: null, offset: 20 });
    expect(buildQueryLimitNotice(`${BASE} LIMIT 50 OFFSET 20`)).toEqual({ limit: 50, offset: 20 });
  });
});
