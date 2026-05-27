import { Component, input, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { DashboardStoreService } from '../../core/dashboard-store.service';
import { SnackbarService } from '../../core/snackbar.service';
import { relativeDate, type Dashboard } from '../../core/dashboard.model';

@Component({
  selector: 'app-dashboard-card',
  standalone: true,
  template: `
    <div class="card" (click)="navigate()">
      <div class="card__header">
        <span class="card__name">{{ dashboard().name }}</span>
        <div class="card__menu" (click)="$event.stopPropagation()">
          <button class="card__menu-trigger" (click)="toggleMenu()">⋯</button>
          @if (isMenuOpen()) {
            <div class="card__dropdown">
              <button class="card__dropdown-item" (click)="rename()">Renombrar</button>
              <button class="card__dropdown-item" (click)="duplicate()">Duplicar</button>
              <button class="card__dropdown-item card__dropdown-item--danger" (click)="deleteDashboard()">Eliminar</button>
            </div>
          }
        </div>
      </div>
      <div class="card__meta">
        <span
          class="card__chip"
          [class.card__chip--gis]="dashboard().kind === 'gis'"
          [class.card__chip--explorer]="dashboard().kind === 'explorer'"
        >
          {{ dashboard().kind === 'gis' ? 'GIS' : 'Explorer' }}
        </span>
        <span class="card__date">{{ relativeDate(dashboard().updatedAt) }}</span>
      </div>
    </div>
  `,
  styles: `
    .card {
      background: #fff;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      padding: 1rem;
      cursor: pointer;
      transition: box-shadow 0.2s, border-color 0.2s;
    }
    .card:hover {
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      border-color: #ccc;
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
      color: #333;
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
      color: #666;
      line-height: 1;
    }
    .card__menu-trigger:hover {
      background: #f0f0f0;
      color: #333;
    }
    .card__dropdown {
      position: absolute;
      right: 0;
      top: 100%;
      background: #fff;
      border: 1px solid #e0e0e0;
      border-radius: 6px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
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
      color: #333;
    }
    .card__dropdown-item:hover {
      background: #f5f5f5;
    }
    .card__dropdown-item--danger {
      color: #d32f2f;
    }
    .card__dropdown-item--danger:hover {
      background: #fef2f2;
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
      background: #e3f2fd;
      color: #1565c0;
    }
    .card__chip--explorer {
      background: #fce4ec;
      color: #c62828;
    }
    .card__date {
      font-size: 0.8rem;
      color: #888;
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
