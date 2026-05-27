import { Component } from '@angular/core';
import { RouterLink, Router } from '@angular/router';

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
        <span class="top-bar__title">RDF Platform</span>
      </div>

      <nav class="top-bar__breadcrumb">
        <a routerLink="/" class="top-bar__crumb">Inicio</a>
        @if (currentPath !== '/') {
          <span class="top-bar__separator">›</span>
          <span class="top-bar__crumb top-bar__crumb--active">{{ currentLabel }}</span>
        }
      </nav>

      <div class="top-bar__right">
        @if (currentPath !== '/') {
          <a routerLink="/" class="top-bar__back">Volver al inicio</a>
        }
        <a routerLink="/settings" class="top-bar__settings" aria-label="Configuración">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </a>
      </div>
    </header>
  `,
  styles: `
    .top-bar {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 0.5rem 1.5rem;
      background: #fff;
      border-bottom: 1px solid #e0e0e0;
      height: 56px;
      box-sizing: border-box;
    }

    .top-bar__left {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      color: #1a73e8;
    }

    .top-bar__logo {
      flex-shrink: 0;
    }

    .top-bar__title {
      font-weight: 600;
      font-size: 1.1rem;
      white-space: nowrap;
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
      color: #666;
      font-size: 0.9rem;

      &:hover {
        color: #1a73e8;
      }
    }

    .top-bar__crumb--active {
      color: #333;
      font-weight: 500;
    }

    .top-bar__separator {
      color: #999;
      font-size: 1.1rem;
    }

    .top-bar__right {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      flex-shrink: 0;
    }

    .top-bar__back {
      text-decoration: none;
      color: #1a73e8;
      font-size: 0.85rem;
      font-weight: 500;
      white-space: nowrap;

      &:hover {
        text-decoration: underline;
      }
    }

    .top-bar__settings {
      background: none;
      border: none;
      cursor: pointer;
      padding: 0.4rem;
      border-radius: 50%;
      color: #666;
      display: flex;
      align-items: center;
      justify-content: center;
      text-decoration: none;

      &:hover,
      &:focus-visible {
        background: #f0f0f0;
        color: #333;
      }
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
