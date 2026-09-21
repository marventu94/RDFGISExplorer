import { Component, input, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { DashboardStoreService } from '../../core/dashboard-store.service';
import { SnackbarService } from '../../core/snackbar.service';
import { relativeDate, type Dashboard } from '../../core/dashboard.model';

@Component({
  selector: 'app-dashboard-card',
  standalone: true,
  template: `
    <div
      class="card"
      role="listitem"
      [attr.aria-label]="'Abrir ' + dashboard().name + ' (' + (dashboard().kind === 'gis' ? 'GIS' : 'Explorer') + ')'"
      tabindex="0"
      (click)="navigate()"
      (keydown.enter)="navigate()"
      (keydown.space)="navigate(); $event.preventDefault()"
    >
      <div class="card__header">
        <span class="card__name">{{ dashboard().name }}</span>
        <div class="card__menu" (click)="$event.stopPropagation()">
          <button
            class="card__menu-trigger"
            [attr.aria-label]="'Más opciones para ' + dashboard().name"
            [attr.aria-expanded]="isMenuOpen()"
            (click)="toggleMenu()"
          >⋯</button>
          @if (isMenuOpen()) {
            <div class="card__dropdown" role="menu">
              <button class="card__dropdown-item" role="menuitem" (click)="rename()">Renombrar</button>
              <button class="card__dropdown-item" role="menuitem" (click)="duplicate()">Duplicar</button>
              <button class="card__dropdown-item card__dropdown-item--danger" role="menuitem" (click)="deleteDashboard()">Eliminar</button>
            </div>
          }
        </div>
      </div>
      <div class="card__meta">
        <span
          class="card__chip"
          [class.card__chip--gis]="dashboard().kind === 'gis'"
          [class.card__chip--explorer]="dashboard().kind === 'explorer'"
          aria-hidden="true"
        >
          {{ dashboard().kind === 'gis' ? 'GIS' : 'Explorer' }}
        </span>
        <span class="card__date">{{ relativeDate(dashboard().updatedAt) }}</span>
      </div>
    </div>
  `,
  styles: `
    .card {
      background: var(--color-bg-elevated);
      border: 1px solid var(--color-border);
      border-radius: 8px;
      padding: 1rem;
      cursor: pointer;
      transition: box-shadow 0.2s, border-color 0.2s, background-color 0.15s;
    }
    .card:hover,
    .card:focus-visible {
      box-shadow: var(--shadow-md);
      border-color: var(--color-border-strong);
      outline: 2px solid var(--color-accent);
      outline-offset: 2px;
    }
    .card__header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 0.75rem;
    }
    .card__name {
      font-weight: 500;
      font-size: 0.95rem;
      color: var(--color-text);
      line-height: 1.3;
      word-break: break-word;
    }
    .card__menu {
      position: relative;
      flex-shrink: 0;
    }
    .card__menu-trigger {
      background: none;
      border: none;
      cursor: pointer;
      padding: 0.2rem 0.4rem;
      border-radius: 4px;
      font-size: 1.2rem;
      color: var(--color-text-muted);
      line-height: 1;
    }
    .card__menu-trigger:hover {
      background: var(--color-bg-hover);
      color: var(--color-text);
    }
    .card__dropdown {
      position: absolute;
      right: 0;
      top: 100%;
      background: var(--color-bg-elevated);
      border: 1px solid var(--color-border);
      border-radius: 6px;
      box-shadow: var(--shadow-lg);
      min-width: 140px;
      z-index: 10;
      overflow: hidden;
    }
    .card__dropdown-item {
      display: block;
      width: 100%;
      padding: 0.5rem 1rem;
      border: none;
      background: none;
      text-align: left;
      cursor: pointer;
      font-size: 0.85rem;
      color: var(--color-text);
    }
    .card__dropdown-item:hover {
      background: var(--color-bg-hover);
    }
    .card__dropdown-item--danger {
      color: var(--color-danger);
    }
    .card__dropdown-item--danger:hover {
      background: color-mix(in srgb, var(--color-danger) 12%, var(--color-bg-hover));
    }
    .card__meta {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .card__chip {
      display: inline-block;
      padding: 0.15rem 0.5rem;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 500;
    }
    .card__chip--gis {
      background: var(--color-accent-soft);
      color: var(--color-accent);
    }
    .card__chip--explorer {
      background: color-mix(in srgb, var(--color-danger) 15%, var(--color-bg));
      color: var(--color-danger);
    }
    .card__date {
      font-size: 0.8rem;
      color: var(--color-text-muted);
    }
  `,
})
export class DashboardCardComponent {
  readonly dashboard = input.required<Dashboard>();

  protected readonly relativeDate = relativeDate;
  protected readonly isMenuOpen = signal(false);

  private readonly router = inject(Router);
  private readonly store = inject(DashboardStoreService);
  private readonly snackbar = inject(SnackbarService);

  toggleMenu(): void {
    this.isMenuOpen.update((v) => !v);
  }

  navigate(): void {
    this.router.navigate(['/dashboards', this.dashboard().id]);
  }

  rename(): void {
    this.isMenuOpen.set(false);
    const newName = window.prompt('Nuevo nombre:', this.dashboard().name);
    if (newName && newName.trim()) {
      this.store.rename(this.dashboard().id, newName.trim()).subscribe({
        next: () => this.snackbar.show('Tablero renombrado'),
        error: () => this.snackbar.show('Error al renombrar'),
      });
    }
  }

  duplicate(): void {
    this.isMenuOpen.set(false);
    this.store.duplicate(this.dashboard().id).subscribe({
      next: () => this.snackbar.show('Tablero duplicado'),
      error: () => this.snackbar.show('Error al duplicar'),
    });
  }

  deleteDashboard(): void {
    this.isMenuOpen.set(false);
    if (window.confirm(`¿Eliminar "${this.dashboard().name}"?`)) {
      this.store.delete(this.dashboard().id).subscribe({
        next: () => this.snackbar.show('Tablero eliminado'),
        error: () => this.snackbar.show('Error al eliminar'),
      });
    }
  }
}
