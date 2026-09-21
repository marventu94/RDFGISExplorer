import { Injectable, effect, inject } from '@angular/core';
import {
  BehaviorSubject,
  Observable,
  combineLatest,
  distinctUntilChanged,
  map,
  shareReplay,
} from 'rxjs';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import type { NormalizedNode, QueryResult, Selection, Filter } from '@shared/models';
import {
  DEFAULT_LOT_SIZE,
  LOT_SIZE_OPTIONS,
  computeLotCount,
  restrictResultToUris,
  sliceLot,
} from '@shared/stats/lots';
import {
  buildRowIndex,
  emptyRowIndex,
  relatedUris,
  type RowIndex,
} from '@shared/selection/row-index';
import { LimitsService } from './limits.service';

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

/** Lo visible y su estado de lote, calculados juntos para no duplicar trabajo. */
interface SliceView {
  result: QueryResult | null;
  state: LotState;
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
  private readonly limitsService = inject(LimitsService);
  private readonly _lotSize$ = new BehaviorSubject<number>(
    this.limitsService.limits().lotDefaultSize,
  );
  /** Opciones del selector de tamaño de lote (config-driven vía LimitsService). */
  private readonly _lotSizeOptions$ = new BehaviorSubject<readonly number[]>(
    this.limitsService.limits().lotSizeOptions,
  );
  private readonly _currentLot$ = new BehaviorSubject<number>(1);
  /** Índice fila ↔ entidades del resultado actual (ver shared/selection). */
  private rowIndex: RowIndex = emptyRowIndex();
  /** Memo del lote sin pin; la clave es la identidad de sus tres entradas. */
  private baseMemo: {
    filtered: QueryResult | null;
    lotSize: number;
    currentLot: number;
    view: SliceView;
    uris: ReadonlySet<string>;
  } | null = null;
  /** Memo del lote con un nodo de otro lote inyectado (caso poco frecuente). */
  private pinMemo: { base: SliceView; pinned: string; view: SliceView } | null = null;

  readonly selectedNode$: Observable<Selection> = this._selectedNode$.asObservable();
  readonly activeFilters$: Observable<Filter[]> = this._activeFilters$.asObservable();
  readonly queryResult$: Observable<QueryResult | null> = this._queryResult$.asObservable();
  readonly focus$: Observable<FocusState> = this._focus$.asObservable();
  readonly activeView$: Observable<FocusSource> = this._activeView$.asObservable();
  readonly coordinatedViewEnabled$: Observable<boolean> =
    this._coordinatedViewEnabled$.asObservable();
  readonly lotSize$: Observable<number> = this._lotSize$.asObservable();
  readonly lotSizeOptions$: Observable<readonly number[]> =
    this._lotSizeOptions$.asObservable();
  readonly currentLot$: Observable<number> = this._currentLot$.asObservable();

