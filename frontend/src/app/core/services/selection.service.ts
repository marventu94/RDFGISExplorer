import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, combineLatest, map } from 'rxjs';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import type {
  NormalizedNode,
  QueryResult,
  Selection,
  Filter,
} from '@shared/models';

@Injectable({ providedIn: 'root' })
export class SelectionService {
  private readonly _selectedNode$ = new BehaviorSubject<Selection>({
    node: null,
    source: 'external',
  });
  private readonly _activeFilters$ = new BehaviorSubject<Filter[]>([]);
  private readonly _queryResult$ = new BehaviorSubject<QueryResult | null>(null);

  readonly selectedNode$: Observable<Selection> = this._selectedNode$.asObservable();
  readonly activeFilters$: Observable<Filter[]> = this._activeFilters$.asObservable();
  readonly queryResult$: Observable<QueryResult | null> = this._queryResult$.asObservable();

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
      return node.temporalEvents.some(
        (ev) => ev.isoDate >= filter.from && ev.isoDate <= filter.to,
      );
    }
    return true;
  }
}
