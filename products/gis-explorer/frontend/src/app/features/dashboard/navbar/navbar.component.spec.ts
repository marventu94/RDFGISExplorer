import { TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import type { QueryResult } from '@rdfgis/contracts';
import { NavbarComponent } from './navbar.component';
import { SelectionService } from '@core/services/selection.service';
import { QueryPagingService } from '@core/services/query-paging.service';

describe('Navbar batch loading', () => {
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