  /**
   * `shareReplay` porque lo consumen las 4 vistas: sin esto, al ser frío, el
   * filtrado se recalculaba una vez por vista en cada emisión.
   */
  readonly filteredQueryResult$: Observable<QueryResult | null> = combineLatest([
    this._queryResult$,
    this._activeFilters$,
  ]).pipe(
    map(([result, filters]) => this.applyFilters(result, filters)),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  /** Solo la URI pineada: cambiar de nodo no importa si el lote no cambia. */
  private readonly pinnedUri$: Observable<string | null> = this._selectedNode$.pipe(
    map((selection) => selection.node?.uri ?? null),
    distinctUntilChanged(),
  );

  /**
   * Lote visible + su estado, calculados UNA vez y compartidos.
   *
   * Clave del asunto: seleccionar NO tiene por qué repintar las vistas. El
   * pinning solo cambia lo visible cuando el nodo seleccionado está fuera del
   * lote; en el caso normal `computeSliceView` devuelve el MISMO objeto y
   * `distinctUntilChanged` corta la emisión. Antes cada click recalculaba el
   * lote (una vez por vista) y forzaba a las 4 a redibujarse: con lotes
   * grandes y la vista coordinada encendida, eso trababa la app.
   */
  private readonly sliceView$: Observable<SliceView> = combineLatest([
    this.filteredQueryResult$,
    this._lotSize$,
    this._currentLot$,
    this.pinnedUri$,
  ]).pipe(
    map(([filtered, lotSize, currentLot, pinned]) =>
      this.computeSliceView(filtered, lotSize, currentLot, pinned),
    ),
    distinctUntilChanged(),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  /**
   * Resultado que consumen las 4 vistas: `filteredQueryResult$` restringido al
   * lote actual, más el nodo seleccionado inyectado (pinning) aunque pertenezca
   * a otro lote. Con un solo lote equivale a `filteredQueryResult$`.
   */
  readonly visibleQueryResult$: Observable<QueryResult | null> = this.sliceView$.pipe(
    map((view) => view.result),
    distinctUntilChanged(),
  );

  readonly lotState$: Observable<LotState> = this.sliceView$.pipe(
    map((view) => view.state),
    distinctUntilChanged(),
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

    // Cuando llega la config (/api/config → LimitsService) se actualizan las
    // opciones de lote; si el tamaño actual quedó fuera de la nueva oferta se
    // clampea al default configurado. Solo aplica cuando los límites CAMBIAN:
    // el servicio sigue aceptando cualquier entero positivo vía setLotSize.
    effect(() => {
      const limits = this.limitsService.limits();
      if (limits === this.appliedLimits) return;
      this.appliedLimits = limits;
      this._lotSizeOptions$.next(limits.lotSizeOptions);
      if (!limits.lotSizeOptions.includes(this._lotSize$.getValue())) {
        this._lotSize$.next(limits.lotDefaultSize);
      }
    });
  }

  /** Última config de límites aplicada a los lotes (identidad por referencia). */
  private appliedLimits = this.limitsService.limits();

  /**
   * Publica la selección junto con las entidades que comparten fila con ella:
   * cada vista dibuja una entidad distinta de la misma fila, así que sin ese
   * grupo una selección solo se veía en la vista que dibujaba ese nodo exacto.
   */
  select(node: NormalizedNode | null, source: Selection['source'] = 'external'): void {
    this._selectedNode$.next({
      node,
      source,
      relatedUris: relatedUris(this.rowIndex, node?.uri),
    });
  }

  clearSelection(): void {
    this._selectedNode$.next({ node: null, source: 'external' });
  }

  /** Entidades que comparten fila con `uri` (la propia incluida). */
  relatedUrisFor(uri: string | null | undefined): ReadonlySet<string> {
    return relatedUris(this.rowIndex, uri);
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
    // El índice fila ↔ entidades se arma una vez por query: lo consultan todas
    // las selecciones posteriores.
    this.rowIndex = buildRowIndex(result);
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

  /**
   * Lote visible sin pin, memoizado por (resultado filtrado, tamaño, lote).
   * Guarda además las URIs que ya están dentro, para decidir en O(1) si el
   * nodo pineado agrega algo o no.
   */
  private baseSlice(
    filtered: QueryResult | null,
    lotSize: number,
    currentLot: number,
  ): { view: SliceView; uris: ReadonlySet<string> } {
    const memo = this.baseMemo;
    if (
      memo &&
      memo.filtered === filtered &&
      memo.lotSize === lotSize &&
      memo.currentLot === currentLot
    ) {
      return memo;
    }

    const view = this.buildSliceView(filtered, lotSize, currentLot, []);
    const uris = new Set((view.result?.nodes ?? []).map((n) => n.uri));
    this.baseMemo = { filtered, lotSize, currentLot, view, uris };
    return this.baseMemo;
  }

  private computeSliceView(
    filtered: QueryResult | null,
    lotSize: number,
    currentLot: number,
    pinned: string | null,
  ): SliceView {
    const base = this.baseSlice(filtered, lotSize, currentLot);
    // El caso normal: el nodo seleccionado ya está en el lote, así que lo
    // visible es exactamente lo mismo de antes (mismo objeto, sin repintar).
    if (pinned === null || base.uris.has(pinned)) return base.view;

    const memo = this.pinMemo;
    if (memo && memo.base === base.view && memo.pinned === pinned) return memo.view;

    // Selección de otro lote: ahí sí hay que inyectar el nodo y redibujar.
    const view = this.buildSliceView(filtered, lotSize, currentLot, [pinned]);
    this.pinMemo = { base: base.view, pinned, view };
    return view;
  }

  private buildSliceView(
    filtered: QueryResult | null,
    lotSize: number,
    currentLot: number,
    pinnedUris: readonly string[],
  ): SliceView {
    if (!filtered) {
      return {
        result: null,
        state: { lotSize, currentLot: 1, lotCount: 1, totalRows: 0, visibleNodes: 0 },
      };
    }

    const slice = sliceLot(filtered, lotSize, currentLot, pinnedUris);
    return {
      result: slice.result,
      state: {
        lotSize,
        currentLot: slice.currentLot,
        lotCount: slice.lotCount,
        totalRows: filtered.bindings.length,
        visibleNodes: slice.result.nodes.length,
      },
    };
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
