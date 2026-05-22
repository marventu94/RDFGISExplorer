import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import {
  provideHttpClient,
  withInterceptorsFromDi,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { BehaviorSubject } from 'rxjs';
import type { Selection, NormalizedNode } from '@shared/models';

import { CurationPanelComponent } from './curation-panel.component';
import { SelectionService } from '@core/services/selection.service';
import { CurationService } from '@core/services/curation.service';

const mockNode: NormalizedNode = {
  uri: 'http://www.wikidata.org/entity/Q1486',
  label: 'Buenos Aires',
  type: 'city',
  attributes: {
    label: { type: 'literal', value: 'Buenos Aires' },
    population: { type: 'literal', value: '3075646' },
    coord: {
      type: 'coordinate',
      value: { lat: -34.6037, lng: -58.3816 },
      raw: 'Point(-58.3816 -34.6037)',
    },
  },
  coordinate: { lat: -34.6037, lng: -58.3816 },
};

const mockCurationResponse = {
  records: [
    {
      id: 1,
      nodeUri: 'http://www.wikidata.org/entity/Q1486',
      fieldName: 'label',
      rawValue: 'Buenos Aires',
      scriptValue: null,
      manualValue: 'Buenos Aires City',
      status: 'corrected' as const,
      author: 'martin@bago.com.ar',
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    },
    {
      id: 2,
      nodeUri: 'http://www.wikidata.org/entity/Q1486',
      fieldName: 'population',
      rawValue: '3075646',
      scriptValue: '3120000',
      manualValue: null,
      status: 'pending' as const,
      author: 'script@auto',
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    },
  ],
  duplicates: [
    {
      id: 1,
      nodeUriA: 'http://www.wikidata.org/entity/Q1486',
      nodeUriB: 'http://www.wikidata.org/entity/Q11164',
      score: 0.87,
      decision: 'pending' as const,
    },
  ],
};

describe('CurationPanelComponent', () => {
  let fixture: ComponentFixture<CurationPanelComponent>;
  let component: CurationPanelComponent;
  let selectionService: SelectionService;
  let httpMock: HttpTestingController;
  let selectedNodeSubject: BehaviorSubject<Selection>;

  const baseUrl = 'http://localhost:3000';

  beforeEach(async () => {
    selectedNodeSubject = new BehaviorSubject<Selection>({
      node: null,
      source: 'external',
    });

    const mockSelectionService = {
      selectedNode$: selectedNodeSubject.asObservable(),
      clearSelection: vi.fn(),
      select: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [CurationPanelComponent, NoopAnimationsModule],
      providers: [
        { provide: SelectionService, useValue: mockSelectionService },
        CurationService,
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CurationPanelComponent);
    component = fixture.componentInstance;
    selectionService = TestBed.inject(SelectionService);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should show empty state when no node is selected', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.panel-title')?.textContent).toContain(
      'Sin selección',
    );
  });

  it('should load curation data when a node is selected', async () => {
    selectedNodeSubject.next({ node: mockNode, source: 'table' });
    fixture.detectChanges();

    const req = httpMock.expectOne(
      `${baseUrl}/curation/${encodeURIComponent(mockNode.uri)}`,
    );
    expect(req.request.method).toBe('GET');
    req.flush(mockCurationResponse);
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('should show node label in header when selected', async () => {
    selectedNodeSubject.next({ node: mockNode, source: 'table' });
    fixture.detectChanges();

    const req = httpMock.expectOne(
      `${baseUrl}/curation/${encodeURIComponent(mockNode.uri)}`,
    );
    req.flush(mockCurationResponse);
    await fixture.whenStable();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.panel-title')?.textContent).toContain(
      'Buenos Aires',
    );
  });

  it('should call clearSelection and emit close when close button clicked', async () => {
    selectedNodeSubject.next({ node: mockNode, source: 'table' });
    fixture.detectChanges();

    const req = httpMock.expectOne(
      `${baseUrl}/curation/${encodeURIComponent(mockNode.uri)}`,
    );
    req.flush(mockCurationResponse);
    await fixture.whenStable();
    fixture.detectChanges();

    const emitSpy = vi.spyOn(component.close, 'emit');

    const closeBtn = (fixture.nativeElement as HTMLElement).querySelector(
      'button[aria-label="Cerrar panel"]',
    ) as HTMLButtonElement;
    closeBtn.click();

    expect(selectionService.clearSelection).toHaveBeenCalled();
    expect(emitSpy).toHaveBeenCalled();
  });

  it('should show pending duplicate count when pending duplicates exist', async () => {
    selectedNodeSubject.next({ node: mockNode, source: 'table' });
    fixture.detectChanges();

    const req = httpMock.expectOne(
      `${baseUrl}/curation/${encodeURIComponent(mockNode.uri)}`,
    );
    req.flush(mockCurationResponse);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.pendingDuplicateCount()).toBe(1);
  });

  it('should reset state when selection is cleared', async () => {
    selectedNodeSubject.next({ node: mockNode, source: 'table' });
    fixture.detectChanges();

    const req = httpMock.expectOne(
      `${baseUrl}/curation/${encodeURIComponent(mockNode.uri)}`,
    );
    req.flush(mockCurationResponse);
    await fixture.whenStable();
    fixture.detectChanges();

    selectedNodeSubject.next({ node: null, source: 'external' });
    fixture.detectChanges();

    expect(component.node()).toBeNull();
    expect(component.records()).toEqual([]);
    expect(component.duplicates()).toEqual([]);
    expect(component.pendingDuplicateCount()).toBe(0);
  });

  it('should load curation data for new node when selection changes', async () => {
    selectedNodeSubject.next({ node: mockNode, source: 'table' });
    fixture.detectChanges();

    let req = httpMock.expectOne(
      `${baseUrl}/curation/${encodeURIComponent(mockNode.uri)}`,
    );
    req.flush(mockCurationResponse);
    await fixture.whenStable();
    fixture.detectChanges();

    const anotherNode: NormalizedNode = {
      uri: 'http://www.wikidata.org/entity/Q11164',
      label: 'Córdoba',
      attributes: {
        label: { type: 'literal', value: 'Córdoba' },
      },
    };

    selectedNodeSubject.next({ node: anotherNode, source: 'map' });
    fixture.detectChanges();

    req = httpMock.expectOne(
      `${baseUrl}/curation/${encodeURIComponent(anotherNode.uri)}`,
    );
    expect(req.request.method).toBe('GET');
    req.flush({ records: [], duplicates: [] });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.node()?.label).toBe('Córdoba');
  });
});
