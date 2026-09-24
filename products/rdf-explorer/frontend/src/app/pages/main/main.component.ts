import { TranslatePipe } from '../../core/translate.pipe';
import { Component, inject, OnInit, DestroyRef, computed, effect, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { lastValueFrom } from 'rxjs';
import { SearchPanelComponent } from '../../shell/search-panel/search-panel.component';
import { CanvasPanelComponent } from '../../shell/canvas-panel/canvas-panel.component';
import { ToolsPanelComponent } from '../../shell/tools-panel/tools-panel.component';
import { PropertyGraphService } from '../../graph/property-graph.service';
import { WorkspaceStateService } from '../../core/workspace-state.service';
import { Dialog } from '@angular/cdk/dialog';
import { SaveWorkspaceDialogComponent } from '../../shell/save-workspace-dialog/save-workspace-dialog.component';
import type { SaveWorkspaceDialogResult } from '../../shell/save-workspace-dialog/save-workspace-dialog.model';
import { MessageDialogComponent } from '../../shell/message-dialog/message-dialog.component';
import type { MessageDialogData } from '../../shell/message-dialog/message-dialog.component';
import { AppConfigService } from '../../core/services/app-config.service';
import { dashboardHost, isDashboardHostAvailable, registerQueryExportProvider, requestQueryExport } from '@rdfgis/platform-bridge';
import { I18nService } from '../../core/i18n.service';
import { closePanelFlow } from '../../core/panel-close';
import { LanguageSelectorComponent } from '../../core/language-selector.component';
import { ThemeToggleComponent } from '../../core/theme-toggle.component';
import { queryExportLabel } from '../../core/query-export-label';

@Component({
  selector: 'app-main',
  imports: [TranslatePipe, SearchPanelComponent, CanvasPanelComponent, ToolsPanelComponent, LanguageSelectorComponent, ThemeToggleComponent],
  templateUrl: './main.component.html',
  styleUrl: './main.component.scss',
})
export class MainComponent implements OnInit {
  protected readonly dashboardsAvailable = isDashboardHostAvailable();
  readonly graph = inject(PropertyGraphService);
  readonly workspace = inject(WorkspaceStateService);
  readonly route = inject(ActivatedRoute);
  readonly router = inject(Router);
  readonly dialog = inject(Dialog);
  readonly destroyRef = inject(DestroyRef);
  readonly appConfig = inject(AppConfigService);
  readonly i18n = inject(I18nService);
  readonly tabMenu = signal<{ panelId: string; x: number; y: number } | null>(null);

  readonly canHandoff = computed(() => {
    void this.graph.revision();
    return this.graph.getQueriesForGraph().queries.some(query =>
      Boolean(query.toSparqlFullProjection({ limit: this.appConfig.resultLimit() })?.trim()),
    );
  });

  // Signal: el timeout que oculta el snackbar corre fuera de cualquier
  // notificación de Angular (app zoneless), así que debe disparar CD él mismo.
  readonly snackbarMessage = signal<string | null>(null);
  private snackbarTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    const unregisterQueryExport = registerQueryExportProvider({
      listCandidates: () => {
        void this.graph.revision();
        const panel = this.workspace.activePanel();
        const workspaceId = this.route.snapshot.queryParamMap.get('workspaceId') ?? undefined;
        const backend = this.appConfig.config()?.backend || 'generic';
        return this.graph.getQueriesForGraph().queries.flatMap((query, index) => {
          const sparql = query.toSparqlFullProjection({ limit: this.appConfig.resultLimit() });
          if (!sparql?.trim()) return [];
          return [{
            id: `${panel?.id ?? 'panel'}:${index}`,
            label: queryExportLabel(panel?.name ?? 'Panel', index, query),
            query: sparql,
            backend,
            source: { workspaceId, panelId: panel?.id },
          }];
        });
      },
    });
    this.destroyRef.onDestroy(unregisterQueryExport);

    effect(() => {
      void this.graph.revision();
      void this.graph.viewport();
      this.workspace.snapshotActivePanel(this.graph);
    });
  }

  ngOnInit(): void {
    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
        const workspaceId = params.get('workspaceId');
        if (workspaceId) {
          this.loadWorkspace(workspaceId);
        }
      });
  }

  addPanel(): void {
    this.workspace.snapshotActivePanel(this.graph);
    this.workspace.addPanel();
    this.workspace.restoreActivePanel(this.graph);
  }

  switchPanel(id: string): void {
    if (id === this.workspace.activePanelId()) return;
    this.workspace.snapshotActivePanel(this.graph);
    this.workspace.switchPanel(id);
    this.workspace.restoreActivePanel(this.graph);
  }

  handoffToGis(): void {
    requestQueryExport();
  }

  async removePanel(id: string, event?: Event): Promise<void> {
    event?.stopPropagation();
    if (id === this.workspace.activePanelId()) {
      this.workspace.snapshotActivePanel(this.graph);
    }
    const panel = this.workspace.panels().find(candidate => candidate.id === id);
    if (!panel) return;

    await closePanelFlow(panel.dirty, async () => {
      const dialogRef = this.dialog.open<string>(MessageDialogComponent, {
        width: '440px',
        hasBackdrop: true,
        backdropClass: 'cdk-overlay-dark-backdrop',
        data: {
          kind: 'info',
          title: this.i18n.text('¿Cerrar el panel con cambios sin guardar?'),
          message: this.i18n.text('Los cambios de este panel se perderán. Esta acción no se puede deshacer.'),
          actions: [
            { label: this.i18n.text('Cancelar'), value: 'cancel' },
            { label: this.i18n.text('Descartar y cerrar'), value: 'discard', primary: true },
          ],
        } satisfies MessageDialogData,
      });
      return await lastValueFrom(dialogRef.closed) === 'discard';
    }, () => {
      this.workspace.removePanel(id);
      this.workspace.restoreActivePanel(this.graph);
    });
  }

  openTabMenu(panelId: string, event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.tabMenu.set({ panelId, x: event.clientX, y: event.clientY });
  }

  openTabMenuFromKeyboard(panelId: string, event: KeyboardEvent): void {
    if (!(event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10'))) return;
    event.preventDefault();
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    this.tabMenu.set({ panelId, x: rect.left, y: rect.bottom });
  }

  closeTabMenu(): void {
    this.tabMenu.set(null);
  }

  closePanelFromMenu(event: Event): void {
    const menu = this.tabMenu();
    this.closeTabMenu();
    if (menu) void this.removePanel(menu.panelId, event);
  }

  async openSaveDialog(): Promise<void> {
    this.workspace.snapshotActivePanel(this.graph);

    const currentPanel = this.workspace.activePanel();
    const currentId = this.route.snapshot.queryParamMap.get('workspaceId') ?? undefined;

    const allWorkspaces = await dashboardHost().list('explorer');
    const existingNames = allWorkspaces
      .filter(w => w.id !== currentId)
      .map(w => w.name);

    const dialogRef = this.dialog.open<SaveWorkspaceDialogResult>(SaveWorkspaceDialogComponent, {
      width: '420px',
      hasBackdrop: true,
      backdropClass: 'cdk-overlay-dark-backdrop',
      data: {
        currentName: currentPanel?.name,
        currentId,
        existingNames,
      },
    });

    const result = await lastValueFrom(dialogRef.closed);
    if (!result) return;

    try {
      const typedResult = result as SaveWorkspaceDialogResult;
      this.workspace.renameActivePanel(typedResult.name);
      const dashboard = await dashboardHost().save({
        kind: 'explorer',
        name: typedResult.name,
        mode: typedResult.overwriteId ? 'overwrite' : 'copy',
        currentId: typedResult.overwriteId,
      });
      this.workspace.markAllPanelsClean();
      this.workspace.setAllPanelsSource(dashboard.id);
      this.showSnackbar(`Workspace guardado: ${dashboard.name}`);
      if (!typedResult.overwriteId) {
        await this.router.navigate([], {
          relativeTo: this.route,
          queryParams: { workspaceId: dashboard.id },
          queryParamsHandling: 'merge',
        });
      }
    } catch (err) {
      this.showSnackbar(`Error al guardar: ${(err as Error).message}`);
    }
  }

  private async loadWorkspace(id: string): Promise<void> {
    try {
      if (this.workspace.hasWorkspaceOpen(id)) {
        this.workspace.restoreActivePanel(this.graph);
        return;
      }
      await dashboardHost().load(id, 'tabs');
      this.workspace.restoreActivePanel(this.graph);
      this.showSnackbar('Workspace cargado');
    } catch (err) {
      this.showSnackbar(`Error al cargar: ${(err as Error).message}`);
    }
  }

  private showSnackbar(message: string): void {
    if (this.snackbarTimer) {
      clearTimeout(this.snackbarTimer);
    }
    this.snackbarMessage.set(message);
    this.snackbarTimer = setTimeout(() => {
      this.snackbarMessage.set(null);
    }, 3000);
  }

}
