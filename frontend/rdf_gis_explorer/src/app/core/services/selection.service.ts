import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, combineLatest, map } from 'rxjs';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import type { NormalizedNode, QueryResult, Selection, Filter } from '@shared/models';
import {
  DEFAULT_LOT_SIZE,
  LOT_SIZE_OPTIONS,
  computeLotCount,
  restrictResultToUris,
  sliceLot,
} from '@shared/stats/lots';

export type FocusSource = 'map' | 'graph' | 'timeline' | null;

export interface FocusState {
  uris: ReadonlySet<string>;
  source: FocusSource;
}

/** Estado del paginado en lotes del resultado filtrado (ver shared/stats/lots). */
export interface LotState {
  lotSize: number;
  /** Lote actual, 1-based, ya clampeado al rango válido. */
  currentLot: number;
  lotCount: number;
  /** Filas del resultado filtrado (antes de cortar en lotes). */
  totalRows: number;
  /** Nodos del lote visible, incluidos los pineados por selección. */
  visibleNodes: number;
}

export { DEFAULT_LOT_SIZE, LOT_SIZE_OPTIONS };

@Injectable({ providedIn: 'root' })
export class SelectionService {
  private readonly _selectedNode$ = new BehaviorSubject<Selection>({
    node: null,
    source: 'external',
  });
  private readonly _activeFilters$ = new BehaviorSubject<Filter[]>([]);
  private readonly _queryResult$ = new BehaviorSubject<QueryResult | null>(null);
  private readonly _focus$ = new BehaviorSubject<FocusState>({
    uris: new Set<string>(),
    source: null,
  });
  private readonly _activeView$ = new BehaviorSubject<FocusSource>(null);
  private activeViewTimer?: ReturnType<typeof setTimeout>;
  private readonly ACTIVE_VIEW_TTL_MS = 2000;
  private readonly _coordinatedViewEnabled$ = new BehaviorSubject<boolean>(true);
  private readonly _lotSize$ = new BehaviorSubject<number>(DEFAULT_LOT_SIZE);
  private readonly _currentLot$ = new BehaviorSubject<number>(1);

  readonly selectedNode$: Observable<Selection> = this._selectedNode$.asObservable();
  readonly activeFilters$: Observable<Filter[]> = this._activeFilters$.asObservable();
  readonly queryResult$: Observable<QueryResult | null> = this._queryResult$.asObservable();
  readonly focus$: Observable<FocusState> = this._focus$.asObservable();
  readonly activeView$: Observable<FocusSource> = this._activeView$.asObservable();
  readonly coordinatedViewEnabled$: Observable<boolean> =
    this._coordinatedViewEnabled$.asObservable();
  readonly lotSize$: Observable<number> = this._lotSize$.asObservable();
  readonly currentLot$: Observable<number> = this._currentLot$.asObservable();

  readonly filteredQueryResult$: Observable<QueryResult | null> = combineLatest([
    this._queryResult$,
    this._activeFilters$,
  ]).pipe(map(([result, filters]) => this.applyFilters(result, filters)));

  /**
   * Resultado que consumen las 4 vistas: `filteredQueryResult$` restringido al
   * lote actual, más el nodo seleccionado inyectado (pinning) aunque pertenezca
   * a otro lote. Con un solo lote equivale a `filteredQueryResult$`.
   */
  readonly visibleQueryResult$: Observable<QueryResult | null> = combineLatest([
    this.filteredQueryResult$,
    this._lotSize$,
    this._currentLot$,
    this._selectedNode$,
  ]).pipe(
    map(([filtered, lotSize, currentLot, selection]) => {
      if (!filtered) return null;
      const pinned = selection.node ? [selection.node.uri] : [];
      return sliceLot(filtered, lotSize, currentLot, pinned).result;
    }),
  );

  readonly lotState$: Observable<LotState> = combineLatest([
    this.filteredQueryResult$,
    this._lotSize$,
    this._currentLot$,
    this._selectedNode$,
  ]).pipe(
    map(([filtered, lotSize, currentLot, selection]) => {
      if (!filtered) {
        return { lotSize, currentLot: 1, lotCount: 1, totalRows: 0, visibleNodes: 0 };
      }
      const pinned = selection.node ? [selection.node.uri] : [];
      const slice = sliceLot(filtered, lotSize, currentLot, pinned);
      return {
        lotSize,
        currentLot: slice.currentLot,
        lotCount: slice.lotCount,
        totalRows: filtered.bindings.length,
        visibleNodes: slice.result.nodes.length,
      };
    }),
  );

  constructor() {
    // Si los filtros o el tamaño de lote reducen lotCount por debajo del lote
    // actual, el estado canónico se clampea (el lote se conserva si sigue válido).
    combineLatest([this.filteredQueryResult$, this._lotSize$]).subscribe(([result, lotSize]) => {
      const lotCount = computeLotCount(result, lotSize);
      if (this._currentLot$.getValue() > lotCount) {
        this._currentLot$.next(lotCount);
      }
    });
  }

  select(node: NormalizedNode | null, source: Selection['source'] = 'external'): void {
    this._selectedNode$.next({ node, source });
  }

