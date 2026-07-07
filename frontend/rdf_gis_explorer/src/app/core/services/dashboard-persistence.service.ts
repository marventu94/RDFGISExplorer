import { Injectable, inject, signal } from '@angular/core';
import {
  Observable,
  of,
  switchMap,
  tap,
  catchError,
  throwError,
  map,
} from 'rxjs';
import { MatSnackBar } from '@angular/material/snack-bar';

import { DashboardApiClient, type GisDashboardPayload, type Dashboard } from './dashboard-api.client';
import { DashboardLayoutService, type ViewType } from './dashboard-layout.service';
import { SelectionService } from './selection.service';
import { SparqlQueryStateService } from './sparql-query-state.service';
import { DashboardViewStateService } from './dashboard-view-state.service';
import { ApiService } from './api.service';
import type { NormalizedNode } from '@shared/models';

const SLOT_COUNT_TO_PRESET: Record<number, 'single' | 'split-h' | 'triple' | 'triple-inv' | 'quad'> = {
  1: 'single',
  2: 'split-h',
  3: 'triple',
  4: 'quad',
};

@Injectable({ providedIn: 'root' })
export class DashboardPersistenceService {
  private readonly api = inject(DashboardApiClient);
  private readonly layout = inject(DashboardLayoutService);
  private readonly selection = inject(SelectionService);
  private readonly queryState = inject(SparqlQueryStateService);
  private readonly viewState = inject(DashboardViewStateService);
  private readonly apiService = inject(ApiService);
  private readonly snackBar = inject(MatSnackBar);

  readonly currentDashboardId = signal<string | null>(null);
  readonly currentDashboardName = signal<string | null>(null);
  readonly isHydrating = signal(false);
  readonly isDirty = signal(false);

  serialize(): Readonly<GisDashboardPayload> {
    const slotCount = this.layout.slotCount();
    const slots = this.layout.getSlotsSnapshot();

    const visibleSlots = slots.slice(0, slotCount).map((view, index) => ({
      id: `slot-${index}`,
      view: view as 'map' | 'timeline' | 'graph' | 'table',
    }));

    const selectedNode = this.selection.getSelectedNodeSnapshot();
    const focus = this.selection.getFocusSnapshot();

    const selectedIds: string[] = [];
    const pinnedId = selectedNode.node?.uri;

    if (focus.uris.size > 0) {
      selectedIds.push(...Array.from(focus.uris));
    } else if (pinnedId) {
      selectedIds.push(pinnedId);
    }

    const mapState = this.viewState.mapState();
    const timelineState = this.viewState.timelineState();
    const graphState = this.viewState.graphState();
    const tableState = this.viewState.tableState();

    const payload: GisDashboardPayload = {
      query: this.queryState.query(),
      backend: this.queryState.backend(),
      layout: {
        slotsCount: slotCount as 1 | 2 | 3 | 4,
        preset: this.layout.preset(),
        slots: visibleSlots,
      },
      filters: {
        ...(tableState ? { table: tableState } : {}),
        ...(timelineState ? { timeline: timelineState } : {}),
        ...(mapState ? { map: mapState } : {}),
        ...(graphState ? { graph: graphState } : {}),
      },
      ...(selectedIds.length > 0 || pinnedId
        ? {
            selection: {
              selectedIds,
              ...(pinnedId ? { pinnedId } : {}),
            },
          }
        : {}),
    };

    return Object.freeze(payload);
  }

