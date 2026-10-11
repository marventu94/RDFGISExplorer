import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LanguageSelectorComponent } from '../core/language-selector.component';
import { TranslatePipe } from '../core/translate.pipe';
import { ThemeToggleComponent } from '../core/theme-toggle.component';

@Component({
  selector: 'app-top-bar',
  standalone: true,
  imports: [RouterLink, LanguageSelectorComponent, ThemeToggleComponent, TranslatePipe],
  template: `
    <header class="top-bar">
      <div class="top-bar__left">
        <!-- Pin de grafo (mismo dibujo que favicon.svg): el pin usa el acento
             y el grafo el fondo de la barra, así sigue al tema. -->
        <svg class="top-bar__logo" viewBox="0 0 32 32" width="26" height="26" aria-hidden="true">
          <path fill="currentColor" d="M16 2.5c-6.4 0-11.3 4.9-11.3 11.1C4.7 21.5 16 29.5 16 29.5s11.3-8 11.3-15.9C27.3 7.4 22.4 2.5 16 2.5z" />
          <path d="M11 10.6 21 9.6 16 18.3Z" fill="none" stroke="var(--top-bar-bg)" stroke-width="1.9" stroke-linejoin="round" />
          <g fill="var(--top-bar-bg)">
            <circle cx="11" cy="10.6" r="2.6" />
            <circle cx="21" cy="9.6" r="2.6" />
            <circle cx="16" cy="18.3" r="3" />
          </g>
        </svg>
        <span class="top-bar__title">RDF GIS Explorer</span>
      </div>

      <nav class="top-bar__breadcrumb">
        <a routerLink="/" class="top-bar__crumb">{{ 'Inicio' | translate }}</a>
        @if (currentPath !== '/') {
          <span class="top-bar__separator">›</span>
          <span class="top-bar__crumb top-bar__crumb--active">{{ currentLabel }}</span>
        }
      </nav>
      <div class="top-bar__preferences">
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
