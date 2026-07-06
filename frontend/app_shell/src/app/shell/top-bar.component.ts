import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ThemeService } from '../core/theme.service';

@Component({
  selector: 'app-top-bar',
  standalone: true,
  imports: [RouterLink],
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
        <a routerLink="/" class="top-bar__crumb">Inicio</a>
        @if (currentPath !== '/') {
          <span class="top-bar__separator">›</span>
          <span class="top-bar__crumb top-bar__crumb--active">{{ currentLabel }}</span>
        }
      </nav>

      <div class="top-bar__right">
        <button
          type="button"
          class="top-bar__theme-toggle"
          (click)="theme.toggle()"
          [attr.aria-label]="theme.nextLabel()"
          [attr.title]="theme.nextLabel()"
        >
          @if (theme.isDark()) {
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2" />
              <path d="M12 20v2" />
              <path d="m4.93 4.93 1.41 1.41" />
              <path d="m17.66 17.66 1.41 1.41" />
              <path d="M2 12h2" />
              <path d="M20 12h2" />
              <path d="m6.34 17.66-1.41 1.41" />
              <path d="m19.07 4.93-1.41 1.41" />
            </svg>
          } @else {
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          }
        </button>
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
      transition: background-color 0.15s ease, border-color 0.15s ease;
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

    .top-bar__theme-toggle {
      background: none;
      border: 1px solid var(--color-border);
      cursor: pointer;
      padding: 0.4rem;
      border-radius: 50%;
      color: var(--top-bar-icon);
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease, transform 0.1s ease;

      &:hover {
        background: var(--top-bar-icon-hover-bg);
        color: var(--top-bar-icon-hover-fg);
      }

      &:focus-visible {
        outline: 2px solid var(--color-accent);
        outline-offset: 2px;
      }

      &:active {
        transform: scale(0.95);
      }
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

    .top-bar__right {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      flex-shrink: 0;
    }
  `,
})
export class TopBarComponent {
  protected readonly theme = inject(ThemeService);

  get currentPath(): string {
    return window.location.pathname;
  }

  get currentLabel(): string {
    const path = this.currentPath;
    if (path.startsWith('/gis')) return 'GIS';
    if (path.startsWith('/explorer')) return 'Explorer';
    return path.split('/').pop() ?? '';
  }
}
