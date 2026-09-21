import { TranslatePipe } from '../../core/services/translate.pipe';
import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  signal,
  ElementRef,
  ViewChild,
  effect,
  HostListener,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { HttpErrorResponse } from '@angular/common/http';
import { EditorView, basicSetup } from 'codemirror';
import { EditorState } from '@codemirror/state';
import { keymap, placeholder as cmPlaceholder } from '@codemirror/view';
import { StreamLanguage } from '@codemirror/language';
import { sparql } from '@codemirror/legacy-modes/mode/sparql';
import { Parser } from 'sparqljs';

import { SelectionService } from '@core/services/selection.service';
import { ApiService } from '@core/services/api.service';
import { AppConfigService } from '@core/services/app-config.service';
import { DashboardLayoutService } from '@core/services/dashboard-layout.service';
import { SparqlQueryStateService } from '@core/services/sparql-query-state.service';
import { DashboardStateService } from '@core/services/dashboard-state.service';
import { I18nService } from '@core/services/i18n.service';
import type { Dashboard } from '@rdfgis/contracts';
import { dashboardHost, isDashboardHostAvailable } from '@rdfgis/platform-bridge';
import { FieldMappingPanelComponent } from './field-mapping-panel.component';
import type { VariableRole } from './mapping-overrides.util';
import { ConfirmReplaceDialogComponent } from './confirm-replace-dialog.component';
import { ErrorDialogComponent, type ErrorDialogData } from './error-dialog.component';
import { VariableMappingService } from '@core/services/variable-mapping.service';
import { buildQueryLimitNotice, type QueryLimitNotice } from '@shared/sparql/query-limit';

/** Espera antes de reparsear la query para el aviso de LIMIT. */
const LIMIT_CHECK_DEBOUNCE_MS = 300;

@Component({
  selector: 'app-sparql-input',
  standalone: true,
  imports: [
    TranslatePipe,
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatMenuModule,
    MatIconModule,
    MatDialogModule,
    MatSnackBarModule,
    MatProgressSpinnerModule,
    MatDividerModule,
    FieldMappingPanelComponent,
  ],
  templateUrl: './sparql-input.component.html',
  styleUrl: './sparql-input.component.scss',
})
export class SparqlInputComponent implements OnInit, OnDestroy {
  protected readonly dashboardsAvailable = isDashboardHostAvailable();
  @ViewChild('editorContainer', { static: true })
  private readonly editorContainer!: ElementRef<HTMLElement>;

