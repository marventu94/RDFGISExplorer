import { Injectable, inject, signal } from '@angular/core';
import { Observable, Subject, Subscription, concatMap, defer, finalize, map, of, range, switchMap, takeUntil, throwError, toArray } from 'rxjs';
import type { Filter, QueryResult } from '@shared/models';
import { ApiService } from './api.service';
import { SelectionService } from './selection.service';
import { VariableMappingService } from './variable-mapping.service';
import { entityScopedQuery, filterVariables, pagedQuery, scopedQuery } from '@shared/query/paged-query';
import { mergePages } from '@shared/query/merge-pages';
import { AppConfigService } from './app-config.service';

const LONG_QUERY_MS = 5 * 60 * 1000;
const ENDPOINT_TIMEOUT_MS = 10 * 60 * 1000;
type LoadKind = 'initial' | 'lot' | 'size' | 'filter';
type LotDirection = 'previous' | 'next' | null;

interface Session {
  query: string;
  fields: ReturnType<typeof filterVariables>;
  baseTotalRows: number;
  totalRows: number;
  scoped: string;
  cache: Map<string, QueryResult>;
}

@Injectable({ providedIn: 'root' })
export class QueryPagingService {
  private readonly api = inject(ApiService);
  private readonly selection = inject(SelectionService);
  private readonly mapping = inject(VariableMappingService);
  private readonly config = inject(AppConfigService);
  private readonly cancel$ = new Subject<void>();
  private activeRequest?: Subscription;
  private slowTimer?: ReturnType<typeof setTimeout>;
  private generation = 0;
  private session: Session | null = null;
  private restoring = false;
  private readonly entityCache = new Map<string, QueryResult>();
  private requestedScoped: string | null = null;
  private retryRequest: { lot: number; size: number; recount: boolean; scoped: string; kind: LoadKind } | null = null;

  readonly busy = signal(false);
  readonly loadingKind = signal<LoadKind | null>(null);
  readonly loadingDirection = signal<LotDirection>(null);
  readonly slow = signal(false);
  readonly error = signal<string | null>(null);

  constructor() {
    this.selection.pageRequests$.subscribe(({ lot, size }) => this.loadRequestedPage(lot, size));
    this.selection.activeFilters$.subscribe((filters) => {
      if (this.session && !this.restoring) this.applyFilters(filters);
    });
  }

  /** COUNT is authoritative; a page is only fetched after its total is known. */
  loadInitial(query: string): Observable<{ result: QueryResult; totalRows: number; size: number }> {
    this.session = null;
    this.entityCache.clear();
    this.requestedScoped = null;
    this.retryRequest = null;
    this.activeRequest?.unsubscribe();
    const generation = ++this.generation;
    return defer(() => {
      this.startWait('initial');
      return this.config.load().pipe(
        switchMap((cfg) => {
          const size = cfg.limits?.lotDefaultSize ?? Math.min(this.selection.getLotSizeSnapshot(), cfg.maxLimit);
          return this.count(query).pipe(
            switchMap((totalRows) => this.page(query, 1, size).pipe(
              map((result) => ({ result, totalRows, size })),
            )),
          );
        }),
        takeUntil(this.cancel$),
        finalize(() => this.finishWait(generation)),
      );
    });
  }

  activate(query: string, initial: QueryResult, totalRows: number, size: number, rawInitial: QueryResult = initial): void {
    this.entityCache.clear();
    const fields = filterVariables(initial);
    this.session = {
      query,
      fields,
      baseTotalRows: totalRows,
      totalRows,
      scoped: query,
      cache: new Map([[`1:${size}`, rawInitial]]),
    };
    this.selection.setRemotePage(this.completePage(initial), totalRows, totalRows, 1, size);
  }

  /** A variable-role change updates the current page without dropping server totals. */
  remapCurrent(result: QueryResult): void {
    const session = this.session;
    if (!session) return;
    const lot = this.selection.getCurrentLotSnapshot();
    const size = this.selection.getLotSizeSnapshot();
    this.selection.setRemotePage(this.completePage(result), session.totalRows, session.baseTotalRows, lot, size);
  }

  cancel(): void {
    ++this.generation;
    this.cancel$.next();
    this.activeRequest?.unsubscribe();
    this.activeRequest = undefined;
    this.requestedScoped = null;
    this.stopWait();
  }

  retry(): void {
    const request = this.retryRequest;
    if (request) this.loadRequestedPage(request.lot, request.size, request.recount, request.scoped, request.kind);
  }

  canRetry(): boolean {
    return this.retryRequest !== null;
  }

  /** Retrieve every row for the selected resource from the current server-filtered query. */
  loadEntityStructure(variable: string, uri: string): Observable<QueryResult> {
    return defer(() => {
      const session = this.session;
      if (!session) return throwError(() => new Error('No hay una consulta activa para recuperar la estructura.'));
      const query = entityScopedQuery(this.requestedScoped ?? session.scoped, variable, uri);
      const cached = this.entityCache.get(query);
      if (cached) return of(cached);
      const size = Math.min(this.selection.getLotSizeSnapshot(), this.config.config()?.maxLimit ?? 300);
      return this.count(query).pipe(
        switchMap((total) => total > 0
          ? range(1, Math.ceil(total / size)).pipe(
            concatMap((lot) => this.page(query, lot, size)),
            toArray(),
            map((pages) => {
              const result = mergePages(pages);
              if (result.bindings.length !== total) throw new Error('La estructura cambió durante la recuperación; intentá de nuevo.');
              this.entityCache.set(query, result);
              return result;
            }),
          )
          : throwError(() => new Error('La entidad ya no aparece en la consulta filtrada.'))),
      );
    });
  }