  deserialize(payload: GisDashboardPayload): Observable<void> {
    this.isHydrating.set(true);

    this.queryState.query.set(payload.query);
    this.queryState.backend.set(payload.backend);

    const slotsCount = payload.layout.slotsCount;
    const preset = payload.layout.preset ?? SLOT_COUNT_TO_PRESET[slotsCount];
    if (preset) {
      const desiredOrder = payload.layout.slots.map((s) => s.view);
      this.layout.preset.set(preset);
      this.layout.slots.set(desiredOrder as ViewType[]);
    }

    if (payload.filters.table) {
      this.viewState.tableState.set(payload.filters.table);
    }
    if (payload.filters.timeline) {
      this.viewState.timelineState.set(payload.filters.timeline);
    }
    if (payload.filters.map) {
      this.viewState.mapState.set(payload.filters.map);
    }
    if (payload.filters.graph) {
      this.viewState.graphState.set(payload.filters.graph);
    }

    return this.apiService
      .executeQuery({
        sparql: payload.query,
        limit: this.queryState.limit(),
      })
      .pipe(
        tap((result) => {
          this.selection.setQueryResult(result);
        }),
        switchMap(() => {
          if (payload.selection) {
            const { selectedIds, pinnedId } = payload.selection;
            if (pinnedId) {
              const node = this.findNodeByUri(pinnedId);
              if (node) {
                this.selection.select(node, 'external');
              }
            }
            if (selectedIds.length > 0) {
              this.selection.setFocus(selectedIds, 'map');
            }
          }

          this.isHydrating.set(false);
          return of(undefined);
        }),
        catchError((err) => {
          this.isHydrating.set(false);
          this.snackBar.open(
            'Error al hidratar el dashboard. Query inválida o backend no disponible.',
            'Cerrar',
            {
              duration: 8000,
              panelClass: 'snackbar-error',
            },
          );
          return throwError(() => err);
        }),
      );
  }

  checkNameConflict(name: string, excludeId?: string | null): Observable<boolean> {
    return this.api.list().pipe(
      map((dashboards) =>
        dashboards.some(
          (d) =>
            d.kind === 'gis' &&
            d.name.toLowerCase() === name.toLowerCase() &&
            d.id !== (excludeId ?? ''),
        ),
      ),
    );
  }

  save(name: string, mode: 'overwrite' | 'copy'): Observable<Dashboard> {
    const payload = this.serialize();
    const currentId = this.currentDashboardId();

    if (mode === 'overwrite' && currentId) {
      return this.api.update(currentId, { name, payload }).pipe(
        tap((dashboard) => {
          this.currentDashboardName.set(dashboard.name);
          this.updateUrl(dashboard.id);
          this.snackBar.open(`Dashboard "${dashboard.name}" actualizado`, 'OK', {
            duration: 3000,
          });
        }),
      );
    }

    return this.api.create({ kind: 'gis', name, payload }).pipe(
      tap((dashboard) => {
        this.currentDashboardId.set(dashboard.id);
        this.currentDashboardName.set(dashboard.name);
        this.updateUrl(dashboard.id);
        this.snackBar.open(`Dashboard "${dashboard.name}" guardado`, 'OK', {
          duration: 3000,
        });
      }),
    );
  }

  private updateUrl(dashboardId: string): void {
    const url = new URL(window.location.href);
    url.searchParams.set('dashboardId', dashboardId);
    window.history.replaceState({}, '', url.toString());
  }

  load(id: string): Observable<void> {
    return this.api.get(id).pipe(
      switchMap((dashboard) => {
        if (dashboard.kind !== 'gis') {
          return throwError(() => new Error('Dashboard kind mismatch'));
        }
        this.currentDashboardId.set(dashboard.id);
        this.currentDashboardName.set(dashboard.name);
        return this.deserialize(dashboard.payload as GisDashboardPayload);
      }),
      catchError((err) => {
        this.snackBar.open('No se pudo cargar el dashboard.', 'Cerrar', {
          duration: 5000,
          panelClass: 'snackbar-error',
        });
        return throwError(() => err);
      }),
    );
  }

  clearCurrent(): void {
    this.currentDashboardId.set(null);
    this.currentDashboardName.set(null);
    this.isDirty.set(false);
    const url = new URL(window.location.href);
    url.searchParams.delete('dashboardId');
    window.history.replaceState({}, '', url.toString());
  }

  private findNodeByUri(uri: string): NormalizedNode | null {
    const result = this.selection.getQueryResultSnapshot();
    if (!result) return null;
    return result.nodes.find((n) => n.uri === uri) ?? null;
  }
}
