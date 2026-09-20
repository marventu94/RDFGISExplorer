import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { SparqlInputComponent } from './sparql-input.component';
import { ErrorDialogComponent } from './error-dialog.component';
import { ApiService } from '@core/services/api.service';
import { SelectionService } from '@core/services/selection.service';
import { DashboardApiClient } from '@core/services/dashboard-api.client';
import { DashboardPersistenceService } from '@core/services/dashboard-persistence.service';
import { AppConfigService } from '@core/services/app-config.service';
import type { QueryResult } from '@shared/models';

function makeQueryResult(overrides: Partial<QueryResult> = {}): QueryResult {
  return {
    variables: ['city', 'cityLabel', 'coord'],
    bindings: [
      {
        city: { type: 'uri' as const, value: 'http://www.wikidata.org/entity/Q1486' },
        cityLabel: { type: 'literal' as const, value: 'Buenos Aires' },
        coord: { type: 'coordinate' as const, value: { lat: -34.6, lng: -58.38 }, raw: 'Point(-58.38 -34.6)' },
      },
    ],
    nodes: [
      {
        uri: 'http://www.wikidata.org/entity/Q1486',
        label: 'Buenos Aires',
        attributes: {},
        coordinate: { lat: -34.6, lng: -58.38 },
      },
    ],
    edges: [],
    meta: {
      durationMs: 250,
      truncated: false,
      limitApplied: 500,
      backend: 'wikidata' as const,
    },
    ...overrides,
  };
}

