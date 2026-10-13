import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { SparqlInputComponent } from './sparql-input.component';
import { ErrorDialogComponent } from './error-dialog.component';
import { QueryPagingService } from '@core/services/query-paging.service';
import { SelectionService } from '@core/services/selection.service';
import { DashboardStateService } from '@core/services/dashboard-state.service';
import { AppConfigService } from '@core/services/app-config.service';
import type { QueryResult } from '@shared/models';
import { registerDashboardHost } from '@rdfgis/platform-bridge';

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
  let pagingMock: { loadInitial: ReturnType<typeof vi.fn>; activate: ReturnType<typeof vi.fn> };
  let selectionServiceMock: { setQueryResult: ReturnType<typeof vi.fn> };
  let persistenceMock: {
    beginLoad: ReturnType<typeof vi.fn>;
    failLoad: ReturnType<typeof vi.fn>;
    prepareQueryResult: ReturnType<typeof vi.fn>;
    completeQueryProcessing: ReturnType<typeof vi.fn>;
    failQueryLoad: ReturnType<typeof vi.fn>;
    currentDashboardId: ReturnType<typeof vi.fn>;
    clearCurrent: ReturnType<typeof vi.fn>;
  };
  let appConfigMock: { load: ReturnType<typeof vi.fn>; config: ReturnType<typeof vi.fn> };
  let realSnackBar: MatSnackBar;
  let realDialog: MatDialog;
  let unregisterHost: () => void;
  const bridgeMocks = {
    load: vi.fn().mockResolvedValue(undefined),
    list: vi.fn().mockResolvedValue([]),
    save: vi.fn(),
    delete: vi.fn(),
    nameExists: vi.fn().mockResolvedValue(false),
  };

  beforeEach(async () => {
    localStorage.clear();
    unregisterHost = registerDashboardHost(bridgeMocks);

    pagingMock = {
      loadInitial: vi.fn().mockReturnValue(of({ result: makeQueryResult(), totalRows: 1, size: 300 })),
      activate: vi.fn(),
    };
    selectionServiceMock = {
      setQueryResult: vi.fn(),
    };
    persistenceMock = {
      beginLoad: vi.fn(),
      failLoad: vi.fn(),
      prepareQueryResult: vi.fn(),
      completeQueryProcessing: vi.fn(),
      failQueryLoad: vi.fn(),
      currentDashboardId: vi.fn().mockReturnValue(null),
      clearCurrent: vi.fn(),
    };
    // Without prefixes, the editor starts empty just as before mocking configuration.
    appConfigMock = {
      load: vi.fn().mockReturnValue(of({ maxLimit: 1000, defaultPrefixes: {} })),
      config: vi.fn().mockReturnValue({ maxLimit: 1000, defaultPrefixes: {} }),
    };

    await TestBed.configureTestingModule({
      imports: [SparqlInputComponent, NoopAnimationsModule],
      providers: [
        { provide: QueryPagingService, useValue: pagingMock },
        { provide: SelectionService, useValue: selectionServiceMock },
        { provide: DashboardStateService, useValue: persistenceMock },
        { provide: AppConfigService, useValue: appConfigMock },
      ],
    }).compileComponents();

    realSnackBar = TestBed.inject(MatSnackBar);
    realDialog = TestBed.inject(MatDialog);

    vi.spyOn(MatSnackBar.prototype, 'open').mockImplementation(() => ({ onAction: () => ({ unsubscribe: () => {} }) } as any));
    vi.spyOn(MatDialog.prototype, 'open').mockReturnValue({ afterClosed: () => of(null) } as any);

    fixture = TestBed.createComponent(SparqlInputComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    unregisterHost();
    localStorage.clear();
    vi.clearAllMocks();
  });

  function asAny(): any {
    return component as any;
  }

  it('should create the component', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize with hasContent as false', () => {
    expect(asAny().hasContent()).toBe(false);
  });

  it('does not render a dashboards menu in the editor toolbar', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const labels = Array.from(compiled.querySelectorAll('button')).map((b) => b.textContent ?? '');
    expect(labels.some((label) => label.includes('Tableros'))).toBe(false);
    expect(compiled.querySelector('[aria-haspopup="menu"]')).toBeNull();
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

  describe('execute', () => {
    it('should not execute when editor is empty', () => {
      asAny().execute();
      expect(pagingMock.loadInitial).not.toHaveBeenCalled();
      expect(realDialog.open).toHaveBeenCalledWith(
        ErrorDialogComponent,
        expect.objectContaining({
          data: expect.objectContaining({ title: 'No hay query para ejecutar' }),
        }),
      );
    });

    it('should count and load the first page when editor has content', () => {
      asAny().setEditorContent('SELECT ?x WHERE { ?x ?p ?o }');
      asAny().execute();
      expect(pagingMock.loadInitial).toHaveBeenCalled();
      expect(pagingMock.loadInitial.mock.calls[0][0]).toContain('SELECT');
    });

    it('should set executing to false after request completes', () => {
      asAny().setEditorContent('SELECT ?x WHERE { ?x ?p ?o }');
      asAny().execute();
      expect(asAny().executing()).toBe(false);
    });

    it('should call selectionService.setQueryResult on success', () => {
      const result = makeQueryResult();
      pagingMock.loadInitial.mockReturnValue(of({ result, totalRows: 1, size: 300 }));
      asAny().setEditorContent('SELECT ?x WHERE { ?x ?p ?o } LIMIT 10');
      asAny().execute();
      expect(selectionServiceMock.setQueryResult).toHaveBeenCalledWith(result);
    });

    it('reports imported-query stages around the synchronous result fan-out', () => {
      const result = makeQueryResult();
      pagingMock.loadInitial.mockReturnValue(of({ result, totalRows: 1, size: 300 }));
      asAny().setEditorContent('SELECT ?x WHERE { ?x ?p ?o } LIMIT 10');

      asAny().execute({ showLoadProgress: true });

      expect(persistenceMock.prepareQueryResult).toHaveBeenCalledWith(result);
      expect(persistenceMock.completeQueryProcessing).toHaveBeenCalledOnce();
      expect(persistenceMock.prepareQueryResult.mock.invocationCallOrder[0]).toBeLessThan(
        selectionServiceMock.setQueryResult.mock.invocationCallOrder[0],
      );
      expect(selectionServiceMock.setQueryResult.mock.invocationCallOrder[0]).toBeLessThan(
        persistenceMock.completeQueryProcessing.mock.invocationCallOrder[0],
      );
    });

    it('should show snackbar with result count on success', () => {
      pagingMock.loadInitial.mockReturnValue(of({ result: makeQueryResult(), totalRows: 1, size: 300 }));
      asAny().setEditorContent('SELECT ?x WHERE { ?x ?p ?o } LIMIT 10');
      asAny().execute();
      expect(realSnackBar.open).toHaveBeenCalledWith(
        expect.stringMatching(/1 resultado en 250ms/),
        'Aceptar',
        expect.any(Object),
      );
    });

    it('should show error popup for invalid SPARQL syntax', () => {
      asAny().setEditorContent('INVALID SPARQL');
      asAny().execute();
      expect(pagingMock.loadInitial).not.toHaveBeenCalled();
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
      pagingMock.loadInitial.mockReturnValue(throwError(() => error));
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
      pagingMock.loadInitial.mockReturnValue(throwError(() => error));
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
      pagingMock.loadInitial.mockReturnValue(throwError(() => error));
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
      pagingMock.loadInitial.mockReturnValue(throwError(() => error));
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
