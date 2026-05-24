import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, combineLatest, map } from 'rxjs';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import type { NormalizedNode, QueryResult, Selection, Filter } from '@shared/models';

export type FocusSource = 'map' | 'graph' | 'timeline' | null;

export interface FocusState {
  uris: ReadonlySet<string>;
  source: FocusSource;
}

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

  readonly selectedNode$: Observable<Selection> = this._selectedNode$.asObservable();
  readonly activeFilters$: Observable<Filter[]> = this._activeFilters$.asObservable();
  readonly queryResult$: Observable<QueryResult | null> = this._queryResult$.asObservable();
  readonly focus$: Observable<FocusState> = this._focus$.asObservable();
  readonly activeView$: Observable<FocusSource> = this._activeView$.asObservable();
  readonly coordinatedViewEnabled$: Observable<boolean> =
    this._coordinatedViewEnabled$.asObservable();

  readonly filteredQueryResult$: Observable<QueryResult | null> = combineLatest([
    this._queryResult$,
    this._activeFilters$,
  ]).pipe(map(([result, filters]) => this.applyFilters(result, filters)));

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

  private applyFilters(result: QueryResult | null, filters: Filter[]): QueryResult | null {
    if (!result) return null;
    if (filters.length === 0) return result;

    const filtered = result.nodes.filter((node) =>
      filters.every((f) => this.nodePassesFilter(node, f)),
    );
    const filteredUris = new Set(filtered.map((n) => n.uri));
    const edges = result.edges.filter(
      (e) => filteredUris.has(e.source) && filteredUris.has(e.target),
    );

    return { ...result, nodes: filtered, edges };
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
