import { Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe } from '@core/services/translate.pipe';

export interface OverwriteDashboardDialogData {
  /** Nombre del tablero abierto, o null si la vista no está guardada. */
  dashboardName: string | null;
}

export type OverwriteDashboardAction = 'save-first' | 'replace' | 'cancel';

/**
 * Aviso previo a reemplazar lo que hay en el GIS con una query importada del
 * RDF Explorer. Sin este paso el handoff pisaba el tablero abierto sin decir
 * nada y no había forma de recuperar los cambios sin guardar.
 */
@Component({
  selector: 'app-overwrite-dashboard-dialog',
  standalone: true,
  imports: [MatIconModule, TranslatePipe],
  template: `
    <div class="dialog-container">
      <h2>
        <mat-icon>warning_amber</mat-icon>
        @if (data.dashboardName) {
          {{ '¿Reemplazar "{name}"?' | translate: { name: data.dashboardName } }}
        } @else {
          {{ '¿Reemplazar la vista actual?' | translate }}
        }
      </h2>
      <div class="content">
      @if (data.dashboardName) {
        <p>
          {{ 'Tenés abierto el tablero' | translate }} <strong>{{ data.dashboardName }}</strong>.
          {{ 'La query importada del RDF Explorer reemplaza la consulta, el layout y los filtros: los cambios que no hayas guardado se pierden.' | translate }}
        </p>
      } @else {
        <p>
          {{ 'La vista actual todavía no está guardada como tablero. La query importada del RDF Explorer reemplaza la consulta, el layout y los filtros.' | translate }}
        </p>
      }
      <p class="hint">
        {{ 'Guardar primero abre el diálogo de siempre; podés sobrescribir o guardar una copia.' | translate }}
      </p>
      </div>
      <div class="actions">
        <button class="btn-secondary" type="button" (click)="close('cancel')">{{ 'Cancelar' | translate }}</button>
        <button class="btn-secondary" type="button" (click)="close('replace')">{{ 'Reemplazar sin guardar' | translate }}</button>
        <button class="btn-primary" type="button" (click)="close('save-first')">{{ 'Guardar y reemplazar' | translate }}</button>
      </div>
    </div>
  `,
  styles: [`
    .dialog-container {
      box-sizing: border-box;
      min-width: 320px;
      max-width: 520px;
      padding: 1.5rem;
      border: 1px solid var(--gis-panel-border, var(--color-border, #dee2e6));
      border-radius: 8px;
      background: var(--gis-panel-bg, var(--color-bg-elevated, #fff));
      color: var(--gis-text, var(--color-text, #212529));
      box-shadow: var(--shadow-lg, 0 4px 12px rgb(0 0 0 / 18%));
    }
    h2 {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin: 0 0 1rem;
      font-size: 1.125rem;
      font-weight: 500;
    }
    h2 mat-icon {
      color: var(--gis-warning-text, #8d4b00);
    }
    p {
      margin: 0 0 0.75rem;
      line-height: 1.45;
    }
    .hint {
      margin: 0 0 1rem;
      font-size: 0.8125rem;
      color: var(--gis-text-muted, var(--color-text-muted, #6c757d));
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      flex-wrap: wrap;
      gap: 0.75rem;
    }
    .actions button {
      padding: 0.5rem 1rem;
      border: 1px solid var(--gis-panel-border, var(--color-border, #dee2e6));
      border-radius: 4px;
      background: var(--gis-input-bg, var(--color-bg, #fff));
      color: var(--gis-text, var(--color-text, #212529));
      cursor: pointer;
      font: inherit;
      font-size: 0.875rem;
    }
    .actions button:hover {
      background: var(--color-bg-hover, var(--gis-dashboard-bg, #f1f3f5));
    }
    .actions button:focus-visible {
      outline: 2px solid var(--gis-accent, var(--color-accent, #0d6efd));
      outline-offset: 2px;
    }
    .actions .btn-primary {
      border-color: var(--gis-accent, var(--color-accent, #0d6efd));
      background: var(--gis-accent, var(--color-accent, #0d6efd));
      color: var(--color-text-on-accent, #fff);
    }
    .actions .btn-primary:hover {
      border-color: var(--color-accent-hover, var(--gis-accent-border, #0b5ed7));
      background: var(--color-accent-hover, var(--gis-accent-border, #0b5ed7));
    }
  `],
})
export class OverwriteDashboardDialogComponent {
  private readonly dialogRef =
    inject(MatDialogRef<OverwriteDashboardDialogComponent, OverwriteDashboardAction>);
  readonly data = inject<OverwriteDashboardDialogData>(MAT_DIALOG_DATA);

  close(action: OverwriteDashboardAction): void {
    this.dialogRef.close(action);
  }
}
