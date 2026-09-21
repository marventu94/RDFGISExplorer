import { Injectable, inject, signal } from '@angular/core';
import {
  Observable,
  of,
  switchMap,
  tap,
  catchError,
  throwError,
  firstValueFrom,
} from 'rxjs';
import { MatSnackBar } from '@angular/material/snack-bar';

import type { VariableRole } from '../../features/sparql-input/mapping-overrides.util';
import { DashboardLayoutService, type ViewType } from './dashboard-layout.service';
import { SelectionService } from './selection.service';
import { SparqlQueryStateService } from './sparql-query-state.service';
import { DashboardViewStateService } from './dashboard-view-state.service';
import { ApiService } from './api.service';
import { DashboardLoadProgressService } from './dashboard-load-progress.service';
import { VariableMappingService } from './variable-mapping.service';
import type { LoadStageId } from '@shared/progress/load-stages';
import type { NormalizedNode, QueryResult } from '@shared/models';
import { registerDashboardStateAdapter } from '@rdfgis/platform-bridge';

export interface GisDashboardPayload {
  query: string;
  backend: string;
  layout: {
    slotsCount: 1 | 2 | 3 | 4;
    preset?: 'single' | 'split-h' | 'split-v' | 'triple' | 'triple-inv' | 'triple-v' | 'triple-v-inv' | 'quad';
    slots: Array<{ id: string; view: 'map' | 'timeline' | 'graph' | 'table' }>;
  };
  filters: {
    table?: { quickFilter?: string; pageSize?: number };
    timeline?: { rangeStart?: string; rangeEnd?: string };
    map?: { center: [number, number]; zoom: number; activeLayers?: string[] };
    graph?: {
      layout: string;
      pan?: { x: number; y: number };
      zoom?: number;
      manualPositions?: Record<string, { x: number; y: number }>;
      detailLevel?: 'summary' | 'exploration' | 'detail';
      expandedSuperEdgeIds?: string[];
      expandedMotifIds?: string[];
    };
  };
  selection?: { selectedIds: string[]; pinnedId?: string };
  variableMapping?: Record<string, VariableRole>;
}

const SLOT_COUNT_TO_PRESET: Record<number, 'single' | 'split-h' | 'split-v' | 'triple' | 'triple-inv' | 'triple-v' | 'triple-v-inv' | 'quad'> = {
  1: 'single',
  2: 'split-h',
  3: 'triple',
  4: 'quad',
};

/** Etapas del pipeline de hidratación, en el orden en que se muestran. */
const HYDRATION_STAGES: readonly LoadStageId[] = [
  'fetch-dashboard',
  'execute-query',
  'process-results',
  'render-views',
];

/** Lo que el usuario quiere saber de la respuesta: volumen y tiempo del endpoint. */
function describeResult(result: QueryResult): string {
  const rows = result.bindings.length;
  const parts = [
    `${rows} fila${rows !== 1 ? 's' : ''}`,
    `endpoint ${result.meta.durationMs} ms`,
  ];
  if (result.meta.truncated) parts.push(`truncado a ${result.meta.limitApplied}`);
  return parts.join(' · ');
}

@Injectable({ providedIn: 'root' })
export class DashboardStateService {
  private readonly layout = inject(DashboardLayoutService);
  private readonly selection = inject(SelectionService);
  private readonly queryState = inject(SparqlQueryStateService);
  private readonly viewState = inject(DashboardViewStateService);
  private readonly apiService = inject(ApiService);
  private readonly progress = inject(DashboardLoadProgressService);
  private readonly variableMapping = inject(VariableMappingService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly unregisterAdapter = registerDashboardStateAdapter({
    kind: 'gis',
    exportPayload: () => this.serialize(),
    importPayload: async (payload, context) => {
      this.currentDashboardId.set(context.id);
      this.currentDashboardName.set(context.name);
      this.progress.setSubtitle(context.name);
      await firstValueFrom(this.deserialize(payload as GisDashboardPayload));
    },
    reset: () => this.clearCurrent(),
  });

  readonly currentDashboardId = signal<string | null>(null);
  readonly currentDashboardName = signal<string | null>(null);
  /**
   * Hidratación de DATOS en curso. El cartel de carga no se guía por este flag
   * sino por `DashboardLoadProgressService`: sigue visible un poco más, hasta
   * que las vistas terminan de pintar.
   */
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
      ...(Object.keys(this.variableMapping.overrides()).length > 0
        ? { variableMapping: this.variableMapping.overrides() }
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

    this.progress.complete('fetch-dashboard', this.layoutDetail());
    this.progress.start('execute-query', 'esperando la respuesta del endpoint SPARQL');

    return this.apiService
      .executeQuery({
        sparql: payload.query,
      })
      .pipe(
        tap((result) => {
          this.progress.complete('execute-query', describeResult(result));
          this.progress.start(
            'process-results',
            `${result.nodes.length} nodos · ${result.edges.length} aristas`,
          );
          // Las vistas del layout tienen que pintar antes de dar por cargado el
          // tablero; el fan-out de SelectionService es SINCRÓNICO, así que hay
          // que declararlas antes de publicar el resultado.
          this.progress.expectViews(this.layout.visibleSlots());
          const mappedResult = this.variableMapping.setSourceResult(
            result,
            payload.variableMapping ?? {},
          );
          this.selection.setQueryResult(mappedResult);
          // Si ninguna vista reportó (ningún slot montado), la etapa se cierra acá.
          this.progress.complete('process-results');
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
          this.progress.failActive('query inválida o backend no disponible');
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

  setCurrentDashboard(id: string, name: string): void {
    this.currentDashboardId.set(id);
    this.currentDashboardName.set(name);
    const url = new URL(window.location.href);
    url.searchParams.set('dashboardId', id);
    window.history.replaceState({}, '', url.toString());
  }

  beginLoad(): void {
    this.progress.begin('Cargando tablero', HYDRATION_STAGES);
    this.progress.start('fetch-dashboard', 'leyendo la definición guardada');
  }

  failLoad(): void {
    this.isHydrating.set(false);
    this.progress.failActive('no se pudo cargar el tablero');
  }

  clearCurrent(): void {
    this.currentDashboardId.set(null);
    this.currentDashboardName.set(null);
    this.isDirty.set(false);
    const url = new URL(window.location.href);
    url.searchParams.delete('dashboardId');
    window.history.replaceState({}, '', url.toString());
  }

  /** Lo que se restauró antes de salir a buscar los datos. */
  private layoutDetail(): string {
    const count = this.layout.visibleSlots().length;
    return `layout y filtros restaurados · ${count} vista${count !== 1 ? 's' : ''}`;
  }

  private findNodeByUri(uri: string): NormalizedNode | null {
    const result = this.selection.getQueryResultSnapshot();
    if (!result) return null;
    return result.nodes.find((n) => n.uri === uri) ?? null;
  }
}
