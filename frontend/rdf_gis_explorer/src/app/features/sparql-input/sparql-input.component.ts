import { Component, OnInit, OnDestroy, inject, signal, ElementRef, ViewChild, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { MatBadgeModule } from '@angular/material/badge';
import { HttpErrorResponse } from '@angular/common/http';
import { EditorView, basicSetup } from 'codemirror';
import { EditorState } from '@codemirror/state';
import { keymap, placeholder as cmPlaceholder } from '@codemirror/view';
import { StreamLanguage } from '@codemirror/language';
import { sparql } from '@codemirror/legacy-modes/mode/sparql';
import { Parser } from 'sparqljs';

import { SelectionService } from '@core/services/selection.service';
import { ApiService } from '@core/services/api.service';
import { DashboardLayoutService } from '@core/services/dashboard-layout.service';
import { SparqlQueryStateService } from '@core/services/sparql-query-state.service';
import { LibraryService } from './library.service';
import { StoredQuery } from './seed-queries';
import { FieldMappingPanelComponent } from './field-mapping-panel.component';
import { SaveQueryDialogComponent } from './save-query-dialog.component';
import { ConfirmReplaceDialogComponent } from './confirm-replace-dialog.component';
import { applyMappingOverrides, VariableRole } from './mapping-overrides.util';
import type { QueryResult } from '@shared/models';

const DEFAULT_LIMIT = 500;
const LIMIT_OPTIONS = [500, 1000, 2000];

@Component({
  selector: 'app-sparql-input',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatMenuModule,
    MatIconModule,
    MatDialogModule,
    MatSnackBarModule,
    MatProgressSpinnerModule,
    MatDividerModule,
    MatBadgeModule,
    FieldMappingPanelComponent,
  ],
  templateUrl: './sparql-input.component.html',
  styleUrl: './sparql-input.component.scss',
})
export class SparqlInputComponent implements OnInit, OnDestroy {
  @ViewChild('editorContainer', { static: true })
  private readonly editorContainer!: ElementRef<HTMLElement>;

