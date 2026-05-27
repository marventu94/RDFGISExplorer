import { Component, inject, OnInit, DestroyRef, computed } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { lastValueFrom } from 'rxjs';
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

@Component({
  selector: 'app-main',
  imports: [SearchPanelComponent, CanvasPanelComponent, ToolsPanelComponent, SaveWorkspaceDialogComponent],
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

  readonly generatedSparql = computed(() => {
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
    const dialogRef = this.dialog.open<SaveWorkspaceDialogResult>(SaveWorkspaceDialogComponent, {
      width: '420px',
      hasBackdrop: true,
      backdropClass: 'cdk-overlay-dark-backdrop',
      data: {
        currentName: currentPanel?.name,
        currentId: this.route.snapshot.queryParamMap.get('workspaceId') ?? undefined,
      },
    });

    const result = await lastValueFrom(dialogRef.closed);
    if (!result) return;

    try {
      const typedResult = result as SaveWorkspaceDialogResult;
      const dashboard = await this.workspace.saveWorkspace(typedResult.name, typedResult.overwriteId);
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
      await this.workspace.loadWorkspace(id);
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
    this.snackbarMessage = message;
    this.snackbarTimer = setTimeout(() => {
      this.snackbarMessage = null;
    }, 3000);
  }

  handoffToGis(): void {
    const sparql = this.generatedSparql();
    if (!sparql.trim()) return;

    const backend: 'wikidata' | 'millenniumdb' =
      this.settings.app().endpoint.url.includes('wikidata')
        ? 'wikidata'
        : 'millenniumdb';

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
