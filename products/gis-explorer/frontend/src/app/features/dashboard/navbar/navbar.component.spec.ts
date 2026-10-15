import { Router } from '@angular/router';
import { DashboardViewStateService } from '@core/services/dashboard-view-state.service';
import { consumeExplorerReturn, registerDashboardHost, type DashboardHost } from '@rdfgis/platform-bridge';
import { TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import type { QueryResult } from '@rdfgis/contracts';
import { NavbarComponent } from './navbar.component';
import { SelectionService } from '@core/services/selection.service';
import { QueryPagingService } from '@core/services/query-paging.service';

describe('Navbar batch loading', () => {
  it('only offers a return for a live RDF handoff and sends just the original panel ID', async () => {
    const unregister = registerDashboardHost({} as DashboardHost);
    const navigate = vi.fn();
    try {
      await TestBed.configureTestingModule({
        imports: [NavbarComponent, NoopAnimationsModule],
        providers: [provideHttpClient(), provideHttpClientTesting(), { provide: Router, useValue: { navigate } }],
      }).compileComponents();
      const fixture = TestBed.createComponent(NavbarComponent);
      const viewState = TestBed.inject(DashboardViewStateService);
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).not.toContain('Volver a RDF Explorer');
      viewState.origin.set({ panelId: 'original-panel' });
      fixture.detectChanges();
      const button = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button'))
        .find(button => button.textContent?.includes('Volver a RDF Explorer'))!;
      expect(button).toBeTruthy();
      button.click();
      expect(navigate).toHaveBeenCalledWith(['/explorer']);
      expect(consumeExplorerReturn()).toBe('original-panel');
      expect(consumeExplorerReturn()).toBeNull();
      viewState.origin.set(null);
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).not.toContain('Volver a RDF Explorer');
    } finally { unregister(); }
  });

  it('replaces the requested arrow with a spinner without loading text', async () => {
    await TestBed.configureTestingModule({
      imports: [NavbarComponent, NoopAnimationsModule],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    const fixture = TestBed.createComponent(NavbarComponent);
    fixture.detectChanges();
    const selection = TestBed.inject(SelectionService);
    const paging = TestBed.inject(QueryPagingService);
    const result: QueryResult = {
      variables: ['item'],
      bindings: [
        { item: { type: 'uri', value: 'urn:first' } },
        { item: { type: 'uri', value: 'urn:second' } },
      ],
      nodes: [], edges: [],
      meta: { durationMs: 1, truncated: false, limitApplied: 2, backend: 'test' },
    };
    selection.setLotSize(1);
    selection.setQueryResult(result);
    paging.busy.set(true);
    paging.loadingKind.set('lot');
    paging.loadingDirection.set('next');
    fixture.detectChanges();

    const navbar = fixture.nativeElement as HTMLElement;
    expect(navbar.querySelector('.lot-nav-btn--loading mat-spinner')).toBeTruthy();
    expect(navbar.querySelector('.lot-nav-btn--loading mat-icon')).toBeNull();
    expect(navbar.textContent).not.toContain('Cargando lote');
  });
});
