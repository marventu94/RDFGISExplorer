import { exportAllPages, DEFAULT_MIN_PAGE_SIZE } from './result-exporter';
import type { QueryResult, ResultBinding } from '@shared/models';

const QUERY = 'SELECT ?item WHERE { ?item ?p ?o }';

function page(vars: string[], bindings: ResultBinding[]): QueryResult {
  return {
    variables: vars,
    bindings,
    nodes: [],
    edges: [],
    meta: { durationMs: 1, truncated: false, limitApplied: 2000, backend: 'wikidata' },
  };
}

function rows(n: number, prefix = 'http://x/i'): ResultBinding[] {
  return Array.from({ length: n }, (_, i) => ({
    item: { type: 'uri' as const, value: `${prefix}${i}` },
  }));
}

/** fetchPage que devuelve páginas según el OFFSET de la query envuelta. */
function fakeEndpoint(total: number) {
  const all = rows(total);
  return vi.fn((sparql: string, limit: number) => {
    const offset = Number(/OFFSET (\d+)/.exec(sparql)?.[1] ?? 0);
    return Promise.resolve(page(['item'], all.slice(offset, offset + limit)));
  });
}

describe('exportAllPages', () => {
  it('accumulates multiple pages until a short page', async () => {
    const fetchPage = fakeEndpoint(4500);
    const progress: number[] = [];

    const result = await exportAllPages({
      query: QUERY,
      pageSize: 2000,
      fetchPage,
      onProgress: (p) => progress.push(p.rowsFetched),
    });

    expect(result.status).toBe('complete');
    expect(result.rows).toHaveLength(4500);
    expect(result.variables).toEqual(['item']);
    expect(fetchPage).toHaveBeenCalledTimes(3); // 2000 + 2000 + 500
    expect(progress).toEqual([2000, 4000, 4500]);
  });

  it('stops on an empty page', async () => {
    const fetchPage = fakeEndpoint(4000); // exactamente 2 páginas llenas
    const result = await exportAllPages({ query: QUERY, pageSize: 2000, fetchPage });

    expect(result.status).toBe('complete');
    expect(result.rows).toHaveLength(4000);
    expect(fetchPage).toHaveBeenCalledTimes(3); // la 3ra vuelve vacía
  });

  it('paginates deterministically with ORDER BY and embedded OFFSET/LIMIT', async () => {
    const fetchPage = fakeEndpoint(4500);
    await exportAllPages({ query: QUERY, pageSize: 2000, fetchPage });

    const firstQuery = fetchPage.mock.calls[0][0] as string;
    expect(firstQuery).toContain('ORDER BY ?item');
    expect(firstQuery).toContain('OFFSET 0');
    expect(firstQuery).toContain('LIMIT 2000');
    const secondQuery = fetchPage.mock.calls[1][0] as string;
    expect(secondQuery).toContain('OFFSET 2000');
  });

  it('respects a user ORDER BY (no extra one)', async () => {
    const fetchPage = fakeEndpoint(3);
    await exportAllPages({
      query: 'SELECT ?item WHERE { ?item ?p ?o } ORDER BY ?item',
      pageSize: 2000,
      fetchPage,
    });
    const sent = fetchPage.mock.calls[0][0] as string;
    expect(sent.indexOf('ORDER BY')).toBe(sent.lastIndexOf('ORDER BY'));
  });

  it('halves the page on timeout and retries the same offset', async () => {
    const all = rows(3000);
    let calls = 0;
    const fetchPage = vi.fn((sparql: string, limit: number) => {
      calls++;
      if (calls === 1) return Promise.reject({ status: 408 }); // timeout en la 1ra página
      const offset = Number(/OFFSET (\d+)/.exec(sparql)?.[1] ?? 0);
      return Promise.resolve(page(['item'], all.slice(offset, offset + limit)));
    });

    const result = await exportAllPages({ query: QUERY, pageSize: 2000, fetchPage });

    expect(result.status).toBe('complete');
    expect(result.rows).toHaveLength(3000);
    // 2do intento: mismo OFFSET 0 con LIMIT 1000; y sigue con página reducida.
    expect(fetchPage.mock.calls[1][0]).toContain('OFFSET 0');
    expect(fetchPage.mock.calls[1][0]).toContain('LIMIT 1000');
    expect(fetchPage.mock.calls[2][0]).toContain('OFFSET 1000');
    expect(fetchPage.mock.calls[2][0]).toContain('LIMIT 1000');
  });

  it('aborts with a clear error when timeouts persist below the minimum page', async () => {
    const fetchPage = vi.fn(() => Promise.reject({ status: 408 }));
    // DEFAULT_MIN_PAGE_SIZE = 250: 250 → 125 < 250 → aborta.
    const result = await exportAllPages({
      query: QUERY,
      pageSize: DEFAULT_MIN_PAGE_SIZE,
      fetchPage,
    });

    expect(result.status).toBe('error');
    expect(result.error).toContain('tiempo de espera');
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it('does not retry non-timeout errors', async () => {
    const fetchPage = vi.fn(() => Promise.reject(new Error('endpoint roto')));
    const result = await exportAllPages({ query: QUERY, pageSize: 2000, fetchPage });

    expect(result.status).toBe('error');
    expect(result.error).toBe('endpoint roto');
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it('stops at maxRows and reports max-rows with the truncated rows', async () => {
    const fetchPage = fakeEndpoint(100_000);
    const result = await exportAllPages({
      query: QUERY,
      pageSize: 2000,
      maxRows: 5000,
      fetchPage,
    });

    expect(result.status).toBe('max-rows');
    expect(result.rows).toHaveLength(5000);
    expect(fetchPage).toHaveBeenCalledTimes(3);
  });

  it('cancels cooperatively between pages', async () => {
    const fetchPage = fakeEndpoint(10_000);
    let cancel = false;
    const result = await exportAllPages({
      query: QUERY,
      pageSize: 2000,
      fetchPage,
      isCancelled: () => cancel,
      onProgress: () => {
        cancel = true; // se cancela después de la 1ra página
      },
    });

    expect(result.status).toBe('cancelled');
    expect(result.rows).toHaveLength(2000);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });
});