  private readonly selectionService = inject(SelectionService);
  private readonly apiService = inject(ApiService);
  private readonly appConfig = inject(AppConfigService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  protected readonly dashboardLayout = inject(DashboardLayoutService);
  private readonly queryState = inject(SparqlQueryStateService);
  private readonly dashboardState = inject(DashboardStateService);
  private readonly variableMapping = inject(VariableMappingService);
  private readonly i18n = inject(I18nService);

  @ViewChild(FieldMappingPanelComponent)
  private mappingPanel?: FieldMappingPanelComponent;

  private editorView: EditorView | null = null;
  private fallbackContent = '';
  private limitCheckTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly executing = signal(false);
  protected readonly hasContent = signal(false);
  protected readonly lastResult = this.variableMapping.sourceResult;
  protected readonly mappingOverrides = this.variableMapping.overrides;
  protected readonly overridesCount = () => Object.keys(this.mappingOverrides()).length;

  /** Tope de filas del backend; hasta que llega la config no se avisa nada. */
  private readonly maxLimit = signal<number | null>(null);
  protected readonly limitNotice = signal<QueryLimitNotice | null>(null);

  protected readonly gisDashboards = signal<Dashboard[]>([]);
  protected readonly loadingDashboards = signal(false);

  constructor() {
    effect(() => {
      const query = this.queryState.query();
      if (query && this.editorView && this.editorView.state.doc.toString() !== query) {
        this.setEditorContent(query);
      }
    });
  }

  ngOnInit(): void {
    this.createEditor();
    this.setupKeyboardShortcut();
    this.loadMaxLimit();

    const serviceQuery = this.queryState.query();
    if (serviceQuery) {
      this.setEditorContent(serviceQuery);
    } else {
      this.seedDefaultPrefixes();
    }
  }

  /**
   * Precarga en el editor los PREFIX configurados en el backend
   * (GET /api/config → defaultPrefixes). Solo si el editor sigue vacío
   * cuando llega la config, para no pisar un handoff ni un tablero cargado.
   */
  private seedDefaultPrefixes(): void {
    this.appConfig.load().subscribe({
      next: (cfg) => {
        const block = this.buildPrefixBlock(cfg.defaultPrefixes);
        if (block && this.sparqlText.length === 0) {
          this.setEditorContent(block);
        }
      },
      error: () => {
        // sin config no hay prefixes: el editor queda vacío
      },
    });
  }

  private buildPrefixBlock(prefixes: Record<string, string> | undefined): string {
    const entries = Object.entries(prefixes ?? {});
    if (entries.length === 0) return '';
    return entries.map(([prefix, uri]) => `PREFIX ${prefix}: <${uri}>`).join('\n') + '\n\n';
  }

  ngOnDestroy(): void {
    if (this.limitCheckTimer) clearTimeout(this.limitCheckTimer);
    this.editorView?.destroy();
    this.editorView = null;
  }

  private createEditor(): void {
    const sparqlLang = StreamLanguage.define(sparql);

    const updateHasContent = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        this.hasContent.set(update.state.doc.toString().trim().length > 0);
        this.scheduleLimitCheck();
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
            '-- Escribí tu query SPARQL acá, o usá [▼ Tableros] para cargar un tablero guardado',
          ),
          updateHasContent,
          ctrlEnterKeymap,
          EditorView.lineWrapping,
        ],
      }),
      parent: this.editorContainer.nativeElement,
    });
  }

  /**
   * `AppConfig.maxLimit` para el aviso de LIMIT propio. La config tiene shareReplay,
   * así que comparte la request con el resto de la app.
   */
  private loadMaxLimit(): void {
    this.appConfig.load().subscribe({
      next: (cfg) => {
        this.maxLimit.set(cfg.maxLimit);
        this.refreshLimitNotice();
      },
      error: () => {
        // sin config no se sabe el tope: no se avisa nada
      },
    });
  }

  /**
   * El chequeo parsea con sparqljs, así que se debouncea: mientras se tipea la
   * mayoría de los estados intermedios no parsean y el aviso parpadearía.
   */
  private scheduleLimitCheck(): void {
    if (this.limitCheckTimer) clearTimeout(this.limitCheckTimer);
    this.limitCheckTimer = setTimeout(() => {
      this.limitCheckTimer = null;
      this.refreshLimitNotice();
    }, LIMIT_CHECK_DEBOUNCE_MS);
  }

  private refreshLimitNotice(): void {
    this.limitNotice.set(buildQueryLimitNotice(this.sparqlText, this.maxLimit()));
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

  public setQuery(query: string): void {
    this.setEditorContent(query);
  }

  public setBackend(backend: string): void {
    this.queryState.backend.set(backend);
  }

  protected get sparqlText(): string {
    if (this.editorView) {
      return this.editorView.state.doc.toString().trim();
    }
    return this.fallbackContent.trim();
  }

  protected setEditorContent(text: string): void {
    this.fallbackContent = text;
    this.hasContent.set(text.trim().length > 0);
    if (this.editorView) {
      this.editorView.dispatch({
        changes: {
          from: 0,
          to: this.editorView.state.doc.length,
          insert: text,
        },
      });
    }
    // Sin debounce: cargar un tablero o un handoff trae la query entera de una,
    // y esperar 300ms acá haría aparecer el aviso después de pintar el editor.
    this.refreshLimitNotice();
  }

  protected loadDashboards(): void {
    this.loadingDashboards.set(true);
    dashboardHost()
      .list('gis')
      .then(
        (dashboards) => {
          this.gisDashboards.set(dashboards);
          this.loadingDashboards.set(false);
        },
        () => {
          this.gisDashboards.set([]);
          this.loadingDashboards.set(false);
        },
      );
  }

  protected loadDashboard(dashboard: Dashboard): void {
    const current = this.sparqlText;
    const doLoad = () => {
      this.dashboardState.beginLoad();
      dashboardHost()
        .load(dashboard.id)
        .catch(() => this.dashboardState.failLoad());
    };
    if (current.length > 0) {
      setTimeout(() => {
        const dialogRef = this.dialog.open(ConfirmReplaceDialogComponent, {
          width: '360px',
        });
        dialogRef.afterClosed().subscribe((confirmed) => {
          if (confirmed) {
            doLoad();
          }
        });
      });
    } else {
      doLoad();
    }
  }

  protected newDashboard(): void {
    const ok = window.confirm(
      '¿Crear tablero nuevo?\n\nSe perderán todos los cambios que no hayas guardado.',
    );
    if (ok) {
      this.clearForNewDashboard();
    }
  }

  private clearForNewDashboard(): void {
    this.setEditorContent(this.buildPrefixBlock(this.appConfig.config()?.defaultPrefixes));
    this.queryState.query.set('');
    this.variableMapping.setSourceResult(null);
    this.dashboardState.clearCurrent();
  }

  public execute(options?: { configureLayout?: boolean }): void {
    const sparql = this.sparqlText;
    if (!sparql) {
      this.showError({
        title: this.i18n.text('No hay query para ejecutar'),
        message: this.i18n.text('El editor está vacío. Escribí una query o cargá un tablero.'),
      });
      return;
    }

    try {
      const parser = new Parser();
      parser.parse(sparql);
    } catch (e) {
      this.showError({
        title: this.i18n.text('SPARQL inválido'),
        message: this.i18n.text('La query no se pudo parsear, así que no se envió al backend.'),
        detail: e instanceof Error ? e.message : String(e),
      });
      return;
    }

    this.queryState.query.set(sparql);
    this.executing.set(true);
    // Este endpoint puede tardar minutos (un FILTER sobre cientos de
    // miles de instancias). Sin un cartel persistente, la pantalla queda igual
    // que antes de apretar y parece que el botón no hizo nada.
    this.snackBar.open(this.i18n.text('Ejecutando la query… puede tardar'), undefined, {});

    this.apiService.executeQuery({ sparql }).subscribe({
      next: (result) => {
        this.executing.set(false);
        this.snackBar.dismiss();
        this.dashboardLayout.collapseEditor();
        this.variableMapping.setSourceResult(result);

        this.selectionService.setQueryResult(result);

        if (options?.configureLayout) {
          this.dashboardLayout.applyLayoutForResult(result);
        }

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
        this.snackBar.dismiss();
        this.handleHttpError(err);
      },
    });
  }

  private handleHttpError(err: HttpErrorResponse): void {
    this.showError({
      title: this.i18n.text('La query no se pudo ejecutar'),
      message: this.mapErrorMessage(err),
      detail: this.errorDetail(err),
    });
  }

  /** Cuerpo crudo del error del backend, para poder pegarlo/depurarlo. */
  private errorDetail(err: HttpErrorResponse): string | undefined {
    const body = err.error as { error?: string; message?: string } | null;
    if (!body) return undefined;
    const parts = [body.error, body.message].filter(Boolean);
    return parts.length > 0 ? parts.join(': ') : undefined;
  }

  private showError(data: ErrorDialogData): void {
    this.snackBar.dismiss();
    this.dialog.open(ErrorDialogComponent, { data, width: '480px' });
  }

  private mapErrorMessage(err: HttpErrorResponse): string {
    const body = err.error;

    if (err.status === 400) {
      return body?.message
        ? `${this.i18n.text('SPARQL inválido')}: ${body.message}`
        : this.i18n.text('Error: query SPARQL inválida.');
    }

    if (err.status === 408) {
      const secs = body?.timeoutMs ? Math.round(body.timeoutMs / 1000) : 30;
      return `La query excedió el tiempo límite (${secs} segundos). Intentá reducir el alcance.`;
    }

    if (err.status === 413) {
      return `Límite excedido. El máximo permitido es ${body?.maxAllowed ?? 2000}.`;
    }

    if (err.status === 502) {
      return 'El endpoint SPARQL no responde. Reintentá más tarde.';
    }

    if (err.status === 0) {
      return this.i18n.text(
        'No se pudo conectar con el backend. Verificá que esté corriendo en http://localhost:3000.',
      );
    }

    return `Error del servidor (${err.status}). ${body?.message ?? ''}`;
  }

  protected onApplyMapping(overrides: Record<string, VariableRole>): void {
    const remapped = this.variableMapping.apply(overrides);
    if (!remapped) return;
    this.selectionService.setQueryResult(remapped);
    this.snackBar.open(this.i18n.text('Mapeo de variables aplicado'), 'OK', { duration: 3000 });
  }

  protected onRestoreAuto(): void {
    const result = this.variableMapping.restore();
    if (!result) return;
    this.selectionService.setQueryResult(result);
    this.snackBar.open(this.i18n.text('Mapeo restaurado a detección automática'), 'OK', {
      duration: 3000,
    });
  }

  @HostListener('window:open-variable-mapping')
  protected openVariableMapping(): void {
    this.dashboardLayout.editorCollapsed.set(false);
    queueMicrotask(() => this.mappingPanel?.open());
  }
}