  restoreView(filters: Filter[], requestedLot = 1, requestedSize = this.selection.getLotSizeSnapshot()): Observable<void> {
    return defer(() => {
      const session = this.session;
      if (!session) return of(undefined);
      const cfg = this.config.config();
      const size = cfg?.limits?.lotDefaultSize ?? Math.max(1, Math.min(requestedSize, cfg?.maxLimit ?? requestedSize));
      const scoped = scopedQuery(session.query, filters, session.fields);
      return (scoped === session.query ? of(session.baseTotalRows) : this.count(scoped)).pipe(
        switchMap(total => {
          const lot = Math.max(1, Math.min(requestedLot, Math.max(1, Math.ceil(total / size))));
          return this.page(scoped, lot, size).pipe(map(result => {
            session.scoped = scoped;
            session.totalRows = total;
            session.cache.clear();
            session.cache.set(`${lot}:${size}`, result);
            this.restoring = true;
            try { this.selection.restoreFilters(filters); } finally { this.restoring = false; }
            const mapped = this.mapping.setSourceResult(result, this.mapping.overrides())!;
            this.selection.setRemotePage(this.completePage(mapped), total, session.baseTotalRows, lot, size);
          }));
        }),
        takeUntil(this.cancel$),
      );
    });
  }

  private count(query: string): Observable<number> {
    return this.api.fetchSummary({ query, numericVars: [], temporalVars: [], categoricalVars: [], timeoutMs: ENDPOINT_TIMEOUT_MS }).pipe(
      switchMap((summary) => summary.totalRows === null
        ? throwError(() => new Error('No se pudo calcular el total de filas de la consulta.'))
        : of(summary.totalRows)),
    );
  }

  private page(query: string, lot: number, size: number): Observable<QueryResult> {
    return this.api.executeQuery({ sparql: pagedQuery(query, lot, size), limit: size, timeoutMs: ENDPOINT_TIMEOUT_MS });
  }

  private applyFilters(filters: Filter[]): void {
    const session = this.session;
    if (!session) return;
    let scoped: string;
    try {
      scoped = scopedQuery(session.query, filters, session.fields);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : String(error));
      return;
    }
    if (scoped === (this.requestedScoped ?? session.scoped)) return;
    this.loadRequestedPage(1, this.selection.getLotSizeSnapshot(), scoped !== session.query, scoped, 'filter');
  }

  private loadRequestedPage(lot: number, size: number, recount = false, scopedOverride?: string, kind?: LoadKind): void {
    const session = this.session;
    if (!session) return;
    size = Math.min(size, this.config.config()?.maxLimit ?? size);
    const action = kind ?? (size !== this.selection.getLotSizeSnapshot() ? 'size' : 'lot');
    const direction = action === 'lot'
      ? (lot < this.selection.getCurrentLotSnapshot() ? 'previous' : 'next')
      : null;
    this.activeRequest?.unsubscribe();
    const generation = ++this.generation;
    const scoped = scopedOverride ?? session.scoped;
    this.requestedScoped = scoped;
    this.retryRequest = { lot, size, recount, scoped, kind: action };
    this.startWait(action, direction);
    const total$ = recount ? this.count(scoped) : of(scoped === session.query ? session.baseTotalRows : session.totalRows);
    this.activeRequest = total$.pipe(
      switchMap((totalRows) => {
        const boundedLot = Math.min(lot, Math.max(1, Math.ceil(totalRows / size)));
        const key = `${boundedLot}:${size}`;
        const cached = scoped === session.scoped ? session.cache.get(key) : undefined;
        if (cached) return [{ result: cached, totalRows, lot: boundedLot }];
        if (totalRows === 0) {
          const empty = { ...this.selection.getQueryResultSnapshot()!, bindings: [], nodes: [], edges: [] };
          return [{ result: empty, totalRows, lot: 1 }];
        }
        return this.page(scoped, boundedLot, size).pipe(
          map((result) => ({ result, totalRows, lot: boundedLot })),
        );
      }),
      takeUntil(this.cancel$),
      finalize(() => this.finishWait(generation)),
    ).subscribe({
      next: ({ result, totalRows, lot: loadedLot }) => {
        if (generation !== this.generation) return;
        if (scoped !== session.scoped) {
          session.scoped = scoped;
          session.cache.clear();
          this.entityCache.clear();
        }
        session.totalRows = totalRows;
        session.cache.set(`${loadedLot}:${size}`, result);
        this.requestedScoped = null;
        this.retryRequest = null;
        const mapped = this.mapping.setSourceResult(result, this.mapping.overrides())!;
        this.selection.setRemotePage(this.completePage(mapped), totalRows, session.baseTotalRows, loadedLot, size);
      },
      error: (error) => {
        if (generation !== this.generation) return;
        this.error.set(error instanceof Error ? error.message : 'No se pudo cargar el lote.');
      },
    });
  }

  private startWait(kind: LoadKind, direction: LotDirection = null): void {
    this.stopWait();
    this.busy.set(true);
    this.loadingKind.set(kind);
    this.loadingDirection.set(direction);
    this.error.set(null);
    this.slowTimer = setTimeout(() => this.slow.set(true), LONG_QUERY_MS);
  }

  /** A full server page is not a truncated query result; its extent is stated by LotState. */
  private completePage(result: QueryResult): QueryResult {
    return result.meta.truncated ? { ...result, meta: { ...result.meta, truncated: false } } : result;
  }

  private finishWait(generation: number): void {
    if (generation === this.generation) this.stopWait();
  }

  private stopWait(): void {
    if (this.slowTimer) clearTimeout(this.slowTimer);
    this.slowTimer = undefined;
    this.slow.set(false);
    this.busy.set(false);
    this.loadingKind.set(null);
    this.loadingDirection.set(null);
  }
}
