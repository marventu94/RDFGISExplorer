import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

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
  `,
})
export class TopBarComponent {
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
