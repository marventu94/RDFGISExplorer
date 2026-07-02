import { Component, inject, OnInit, DestroyRef, computed } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { firstValueFrom, lastValueFrom } from 'rxjs';
import { SearchPanelComponent } from '../../shell/search-panel/search-panel.component';
import { CanvasPanelComponent } from '../../shell/canvas-panel/canvas-panel.component';
import { ToolsPanelComponent } from '../../shell/tools-panel/tools-panel.component';
import { PropertyGraphService } from '../../graph/property-graph.service';
import { TutorialService } from '../../tutorial/tutorial.service';
import { GettingStartedDialogService } from '../../modal/getting-started-dialog.service';
import { WorkspacePersistenceService } from '../../core/workspace-persistence.service';
import { Dialog } from '@angular/cdk/dialog';
import { SaveWorkspaceDialogComponent } from '../../shell/save-workspace-dialog/save-workspace-dialog.component';
import type { SaveWorkspaceDialogResult } from '../../shell/save-workspace-dialog/save-workspace-dialog.model';
import { QueryHandoffService } from '../../core/query-handoff.service';
import { SettingsService } from '../../core/settings.service';
import { ToolService } from '../../tool/tool.service';

@Component({
  selector: 'app-main',
  imports: [SearchPanelComponent, CanvasPanelComponent, ToolsPanelComponent],
  templateUrl: './main.component.html',
  styleUrl: './main.component.scss',
})
export class MainComponent implements OnInit {
  readonly graph = inject(PropertyGraphService);
  readonly tutorialService = inject(TutorialService);
  readonly dialogService = inject(GettingStartedDialogService);
  readonly workspace = inject(WorkspacePersistenceService);
  readonly route = inject(ActivatedRoute);
  readonly router = inject(Router);
  readonly dialog = inject(Dialog);
  readonly destroyRef = inject(DestroyRef);
  readonly queryHandoff = inject(QueryHandoffService);
  readonly settings = inject(SettingsService);
  readonly toolService = inject(ToolService);

  readonly generatedSparql = computed(() => {
    void this.graph.revision();
    const { queries } = this.graph.getQueriesForGraph();
    return queries.map(q => q.toSparql()).filter(Boolean).join('\n');
  });

  readonly canHandoff = computed(() => this.generatedSparql().trim().length > 0);

  snackbarMessage: string | null = null;
  private snackbarTimer: ReturnType<typeof setTimeout> | null = null;

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

  openGettingStarted(): void {
    this.dialogService.open();
  }

  startTutorial(): void {
    this.tutorialService.start();
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

  removePanel(id: string, event: Event): void {
    event.stopPropagation();
    this.workspace.removePanel(id);
    this.workspace.restoreActivePanel(this.graph);
  }

  async openSaveDialog(): Promise<void> {
    this.workspace.snapshotActivePanel(this.graph);

    const currentPanel = this.workspace.activePanel();
    const currentId = this.route.snapshot.queryParamMap.get('workspaceId') ?? undefined;

    const allWorkspaces = await firstValueFrom(this.workspace.listWorkspaces());
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
      const dashboard = await this.workspace.saveWorkspace(typedResult.name, typedResult.overwriteId);
      this.workspace.markActivePanelClean();
      this.workspace.setActivePanelSource(dashboard.id);
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
      const loaded = await this.workspace.loadWorkspaceAsTabs(id);
      this.workspace.restoreActivePanel(this.graph);
      if (loaded) this.showSnackbar('Workspace cargado');
    } catch (err) {
      this.showSnackbar(`Error al cargar: ${(err as Error).message}`);
    }
  }

  private showSnackbar(message: string): void {
    if (this.snackbarTimer) {
      clearTimeout(this.snackbarTimer);
    }
    this.snackbarMessage = message;
    this.snackbarTimer = setTimeout(() => {
      this.snackbarMessage = null;
    }, 3000);
  }

  handoffToGis(): void {
    void this.graph.revision();
    const { queries } = this.graph.getQueriesForGraph();
    const validQueries = queries.filter(q => q.toSparql()?.trim());

    if (validQueries.length === 0) return;

    if (validQueries.length > 1) {
      this.toolService.active.set('sparql');
      return;
    }

    const sparql = validQueries[0].toSparql()!;

    const backend = this.settings.app().endpointLabel || 'generic';

    this.queryHandoff.publish({
      query: sparql,
      backend,
      source: {
        workspaceId: this.route.snapshot.queryParamMap.get('workspaceId') ?? undefined,
        panelId: this.workspace.activePanel()?.id,
      },
    });

    this.router.navigate(['/gis'], { queryParams: { handoff: '1' } });
  }
}
