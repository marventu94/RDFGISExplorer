import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { WelcomePageComponent } from './welcome.component';
import type { Dashboard } from '../../core/dashboard.model';

describe('WelcomePageComponent', () => {
  let httpMock: HttpTestingController;

  const mockDashboards: Dashboard[] = [
    { id: '1', kind: 'gis', name: 'GIS One', payload: {}, createdAt: '', updatedAt: '2025-01-01T00:00:00Z' },
    { id: '2', kind: 'explorer', name: 'Explorer One', payload: {}, createdAt: '', updatedAt: '2025-01-02T00:00:00Z' },
    { id: '3', kind: 'gis', name: 'GIS Two', payload: {}, createdAt: '', updatedAt: '2025-01-03T00:00:00Z' },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WelcomePageComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  function createComponent() {
    const fixture = TestBed.createComponent(WelcomePageComponent);
    fixture.detectChanges();
    httpMock.expectOne('http://localhost:3000/api/dashboards/recent').flush(mockDashboards);
    fixture.detectChanges();
    return fixture;
  }

  it('shows empty state when no dashboards exist', () => {
    const fixture = TestBed.createComponent(WelcomePageComponent);
    fixture.detectChanges();
    httpMock.expectOne('http://localhost:3000/api/dashboards/recent').flush([]);
    fixture.detectChanges();

    const emptyText = fixture.nativeElement.querySelector('.welcome__empty-text');
    expect(emptyText?.textContent).toContain('Empezá construyendo una query');
  });

  it('renders dashboard cards for each recent item', () => {
    const fixture = createComponent();
    const cards = fixture.nativeElement.querySelectorAll('app-dashboard-card');
    expect(cards.length).toBe(3);
  });

  it('shows two CTA buttons', () => {
    const fixture = createComponent();
    const ctas = fixture.nativeElement.querySelectorAll('.welcome__cta');
    expect(ctas.length).toBe(2);
  });

  it('filters by GIS', () => {
    const fixture = createComponent();
    const filterBtns = fixture.nativeElement.querySelectorAll('.welcome__filter');
    filterBtns[1].click();
    fixture.detectChanges();

    const cards = fixture.nativeElement.querySelectorAll('app-dashboard-card');
    expect(cards.length).toBe(2);
  });

  it('filters by Explorer', () => {
    const fixture = createComponent();
    const filterBtns = fixture.nativeElement.querySelectorAll('.welcome__filter');

    filterBtns[2].click();
    fixture.detectChanges();

    const cards = fixture.nativeElement.querySelectorAll('app-dashboard-card');
    expect(cards.length).toBe(1);
  });

  it('shows all items with Todos filter', () => {
    const fixture = createComponent();
    const filterBtns = fixture.nativeElement.querySelectorAll('.welcome__filter');

    filterBtns[1].click();
    fixture.detectChanges();
    let cards = fixture.nativeElement.querySelectorAll('app-dashboard-card');
    expect(cards.length).toBe(2);

    filterBtns[0].click();
    fixture.detectChanges();
    cards = fixture.nativeElement.querySelectorAll('app-dashboard-card');
    expect(cards.length).toBe(3);
  });
});
