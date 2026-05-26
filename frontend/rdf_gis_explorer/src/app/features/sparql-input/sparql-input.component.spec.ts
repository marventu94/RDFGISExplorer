import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { SparqlInputComponent } from './sparql-input.component';
import { ApiService } from '@core/services/api.service';
import { LibraryService } from './library.service';
import { SelectionService } from '@core/services/selection.service';
import { SEED_QUERIES } from './seed-queries';
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
  let realSnackBar: MatSnackBar;
  let realDialog: MatDialog;
  let libraryService: LibraryService;

  beforeEach(async () => {
    localStorage.clear();

    apiServiceMock = {
      executeQuery: vi.fn().mockReturnValue(of(makeQueryResult())),
    };
    selectionServiceMock = {
      setQueryResult: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [SparqlInputComponent, NoopAnimationsModule],
      providers: [
        { provide: ApiService, useValue: apiServiceMock },
        { provide: SelectionService, useValue: selectionServiceMock },
      ],
    }).compileComponents();

    realSnackBar = TestBed.inject(MatSnackBar);
    realDialog = TestBed.inject(MatDialog);
    libraryService = TestBed.inject(LibraryService);

    vi.spyOn(MatSnackBar.prototype, 'open').mockImplementation(() => ({ onAction: () => ({ unsubscribe: () => {} }) } as any));
    vi.spyOn(MatDialog.prototype, 'open').mockReturnValue({ afterClosed: () => of(null) } as any);

    fixture = TestBed.createComponent(SparqlInputComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
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

  it('should initialize limit to 500', () => {
    expect(asAny().limit()).toBe(500);
  });

  it('should render the library button', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const buttons = compiled.querySelectorAll('button');
    const libraryBtn = Array.from(buttons).find(
      (b) => b.textContent?.includes('Biblioteca'),
    );
    expect(libraryBtn).toBeTruthy();
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

  describe('loadFromLibrary', () => {
    it('should prompt for confirmation when editor has content', () => {
      asAny().setEditorContent('SELECT ?x WHERE { ?x ?p ?o }');
      asAny().loadFromLibrary(SEED_QUERIES[0]);
      expect(realDialog.open).toHaveBeenCalled();
    });

    it('should not prompt when editor is empty', () => {
      asAny().loadFromLibrary(SEED_QUERIES[0]);
      expect(realDialog.open).not.toHaveBeenCalled();
    });
  });

  describe('execute', () => {
    it('should not execute when editor is empty', () => {
      asAny().execute();
      expect(apiServiceMock.executeQuery).not.toHaveBeenCalled();
    });

    it('should call apiService.executeQuery when editor has content', () => {
      asAny().setEditorContent('SELECT ?x WHERE { ?x ?p ?o }');
      asAny().execute();
      expect(apiServiceMock.executeQuery).toHaveBeenCalled();
      const callArgs = apiServiceMock.executeQuery.mock.calls[0][0];
      expect(callArgs.sparql).toContain('SELECT');
      expect(callArgs.limit).toBe(500);
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

    it('should show error for invalid SPARQL syntax', () => {
      asAny().setEditorContent('INVALID SPARQL');
      asAny().execute();
      expect(realSnackBar.open).toHaveBeenCalledWith(
        expect.stringMatching(/Error de sintaxis SPARQL/),
        'Cerrar',
        expect.any(Object),
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
      expect(realSnackBar.open).toHaveBeenCalledWith(
        expect.stringMatching(/SPARQL inválido/),
        'Cerrar',
        expect.any(Object),
      );
    });

    it('should handle HTTP 408 errors', () => {
      const error = new HttpErrorResponse({ status: 408, error: { error: 'TIMEOUT' } });
      apiServiceMock.executeQuery.mockReturnValue(throwError(() => error));
      asAny().setEditorContent('SELECT ?x WHERE { ?x ?p ?o }');
      asAny().execute();
      expect(realSnackBar.open).toHaveBeenCalledWith(
        expect.stringMatching(/tiempo límite/),
        'Cerrar',
        expect.any(Object),
      );
    });

    it('should handle HTTP 502 errors', () => {
      const error = new HttpErrorResponse({ status: 502, error: { error: 'UPSTREAM_ERROR' } });
      apiServiceMock.executeQuery.mockReturnValue(throwError(() => error));
      asAny().setEditorContent('SELECT ?x WHERE { ?x ?p ?o }');
      asAny().execute();
      expect(realSnackBar.open).toHaveBeenCalledWith(
        expect.stringMatching(/endpoint SPARQL no responde/),
        'Cerrar',
        expect.any(Object),
      );
    });

    it('should handle connection errors (status 0)', () => {
      const error = new HttpErrorResponse({ status: 0 });
      apiServiceMock.executeQuery.mockReturnValue(throwError(() => error));
      asAny().setEditorContent('SELECT ?x WHERE { ?x ?p ?o }');
      asAny().execute();
      expect(realSnackBar.open).toHaveBeenCalledWith(
        expect.stringMatching(/conectar con el backend/),
        'Cerrar',
        expect.any(Object),
      );
    });
  });

  describe('saveCurrentQuery', () => {
    it('should not open dialog when editor is empty', () => {
      asAny().saveCurrentQuery();
      expect(realDialog.open).not.toHaveBeenCalled();
    });

    it('should open save dialog when editor has content', () => {
      asAny().setEditorContent('SELECT ?x WHERE { ?x ?p ?o }');
      asAny().saveCurrentQuery();
      expect(realDialog.open).toHaveBeenCalled();
    });

    it('should save query via LibraryService when name is provided', () => {
      vi.spyOn(realDialog, 'open').mockReturnValue({ afterClosed: () => of('Mi query') } as any);
      asAny().setEditorContent('SELECT ?x WHERE { ?x ?p ?o }');
      const before = libraryService.customQueries.length;
      asAny().saveCurrentQuery();
      expect(libraryService.customQueries.length).toBe(before + 1);
    });
  });

  describe('deleteCustomQuery', () => {
    it('should remove custom query from library', () => {
      const entry = libraryService.save('ToDelete', 'SELECT ?x WHERE { ?x ?p ?o }');
      expect(libraryService.customQueries.length).toBe(1);

      const mockEvent = { stopPropagation: vi.fn() } as unknown as Event;
      asAny().deleteCustomQuery(entry, mockEvent);

      expect(libraryService.customQueries.length).toBe(0);
    });
  });

  describe('onLimitChange', () => {
    it('should update limit for valid values', () => {
      asAny().onLimitChange(1000);
      expect(asAny().limit()).toBe(1000);
    });
  });

  describe('restoreDefaults', () => {
    it('should restore library via libraryService', () => {
      libraryService.save('Custom', 'SELECT ?x WHERE { ?x ?p ?o }');
      asAny().restoreDefaults();
      expect(libraryService.customQueries.length).toBe(0);
    });
  });

  describe('seedQueries and userQueries', () => {
    it('should return seed queries from library', () => {
      const seeds = asAny().seedQueries();
      expect(seeds.length).toBe(SEED_QUERIES.length);
      expect(seeds.every((q: any) => q.isSeed)).toBe(true);
    });

    it('should return user queries from library', () => {
      libraryService.save('Custom', 'SELECT ?x WHERE { ?x ?p ?o }');
      const users = asAny().userQueries();
      expect(users.length).toBe(1);
      expect(users.every((q: any) => !q.isSeed)).toBe(true);
    });
  });
});
