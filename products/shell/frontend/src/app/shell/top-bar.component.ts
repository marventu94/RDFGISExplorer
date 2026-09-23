import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { LanguageSelectorComponent } from '../core/language-selector.component';
import { TranslatePipe } from '../core/translate.pipe';
import { ThemeToggleComponent } from '../core/theme-toggle.component';
import { ExploreInGisService } from '../core/explore-in-gis.service';

@Component({
  selector: 'app-top-bar',
  standalone: true,
  imports: [RouterLink, LanguageSelectorComponent, ThemeToggleComponent, TranslatePipe],
  template: `
    <header class="top-bar">
      <div class="top-bar__left">
        <svg class="top-bar__logo" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20z" />
          <path d="M2 12h20" />
        </svg>
        <span class="top-bar__title">RDF GIS Platform</span>
      </div>

      <nav class="top-bar__breadcrumb">
        <a routerLink="/" class="top-bar__crumb">{{ 'Inicio' | translate }}</a>
        @if (currentPath !== '/') {
          <span class="top-bar__separator">›</span>
          <span class="top-bar__crumb top-bar__crumb--active">{{ currentLabel }}</span>
        }
      </nav>
      <div class="top-bar__preferences">
        @if (isExplorer) {
          <button class="top-bar__gis-action" type="button" (click)="exploreInGis()">
            {{ 'Explorar en GIS' | translate }}
          </button>
        }
        <app-language-selector />
        <app-theme-toggle />
      </div>
    </header>
  `,
  styles: `
    .top-bar {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 0.5rem 1.5rem;
      background: var(--top-bar-bg);
      border-bottom: 1px solid var(--top-bar-border);
      height: 56px;
      box-sizing: border-box;
    }

    .top-bar__left {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      color: var(--color-accent);
    }

    .top-bar__logo {
      flex-shrink: 0;
    }

    .top-bar__title {
      font-weight: 600;
      font-size: 1.1rem;
      white-space: nowrap;
      color: var(--top-bar-title);
    }

    .top-bar__breadcrumb {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      flex: 1;
      min-width: 0;
    }

    .top-bar__crumb {
      text-decoration: none;
      color: var(--top-bar-crumb);
      font-size: 0.9rem;
      transition: color 0.15s ease;

      &:hover {
        color: var(--color-accent);
      }
    }

    .top-bar__crumb--active {
      color: var(--top-bar-crumb-active);
      font-weight: 500;
    }

    .top-bar__separator {
      color: var(--color-text-subtle);
      font-size: 1.1rem;
    }

    .top-bar__preferences { display: flex; align-items: center; gap: .45rem; }

    .top-bar__gis-action {
      padding: 0.45rem 0.8rem;
      border: 1px solid var(--color-accent);
      border-radius: 6px;
      background: var(--color-accent);
      color: var(--color-text-on-accent);
      font: inherit;
      font-weight: 500;
      cursor: pointer;
    }

    .top-bar__gis-action:hover { filter: brightness(0.95); }
  `,
})
export class TopBarComponent {
  private readonly router = inject(Router);
  private readonly exploreService = inject(ExploreInGisService);

  get currentPath(): string {
    return window.location.pathname;
  }

  get currentLabel(): string {
    const path = this.currentPath;
    if (path.startsWith('/gis')) return 'GIS';
    if (path.startsWith('/explorer')) return 'Explorer';
    return path.split('/').pop() ?? '';
  }

  get isExplorer(): boolean {
    return this.router.url.split('?')[0] === '/explorer';
  }

  exploreInGis(): void {
    void this.exploreService.explore();
  }
}
