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
  it('reports nothing without an outer LIMIT', () => {
    expect(buildQueryLimitNotice(BASE, 1000)).toBeNull();
  });

  it('reports nothing until the backend cap is known', () => {
    expect(buildQueryLimitNotice(`${BASE} LIMIT 500`, null)).toBeNull();
    expect(buildQueryLimitNotice(`${BASE} LIMIT 500`, 0)).toBeNull();
  });

  it('reports that the result is considered complete when LIMIT is below the cap', () => {
    const notice = buildQueryLimitNotice(`${BASE} LIMIT 500`, 1000);
    expect(notice).not.toBeNull();
    expect(notice!.capped).toBe(false);
    expect(notice!.limit).toBe(500);
    expect(notice!.summary).toContain('resultado completo');
    expect(notice!.detail).toContain('no se marca');
  });

  it('reports that the backend still truncates when LIMIT exceeds the cap', () => {
    const notice = buildQueryLimitNotice(`${BASE} LIMIT 5000`, 1000);
    expect(notice!.capped).toBe(true);
    expect(notice!.summary).toContain('recorta a 1000 filas');
  });

  it('treats LIMIT equal to the cap as backend truncation', () => {
    const notice = buildQueryLimitNotice(`${BASE} LIMIT 1000`, 1000);
    expect(notice!.capped).toBe(true);
  });
});