  clearSelection(): void {
    this._selectedNode$.next({ node: null, source: 'external' });
  }

  addFilter(filter: Filter): void {
    const current = this._activeFilters$.getValue();
    const index = current.findIndex((f) => f.id === filter.id);
    if (index !== -1) {
      const updated = [...current];
      updated[index] = filter;
      this._activeFilters$.next(updated);
    } else {
      this._activeFilters$.next([...current, filter]);
    }
  }

  removeFilter(id: string): void {
    const current = this._activeFilters$.getValue();
    this._activeFilters$.next(current.filter((f) => f.id !== id));
  }

  clearFilters(): void {
    this._activeFilters$.next([]);
  }

  setQueryResult(result: QueryResult | null): void {
    this._queryResult$.next(result);
    this._selectedNode$.next({ node: null, source: 'external' });
    this._activeFilters$.next([]);
    this._focus$.next({ uris: new Set<string>(), source: null });
    // Query nueva: se vuelve siempre al primer lote.
    this._currentLot$.next(1);
  }

  setLotSize(size: number): void {
    // LOT_SIZE_OPTIONS es la oferta de la UI; el servicio acepta cualquier
    // entero positivo para no acoplar el estado a la presentación.
    if (!Number.isInteger(size) || size < 1) return;
    this._lotSize$.next(size);
  }

  /** Lote 1-based; se clampea al rango válido del resultado actual. */
  setCurrentLot(lot: number): void {
    const lotCount = computeLotCount(
      this.applyFilters(this._queryResult$.getValue(), this._activeFilters$.getValue()),
      this._lotSize$.getValue(),
    );
    this._currentLot$.next(Math.min(Math.max(1, Math.floor(lot)), lotCount));
  }

  nextLot(): void {
    this.setCurrentLot(this._currentLot$.getValue() + 1);
  }

  previousLot(): void {
    this.setCurrentLot(this._currentLot$.getValue() - 1);
  }

  getLotSizeSnapshot(): number {
    return this._lotSize$.getValue();
  }

  getCurrentLotSnapshot(): number {
    return this._currentLot$.getValue();
  }

  setFocus(uris: Iterable<string>, source: Exclude<FocusSource, null>): void {
    if (!this._coordinatedViewEnabled$.getValue()) return;
    this._focus$.next({ uris: new Set(uris), source });
  }

  clearFocus(): void {
    this._focus$.next({ uris: new Set<string>(), source: null });
  }

  markActiveView(source: Exclude<FocusSource, null>): void {
    if (!this._coordinatedViewEnabled$.getValue()) return;
    if (this._activeView$.getValue() !== source) {
      this._activeView$.next(source);
    }
    if (this.activeViewTimer) clearTimeout(this.activeViewTimer);
    this.activeViewTimer = setTimeout(() => {
      this._activeView$.next(null);
      this.activeViewTimer = undefined;
    }, this.ACTIVE_VIEW_TTL_MS);
  }

  getActiveView(): FocusSource {
    return this._activeView$.getValue();
  }

  toggleCoordinatedView(): void {
    const next = !this._coordinatedViewEnabled$.getValue();
    this._coordinatedViewEnabled$.next(next);
    if (!next) {
      if (this.activeViewTimer) clearTimeout(this.activeViewTimer);
      this._activeView$.next(null);
      this._focus$.next({ uris: new Set<string>(), source: null });
    }
  }

  isCoordinatedViewEnabled(): boolean {
    return this._coordinatedViewEnabled$.getValue();
  }

  getSelectedNodeSnapshot(): Selection {
    return this._selectedNode$.getValue();
  }

  getActiveFiltersSnapshot(): Filter[] {
    return this._activeFilters$.getValue();
  }

  getQueryResultSnapshot(): QueryResult | null {
    return this._queryResult$.getValue();
  }

  getFocusSnapshot(): FocusState {
    return this._focus$.getValue();
  }

  private applyFilters(result: QueryResult | null, filters: Filter[]): QueryResult | null {
    if (!result) return null;
    if (filters.length === 0) return result;

    const passingNodes = result.nodes.filter((node) =>
      filters.every((f) => this.nodePassesFilter(node, f)),
    );
    const passingUris = new Set(passingNodes.map((n) => n.uri));

    const neighborUris = new Set<string>();
    for (const edge of result.edges) {
      if (passingUris.has(edge.source) && !passingUris.has(edge.target)) {
        neighborUris.add(edge.target);
      }
      if (passingUris.has(edge.target) && !passingUris.has(edge.source)) {
        neighborUris.add(edge.source);
      }
    }

    const displayUris = new Set([...passingUris, ...neighborUris]);
    return restrictResultToUris(result, displayUris);
  }

  private nodePassesFilter(node: NormalizedNode, filter: Filter): boolean {
    if (filter.kind === 'geo') {
      if (!node.coordinate) return false;
      return booleanPointInPolygon([node.coordinate.lng, node.coordinate.lat], filter.polygon);
    }
    if (filter.kind === 'temporal') {
      if (!node.temporalEvents?.length) return false;
      return node.temporalEvents.some((ev) => ev.isoDate >= filter.from && ev.isoDate <= filter.to);
    }
    return true;
  }
}
