import { TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { App } from './app';
import { QueryPagingService } from '@core/services/query-paging.service';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App, NoopAnimationsModule],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render navbar', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('app-navbar')).toBeTruthy();
  });

  it('shows a modal loading card only while applying filters', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const paging = TestBed.inject(QueryPagingService);
    paging.busy.set(true);
    paging.loadingKind.set('filter');
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.filter-loading-overlay[aria-modal="true"]')).toBeTruthy();
    expect(compiled.textContent).toContain('Aplicando filtros');

    paging.loadingKind.set('lot');
    fixture.detectChanges();
    expect(compiled.querySelector('.filter-loading-overlay')).toBeNull();
  });
});
