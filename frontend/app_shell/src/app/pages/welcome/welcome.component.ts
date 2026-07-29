import { Component, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AsyncPipe } from '@angular/common';
import { BehaviorSubject, combineLatest, map } from 'rxjs';
import { DashboardStoreService } from '../../core/dashboard-store.service';
import { DashboardCardComponent } from './dashboard-card.component';

type FilterKind = 'all' | 'gis' | 'explorer';

@Component({
  selector: 'app-welcome',
  standalone: true,
  imports: [RouterLink, AsyncPipe, DashboardCardComponent],
  template: `
    <div class="welcome">
      <section class="welcome__ctas" aria-label="Acciones principales">
        <a routerLink="/explorer" class="welcome__cta welcome__cta--explorer" aria-label="Abrir RDF Explorer para construir una query">
          <div class="welcome__cta-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 6v6l4 2"/>
            </svg>
          </div>
          <div class="welcome__cta-text">
            <span class="welcome__cta-title">Construir query</span>
            <span class="welcome__cta-sub">RDF Explorer</span>
          </div>
        </a>

        <a routerLink="/gis" class="welcome__cta welcome__cta--gis" aria-label="Abrir RDF GIS Explorer">
          <div class="welcome__cta-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
              <circle cx="12" cy="10" r="3"/>
            </svg>
          </div>
          <div class="welcome__cta-text">
            <span class="welcome__cta-title">Explorar en GIS</span>
            <span class="welcome__cta-sub">RDF GIS Explorer</span>
          </div>
        </a>
      </section>

      <section class="welcome__recent" aria-label="Tableros recientes">
        <div class="welcome__recent-header">
          <h2 class="welcome__recent-title">Recientes</h2>
          <div class="welcome__filters" role="group" aria-label="Filtrar por tipo">
            @for (f of filters; track f.value) {
              <button
                class="welcome__filter"
                [class.welcome__filter--active]="activeFilter === f.value"
                [attr.aria-pressed]="activeFilter === f.value"
                (click)="setFilter(f.value)"
              >
                {{ f.label }}
              </button>
            }
          </div>
        </div>

        @if (filteredDashboards$ | async; as dashboards) {
          @if (dashboards.length > 0) {
            <div class="welcome__grid" role="list" aria-label="Lista de tableros recientes">
              @for (d of dashboards; track d.id) {
                <app-dashboard-card [dashboard]="d" />
              }
            </div>
          } @else {
            <div class="welcome__empty" role="status" aria-live="polite">
              <svg viewBox="0 0 80 80" width="80" height="80" fill="none" stroke="#ccc" stroke-width="1.5" aria-hidden="true">
                <rect x="10" y="10" width="60" height="60" rx="8"/>
                <path d="M30 35h20M30 45h14"/>
                <circle cx="58" cy="50" r="6"/>
              </svg>
              <p class="welcome__empty-text">Empezá construyendo una query</p>
              <a routerLink="/explorer" class="welcome__empty-cta">Ir a RDF Explorer</a>
            </div>
          }
        } @else {
          <div class="welcome__loading" role="status" aria-live="polite">
            <span class="welcome__loading-text">Cargando recientes…</span>
          </div>
        }
      </section>
    </div>
  `,
  styles: `
    :host {
      display: block;
      height: 100%;
      overflow-y: auto;
    }
    .welcome {
      max-width: 960px;
      margin: 0 auto;
      padding: 2rem 1.5rem;
    }
    .welcome__ctas {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1.5rem;
      margin-bottom: 2.5rem;
    }
    .welcome__cta {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 1.5rem;
      border-radius: 12px;
      text-decoration: none;
      transition: transform 0.2s, box-shadow 0.2s, border-color 0.2s;
      border: 1px solid var(--color-border);
      background: var(--color-bg-elevated);
      color: var(--color-text);
    }
    .welcome__cta:hover {
      transform: translateY(-2px);
      box-shadow: var(--shadow-lg);
    }
    .welcome__cta--explorer {
      background: linear-gradient(135deg,
        color-mix(in srgb, var(--color-danger) 18%, var(--color-bg-elevated)) 0%,
        var(--color-bg-elevated) 100%);
      border-color: color-mix(in srgb, var(--color-danger) 35%, var(--color-border));
    }
    .welcome__cta--gis {
      background: linear-gradient(135deg,
        color-mix(in srgb, var(--color-accent) 18%, var(--color-bg-elevated)) 0%,
        var(--color-bg-elevated) 100%);
      border-color: color-mix(in srgb, var(--color-accent) 35%, var(--color-border));
    }
    .welcome__cta-icon {
      flex-shrink: 0;
    }
    .welcome__cta--explorer .welcome__cta-icon { color: var(--color-danger); }
    .welcome__cta--gis .welcome__cta-icon { color: var(--color-accent); }
    .welcome__cta-text {
      display: flex;
      flex-direction: column;
    }
    .welcome__cta-title {
      font-size: 1.1rem;
      font-weight: 600;
      color: var(--color-text);
    }
    .welcome__cta-sub {
      font-size: 0.85rem;
      color: var(--color-text-muted);
      margin-top: 0.2rem;
    }
    .welcome__recent-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1rem;
    }
    .welcome__recent-title {
      font-size: 1.1rem;
      font-weight: 600;
      color: var(--color-text);
      margin: 0;
    }
    .welcome__filters {
      display: flex;
      gap: 0.25rem;
    }
    .welcome__filter {
      padding: 0.35rem 0.75rem;
      border: 1px solid var(--color-border);
      border-radius: 6px;
      background: var(--color-bg-elevated);
      cursor: pointer;
      font-size: 0.85rem;
      color: var(--color-text-muted);
      transition: all 0.2s;
    }
    .welcome__filter:hover {
      border-color: var(--color-accent);
      color: var(--color-accent);
    }
    .welcome__filter--active {
      background: var(--color-accent);
      color: var(--color-text-on-accent);
      border-color: var(--color-accent);
    }
    .welcome__grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
      gap: 1rem;
    }
    .welcome__empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 3rem 1rem;
      text-align: center;
    }
    .welcome__empty-text {
      color: var(--color-text-muted);
      font-size: 1rem;
      margin: 1rem 0;
    }
    .welcome__empty-cta {
      display: inline-block;
      padding: 0.6rem 1.5rem;
      background: var(--color-accent);
      color: var(--color-text-on-accent);
      border-radius: 8px;
      text-decoration: none;
      font-weight: 500;
      font-size: 0.9rem;
      transition: background-color 0.2s;
    }
    .welcome__empty-cta:hover {
      background: var(--color-accent-hover);
    }
    .welcome__loading {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 3rem 1rem;
      color: var(--color-text-muted);
    }
    .welcome__loading-text {
      font-size: 0.95rem;
    }
  `,
})
export class WelcomePageComponent implements OnInit {
  private readonly store = inject(DashboardStoreService);

  readonly filters = [
    { label: 'Todos', value: 'all' as const },
    { label: 'GIS', value: 'gis' as const },
    { label: 'Explorer', value: 'explorer' as const },
  ];

  private readonly filterSubject = new BehaviorSubject<FilterKind>('all');
  activeFilter: FilterKind = 'all';

  readonly filteredDashboards$ = combineLatest([
    this.store.recent$,
    this.filterSubject,
  ]).pipe(
    map(([dashboards, filter]) => {
      if (filter === 'all') return dashboards;
      return dashboards.filter((d) => d.kind === filter);
    }),
  );

  ngOnInit(): void {
    this.store.refresh();
  }

  setFilter(filter: FilterKind): void {
    this.activeFilter = filter;
    this.filterSubject.next(filter);
  }
}