describe('SparqlInputComponent', () => {
  let component: SparqlInputComponent;
  let fixture: ComponentFixture<SparqlInputComponent>;
  let apiServiceMock: { executeQuery: ReturnType<typeof vi.fn> };
  let selectionServiceMock: { setQueryResult: ReturnType<typeof vi.fn> };
  let dashboardApiMock: { list: ReturnType<typeof vi.fn> };
  let persistenceMock: {
    load: ReturnType<typeof vi.fn>;
    currentDashboardId: ReturnType<typeof vi.fn>;
    clearCurrent: ReturnType<typeof vi.fn>;
  };
  let appConfigMock: { load: ReturnType<typeof vi.fn>; config: ReturnType<typeof vi.fn> };
  let realSnackBar: MatSnackBar;
  let realDialog: MatDialog;
  let originalConfirm: typeof window.confirm;

  beforeEach(async () => {
    localStorage.clear();

    apiServiceMock = {
      executeQuery: vi.fn().mockReturnValue(of(makeQueryResult())),
    };
    selectionServiceMock = {
      setQueryResult: vi.fn(),
    };
    dashboardApiMock = {
      list: vi.fn().mockReturnValue(of([])),
    };
    persistenceMock = {
      load: vi.fn().mockReturnValue(of(undefined)),
      currentDashboardId: vi.fn().mockReturnValue(null),
      clearCurrent: vi.fn(),
    };
    // Sin prefixes: el editor arranca vacío igual que antes de mockear la config.
    appConfigMock = {
      load: vi.fn().mockReturnValue(of({ maxLimit: 1000, defaultPrefixes: {} })),
      config: vi.fn().mockReturnValue({ maxLimit: 1000, defaultPrefixes: {} }),
    };

    await TestBed.configureTestingModule({
      imports: [SparqlInputComponent, NoopAnimationsModule],
      providers: [
        { provide: ApiService, useValue: apiServiceMock },
        { provide: SelectionService, useValue: selectionServiceMock },
        { provide: DashboardApiClient, useValue: dashboardApiMock },
        { provide: DashboardPersistenceService, useValue: persistenceMock },
        { provide: AppConfigService, useValue: appConfigMock },
      ],
    }).compileComponents();

    realSnackBar = TestBed.inject(MatSnackBar);
    realDialog = TestBed.inject(MatDialog);

    vi.spyOn(MatSnackBar.prototype, 'open').mockImplementation(() => ({ onAction: () => ({ unsubscribe: () => {} }) } as any));
    vi.spyOn(MatDialog.prototype, 'open').mockReturnValue({ afterClosed: () => of(null) } as any);

    originalConfirm = window.confirm;
    window.confirm = vi.fn().mockReturnValue(true);

    fixture = TestBed.createComponent(SparqlInputComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    window.confirm = originalConfirm;
  });

  function asAny(): any {
    return component as any;
  }

  describe('aviso de LIMIT propio en la consulta', () => {
    function noticeEl(): HTMLElement | null {
      return (fixture.nativeElement as HTMLElement).querySelector('.limit-notice');
    }

    it('no muestra nada con una consulta sin LIMIT', () => {
      asAny().setEditorContent('SELECT * WHERE { ?s ?p ?o }');
      fixture.detectChanges();
      expect(noticeEl()).toBeNull();
    });

    it('avisa cuando la consulta trae un LIMIT bajo el tope del backend', () => {
      asAny().setEditorContent('SELECT * WHERE { ?s ?p ?o } LIMIT 500');
      fixture.detectChanges();

      const el = noticeEl();
      expect(el).not.toBeNull();
      expect(el!.textContent).toContain('LIMIT 500');
      expect(el!.getAttribute('title')).toContain('no se marca');
    });

    it('avisa que el backend recorta igual cuando el LIMIT supera el tope', () => {
      asAny().setEditorContent('SELECT * WHERE { ?s ?p ?o } LIMIT 9000');
      fixture.detectChanges();

      expect(noticeEl()!.textContent).toContain('recorta a 1000 filas');
    });

    it('saca el aviso al borrar el LIMIT de la consulta', () => {
      asAny().setEditorContent('SELECT * WHERE { ?s ?p ?o } LIMIT 500');
      fixture.detectChanges();
      expect(noticeEl()).not.toBeNull();

      asAny().setEditorContent('SELECT * WHERE { ?s ?p ?o }');
      fixture.detectChanges();
      expect(noticeEl()).toBeNull();
    });
  });

  it('should create the component', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize with hasContent as false', () => {
    expect(asAny().hasContent()).toBe(false);
  });

  it('should render the tableros button', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const buttons = compiled.querySelectorAll('button');
    const tablerosBtn = Array.from(buttons).find(
      (b) => b.textContent?.includes('Tableros'),
    );
    expect(tablerosBtn).toBeTruthy();
  });

  it('should render the execute button', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const buttons = compiled.querySelectorAll('button');
    const execBtn = Array.from(buttons).find(
      (b) => b.textContent?.includes('Ejecutar'),
    );
    expect(execBtn).toBeTruthy();
  });

  it('should render the mapping panel', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const panel = compiled.querySelector('app-field-mapping-panel');
    expect(panel).toBeTruthy();
  });

  it('should have the editor container element', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const editorArea = compiled.querySelector('.editor-area');
    expect(editorArea).toBeTruthy();
  });

  describe('loadDashboard', () => {
    const dashboard = { id: 'dash-1', kind: 'gis' as const, name: 'Test Dashboard', payload: {}, createdAt: '', updatedAt: '' };

    it('should prompt for confirmation when editor has content', () => {
      vi.useFakeTimers();
      asAny().setEditorContent('SELECT ?x WHERE { ?x ?p ?o }');
      asAny().loadDashboard(dashboard);
      vi.advanceTimersByTime(0);
      expect(realDialog.open).toHaveBeenCalled();
      vi.useRealTimers();
    });

    it('should load dashboard when editor is empty', () => {
      asAny().loadDashboard(dashboard);
      expect(persistenceMock.load).toHaveBeenCalledWith('dash-1');
    });
  });

  describe('newDashboard', () => {
    it('should show confirmation popup', () => {
      asAny().newDashboard();
      expect(window.confirm).toHaveBeenCalled();
    });

    it('should clear state when confirmed', () => {
      window.confirm = vi.fn().mockReturnValue(true);
      asAny().newDashboard();
      expect(persistenceMock.clearCurrent).toHaveBeenCalled();
    });

    it('should not clear state when cancelled', () => {
      window.confirm = vi.fn().mockReturnValue(false);
      asAny().newDashboard();
      expect(persistenceMock.clearCurrent).not.toHaveBeenCalled();
    });
  });

  describe('execute', () => {
    it('should not execute when editor is empty', () => {
      asAny().execute();
      expect(apiServiceMock.executeQuery).not.toHaveBeenCalled();
      expect(realDialog.open).toHaveBeenCalledWith(
        ErrorDialogComponent,
        expect.objectContaining({
          data: expect.objectContaining({ title: 'No hay query para ejecutar' }),
        }),
      );
    });

    it('should call apiService.executeQuery when editor has content', () => {
      asAny().setEditorContent('SELECT ?x WHERE { ?x ?p ?o }');
      asAny().execute();
      expect(apiServiceMock.executeQuery).toHaveBeenCalled();
      const callArgs = apiServiceMock.executeQuery.mock.calls[0][0];
      expect(callArgs.sparql).toContain('SELECT');
      expect(callArgs.limit).toBeUndefined();
    });

    it('should set executing to false after request completes', () => {
      asAny().setEditorContent('SELECT ?x WHERE { ?x ?p ?o }');
      asAny().execute();
      expect(asAny().executing()).toBe(false);
    });

    it('should call selectionService.setQueryResult on success', () => {
      const result = makeQueryResult();
      apiServiceMock.executeQuery.mockReturnValue(of(result));
      asAny().setEditorContent('SELECT ?x WHERE { ?x ?p ?o } LIMIT 10');
      asAny().execute();
      expect(selectionServiceMock.setQueryResult).toHaveBeenCalledWith(result);
    });

    it('should show snackbar with result count on success', () => {
      apiServiceMock.executeQuery.mockReturnValue(of(makeQueryResult()));
      asAny().setEditorContent('SELECT ?x WHERE { ?x ?p ?o } LIMIT 10');
      asAny().execute();
      expect(realSnackBar.open).toHaveBeenCalledWith(
        expect.stringMatching(/1 resultado en 250ms/),
        'OK',
        expect.any(Object),
      );
    });

    it('should show error popup for invalid SPARQL syntax', () => {
      asAny().setEditorContent('INVALID SPARQL');
      asAny().execute();
      expect(apiServiceMock.executeQuery).not.toHaveBeenCalled();
      expect(realDialog.open).toHaveBeenCalledWith(
        ErrorDialogComponent,
        expect.objectContaining({
          data: expect.objectContaining({ title: 'SPARQL inválido' }),
        }),
      );
    });

    it('should handle HTTP 400 errors from backend', () => {
      const error = new HttpErrorResponse({
        status: 400,
        error: { error: 'INVALID_SPARQL', message: 'Parse error at line 1' },
      });
      apiServiceMock.executeQuery.mockReturnValue(throwError(() => error));
      asAny().setEditorContent('SELECT ?x WHERE { ?x ?p ?o }');
      asAny().execute();
      expect(realDialog.open).toHaveBeenCalledWith(
        ErrorDialogComponent,
        expect.objectContaining({
          data: expect.objectContaining({ message: expect.stringMatching(/SPARQL inválido/) }),
        }),
      );
    });

    it('should handle HTTP 408 errors', () => {
      const error = new HttpErrorResponse({ status: 408, error: { error: 'TIMEOUT' } });
      apiServiceMock.executeQuery.mockReturnValue(throwError(() => error));
      asAny().setEditorContent('SELECT ?x WHERE { ?x ?p ?o }');
      asAny().execute();
      expect(realDialog.open).toHaveBeenCalledWith(
        ErrorDialogComponent,
        expect.objectContaining({
          data: expect.objectContaining({ message: expect.stringMatching(/tiempo límite/) }),
        }),
      );
    });

    it('should handle HTTP 502 errors', () => {
      const error = new HttpErrorResponse({ status: 502, error: { error: 'UPSTREAM_ERROR' } });
      apiServiceMock.executeQuery.mockReturnValue(throwError(() => error));
      asAny().setEditorContent('SELECT ?x WHERE { ?x ?p ?o }');
      asAny().execute();
      expect(realDialog.open).toHaveBeenCalledWith(
        ErrorDialogComponent,
        expect.objectContaining({
          data: expect.objectContaining({ message: expect.stringMatching(/endpoint SPARQL no responde/) }),
        }),
      );
    });

    it('should handle connection errors (status 0)', () => {
      const error = new HttpErrorResponse({ status: 0 });
      apiServiceMock.executeQuery.mockReturnValue(throwError(() => error));
      asAny().setEditorContent('SELECT ?x WHERE { ?x ?p ?o }');
      asAny().execute();
      expect(realDialog.open).toHaveBeenCalledWith(
        ErrorDialogComponent,
        expect.objectContaining({
          data: expect.objectContaining({ message: expect.stringMatching(/conectar con el backend/) }),
        }),
      );
    });
  });
});