  private readonly selectionService = inject(SelectionService);
  private readonly apiService = inject(ApiService);
  private readonly libraryService = inject(LibraryService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  protected readonly dashboardLayout = inject(DashboardLayoutService);
  private readonly queryState = inject(SparqlQueryStateService);

  private editorView: EditorView | null = null;
  private fallbackContent = '';

  protected readonly executing = signal(false);
  protected readonly limit = signal<number>(DEFAULT_LIMIT);
  protected readonly limitOptions = LIMIT_OPTIONS;
  protected readonly hasContent = signal(false);
  protected readonly lastResult = signal<QueryResult | null>(null);
  protected readonly mappingOverrides = signal<Record<string, VariableRole>>({});
  protected readonly overridesCount = signal(0);

  protected readonly libraryQueries = signal<StoredQuery[]>([]);

  constructor() {
    effect(() => {
      const query = this.queryState.query();
      if (query && this.editorView && this.editorView.state.doc.toString() !== query) {
        this.setEditorContent(query);
      }
    });
    effect(() => {
      this.limit.set(this.queryState.limit());
    });
  }

  ngOnInit(): void {
    this.libraryService.queries$.subscribe((queries) => {
      this.libraryQueries.set(queries);
    });
    this.createEditor();
    this.setupKeyboardShortcut();

    // Sync initial state from service
    const serviceQuery = this.queryState.query();
    if (serviceQuery) {
      this.setEditorContent(serviceQuery);
    }
    this.limit.set(this.queryState.limit());
  }

  ngOnDestroy(): void {
    this.editorView?.destroy();
    this.editorView = null;
  }

  private createEditor(): void {
    const sparqlLang = StreamLanguage.define(sparql);

    const updateHasContent = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        this.hasContent.set(update.state.doc.toString().trim().length > 0);
      }
    });

    const ctrlEnterKeymap = keymap.of([
      {
        key: 'Ctrl-Enter',
        run: () => {
          this.execute();
          return true;
        },
      },
      {
        key: 'Mod-Enter',
        run: () => {
          this.execute();
          return true;
        },
      },
    ]);

    this.editorView = new EditorView({
      state: EditorState.create({
        doc: '',
        extensions: [
          basicSetup,
          sparqlLang,
          cmPlaceholder(
            '-- Escribí tu query SPARQL acá, o usá [▼ Biblioteca] para cargar una predefinida',
          ),
          updateHasContent,
          ctrlEnterKeymap,
          EditorView.lineWrapping,
        ],
      }),
      parent: this.editorContainer.nativeElement,
    });
  }

  private setupKeyboardShortcut(): void {
    document.addEventListener('keydown', this.shortcutHandler);
  }

  private readonly shortcutHandler = (event: KeyboardEvent): void => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      this.execute();
    }
  };

  protected get sparqlText(): string {
    if (this.editorView) {
      return this.editorView.state.doc.toString().trim();
    }
    return this.fallbackContent.trim();
  }

  protected setEditorContent(text: string): void {
    this.fallbackContent = text;
    this.hasContent.set(text.trim().length > 0);
    if (!this.editorView) return;
    this.editorView.dispatch({
      changes: {
        from: 0,
        to: this.editorView.state.doc.length,
        insert: text,
      },
    });
  }

  protected loadFromLibrary(query: StoredQuery): void {
    const current = this.sparqlText;
    if (current.length > 0) {
      const dialogRef = this.dialog.open(ConfirmReplaceDialogComponent, {
        width: '360px',
      });
      dialogRef.afterClosed().subscribe((confirmed) => {
        if (confirmed) {
          this.setEditorContent(query.sparql);
        }
      });
    } else {
      this.setEditorContent(query.sparql);
    }
  }

  protected deleteCustomQuery(query: StoredQuery, event: Event): void {
    event.stopPropagation();
    this.libraryService.delete(query.id);
  }

  protected restoreDefaults(): void {
    this.libraryService.restoreDefaults();
    this.snackBar.open('Biblioteca restaurada por defecto', 'OK', { duration: 3000 });
  }

  protected saveCurrentQuery(): void {
    const sparql = this.sparqlText;
    if (!sparql) return;

    const dialogRef = this.dialog.open(SaveQueryDialogComponent, {
      width: '400px',
    });
    dialogRef.afterClosed().subscribe((name: string | undefined) => {
      if (!name) return;
      this.libraryService.save(name, sparql);
      this.snackBar.open(`Query "${name}" guardada en la biblioteca`, 'OK', { duration: 3000 });
    });
  }

  protected execute(): void {
    const sparql = this.sparqlText;
    if (!sparql) return;

    try {
      const parser = new Parser();
      parser.parse(sparql);
    } catch {
      this.snackBar.open('Error de sintaxis SPARQL. Revisá la query antes de ejecutar.', 'Cerrar', {
        duration: 5000,
        panelClass: 'snackbar-error',
      });
      return;
    }

    const currentLimit = this.limit();
    this.queryState.query.set(sparql);
    this.queryState.limit.set(currentLimit);
    this.executing.set(true);

    this.apiService.executeQuery({ sparql, limit: currentLimit }).subscribe({
      next: (result) => {
        this.executing.set(false);
        this.dashboardLayout.collapseEditor();
        this.lastResult.set(result);

        this.mappingOverrides.set({});
        this.overridesCount.set(0);

        this.selectionService.setQueryResult(result);

        const count = result.bindings.length;
        const time = result.meta.durationMs;
        const msg =
          count === 0
            ? `Sin resultados (${time}ms)`
            : `${count} resultado${count !== 1 ? 's' : ''} en ${time}ms`;
        this.snackBar.open(msg, 'OK', { duration: 4000 });

        if (result.meta.truncated) {
          this.snackBar.open(`Resultado truncado a ${result.meta.limitApplied} filas`, 'OK', {
            duration: 6000,
          });
        }
      },
      error: (err: HttpErrorResponse) => {
        this.executing.set(false);
        this.handleHttpError(err);
      },
    });
  }

  private handleHttpError(err: HttpErrorResponse): void {
    const msg = this.mapErrorMessage(err);
    this.snackBar.open(msg, 'Cerrar', {
      duration: 8000,
      panelClass: 'snackbar-error',
    });
  }

  private mapErrorMessage(err: HttpErrorResponse): string {
    const body = err.error;

    if (err.status === 400) {
      return body?.message ? `SPARQL inválido: ${body.message}` : 'Error: query SPARQL inválida.';
    }

    if (err.status === 408) {
      return 'La query excedió el tiempo límite (10 segundos). Intentá reducir el alcance.';
    }

    if (err.status === 413) {
      return `Límite excedido. El máximo permitido es ${body?.maxAllowed ?? 2000}.`;
    }

    if (err.status === 502) {
      return 'El endpoint SPARQL no responde. Reintentá más tarde.';
    }

    if (err.status === 0) {
      return 'No se pudo conectar con el backend. Verificá que esté corriendo en http://localhost:3000.';
    }

    return `Error del servidor (${err.status}). ${body?.message ?? ''}`;
  }

  protected onLimitChange(newLimit: number): void {
    if (newLimit === 2000 && this.limit() !== 2000) {
      const confirmed = window.confirm(
        'Queries más grandes pueden ser lentas o devolver más datos de los que las vistas manejan bien.',
      );
      if (!confirmed) return;
    }
    this.limit.set(newLimit);
    this.queryState.limit.set(newLimit);
  }

  protected limitLabel(value: number): string {
    return `LIMIT ${value}`;
  }

  protected onApplyMapping(overrides: Record<string, VariableRole>): void {
    const result = this.lastResult();
    if (!result) return;

    const overrideEntries = Object.entries(overrides).filter(([_, role]) => role !== undefined);
    this.mappingOverrides.set(overrides);
    this.overridesCount.set(overrideEntries.length);

    const remapped = applyMappingOverrides(result, overrides);
    this.selectionService.setQueryResult(remapped);
    this.snackBar.open('Mapeo de variables aplicado', 'OK', { duration: 3000 });
  }

  protected onRestoreAuto(): void {
    const result = this.lastResult();
    if (!result) return;

    this.mappingOverrides.set({});
    this.overridesCount.set(0);
    this.selectionService.setQueryResult(result);
    this.snackBar.open('Mapeo restaurado a detección automática', 'OK', { duration: 3000 });
  }

  protected seedQueries(): StoredQuery[] {
    return this.libraryQueries().filter((q) => q.isSeed);
  }

  protected userQueries(): StoredQuery[] {
    return this.libraryQueries().filter((q) => !q.isSeed);
  }

  protected getCategoryIcon(category: string): string {
    switch (category) {
      case 'geo':
        return 'location_on';
      case 'temporal':
        return 'schedule';
      case 'exploration':
        return 'travel_explore';
      default:
        return 'star';
    }
  }
}
