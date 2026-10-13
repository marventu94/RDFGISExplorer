import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NEVER, Subject, of } from 'rxjs';
import type { QueryResult } from '@rdfgis/contracts';
import { ApiService } from './api.service';
import { AppConfigService } from './app-config.service';
import { SelectionService } from './selection.service';
import { QueryPagingService } from './query-paging.service';

const query = `SELECT ?listing ?date WHERE { ?listing <urn:date> ?date . }`;

function page(uri: string): QueryResult {
  return {
    variables: ['listing', 'date'],
    bindings: [{
      listing: { type: 'uri', value: uri },
      date: { type: 'date', value: '2023-10-15T00:00:00.000Z', raw: '2023-10-15T00:00:00' },
    }],
    nodes: [{ uri, label: uri, attributes: {}, temporalEvents: [{ field: 'date', isoDate: '2023-10-15T00:00:00.000Z' }] }],
    edges: [],
    meta: { durationMs: 1, truncated: true, limitApplied: 300, backend: 'test' },
  };
}

describe('QueryPagingService', () => {
  it('distinguishes batch navigation from filter recounts while loading', () => {
    const nextPage$ = new Subject<QueryResult>();
    const api = { fetchSummary: vi.fn(() => NEVER), executeQuery: vi.fn(() => nextPage$) };
    TestBed.configureTestingModule({ providers: [
      { provide: ApiService, useValue: api },
      { provide: AppConfigService, useValue: { load: () => of({ maxLimit: 1000 }), config: signal({ maxLimit: 1000 }) } },
    ] });
    const selection = TestBed.inject(SelectionService);
    const paging = TestBed.inject(QueryPagingService);
    const first = page('urn:first');
    selection.setQueryResult(first);
    paging.activate(query, first, 2, 1);

    selection.nextLot();
    expect(paging.busy()).toBe(true);
    expect(paging.loadingKind()).toBe('lot');
    expect(paging.loadingDirection()).toBe('next');
    nextPage$.next(page('urn:second'));
    nextPage$.complete();
    expect(paging.busy()).toBe(false);
    expect(paging.loadingKind()).toBeNull();

    selection.addFilter({ id: 'time', kind: 'temporal', label: 'Octubre', from: '2023-10-01', to: '2023-10-31' });
    expect(paging.busy()).toBe(true);
    expect(paging.loadingKind()).toBe('filter');
    expect(paging.loadingDirection()).toBeNull();
    paging.cancel();
    expect(paging.loadingKind()).toBeNull();
  });

  it('loads and merges every row of one entity without changing the visible lot', () => {
    const first = page('urn:first');
    const second = {
      ...page('urn:first'),
      bindings: [{ ...page('urn:first').bindings[0], date: { type: 'date' as const, value: '2023-11-15T00:00:00.000Z', raw: '2023-11-15T00:00:00' } }],
      nodes: [{ ...page('urn:first').nodes[0], temporalEvents: [{ field: 'date', isoDate: '2023-11-15T00:00:00.000Z' }] }],
    };
    const api = {
      fetchSummary: vi.fn().mockReturnValue(of({ totalRows: 2 })),
      executeQuery: vi.fn().mockReturnValueOnce(of(first)).mockReturnValueOnce(of(second)),
    };
    TestBed.configureTestingModule({ providers: [
      { provide: ApiService, useValue: api },
      { provide: AppConfigService, useValue: { load: () => of({ maxLimit: 1000 }), config: signal({ maxLimit: 1000 }) } },
    ] });
    const selection = TestBed.inject(SelectionService);
    const paging = TestBed.inject(QueryPagingService);
    selection.setLotSize(1);
    selection.setQueryResult(first);
    paging.activate(query, first, 2, 1);
    let result: QueryResult | undefined;
    paging.loadEntityStructure('listing', 'urn:first').subscribe((value) => { result = value; });
    expect(api.fetchSummary).toHaveBeenCalledTimes(1);
    expect(api.executeQuery).toHaveBeenCalledTimes(2);
    expect(api.executeQuery.mock.calls[1][0].sparql).toContain('OFFSET 1');
    expect(result?.bindings).toHaveLength(2);
    expect(result?.nodes[0].temporalEvents).toHaveLength(2);
    expect(selection.getCurrentLotSnapshot()).toBe(1);
    paging.loadEntityStructure('listing', 'urn:first').subscribe();
    expect(api.executeQuery).toHaveBeenCalledTimes(2);
  });

  it('counts the full query, loads pages on demand, then recounts the filtered query', () => {
    const api = {
      fetchSummary: vi.fn()
        .mockReturnValueOnce(of({ totalRows: 1996 }))
        .mockReturnValueOnce(of({ totalRows: 163 })),
      executeQuery: vi.fn()
        .mockReturnValueOnce(of(page('urn:first')))
        .mockReturnValueOnce(of(page('urn:second')))
        .mockReturnValueOnce(of(page('urn:filtered'))),
    };
    const config = { load: vi.fn().mockReturnValue(of({ maxLimit: 1000 })), config: signal({ maxLimit: 1000 }) };
    TestBed.configureTestingModule({ providers: [
      { provide: ApiService, useValue: api },
      { provide: AppConfigService, useValue: config },
    ] });
    const selection = TestBed.inject(SelectionService);
    const paging = TestBed.inject(QueryPagingService);
    const lots: Array<{ currentLot: number; totalRows: number; lotCount: number }> = [];
    const visible: Array<QueryResult | null> = [];
    selection.lotState$.subscribe((lot) => lots.push(lot));
    selection.visibleQueryResult$.subscribe((result) => { visible.push(result); });

    paging.loadInitial(query).subscribe(({ result, totalRows, size }) => {
      selection.setQueryResult(result);
      paging.activate(query, result, totalRows, size);
    });
    expect(api.fetchSummary).toHaveBeenCalledTimes(1);
    expect(api.fetchSummary.mock.invocationCallOrder[0]).toBeLessThan(api.executeQuery.mock.invocationCallOrder[0]);
    expect(lots.at(-1)).toMatchObject({ currentLot: 1, totalRows: 1996, lotCount: 7 });

    selection.nextLot();
    expect(api.fetchSummary).toHaveBeenCalledTimes(1);
    expect(api.executeQuery.mock.calls[1][0].sparql).toContain('OFFSET 300');
    expect(lots.at(-1)).toMatchObject({ currentLot: 2, totalRows: 1996, lotCount: 7 });

    selection.addFilter({ id: 'time', kind: 'temporal', label: 'October', from: '2023-10-01T00:00:00.000Z', to: '2023-10-31T23:59:59.999Z' });
    expect(api.fetchSummary).toHaveBeenCalledTimes(2);
    expect(api.fetchSummary.mock.calls[1][0].query).toContain('2023-10-01');
    expect(lots.at(-1)).toMatchObject({ currentLot: 1, totalRows: 163, baseTotalRows: 1996, lotCount: 1 });
    expect(visible.at(-1)?.nodes[0]?.uri).toBe('urn:filtered');
  });

  it('offers a return to the editor after five minutes and clears it on cancellation', () => {
    vi.useFakeTimers();
    try {
      TestBed.configureTestingModule({ providers: [
        { provide: ApiService, useValue: { fetchSummary: () => NEVER, executeQuery: vi.fn() } },
        { provide: AppConfigService, useValue: { load: () => of({ maxLimit: 1000 }), config: signal({ maxLimit: 1000 }) } },
      ] });
      const paging = TestBed.inject(QueryPagingService);
      paging.loadInitial(query).subscribe();
      vi.advanceTimersByTime(5 * 60 * 1000 + 1);
      expect(paging.slow()).toBe(true);
      paging.cancel();
      expect(paging.slow()).toBe(false);
      expect(paging.busy()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
