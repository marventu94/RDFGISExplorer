import { Component, inject } from '@angular/core';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

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
  imports: [MatDialogModule, MatButtonModule, MatIconModule],
  template: `
    <h2 mat-dialog-title>
      <mat-icon>warning_amber</mat-icon>
      @if (data.dashboardName) {
        ¿Reemplazar "{{ data.dashboardName }}"?
      } @else {
        ¿Reemplazar la vista actual?
      }
    </h2>
    <mat-dialog-content>
      @if (data.dashboardName) {
        <p>
          Tenés abierto el tablero <strong>{{ data.dashboardName }}</strong>. La query
          importada del RDF Explorer reemplaza la consulta, el layout y los filtros:
          los cambios que no hayas guardado se pierden.
        </p>
      } @else {
        <p>
          La vista actual todavía no está guardada como tablero. La query importada
          del RDF Explorer reemplaza la consulta, el layout y los filtros.
        </p>
      }
      <p class="hint">
        Guardar primero abre el diálogo de siempre; podés sobrescribir o guardar una copia.
      </p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="close('cancel')">Cancelar</button>
      <button mat-button (click)="close('replace')">Reemplazar sin guardar</button>
      <button mat-flat-button (click)="close('save-first')">Guardar y reemplazar</button>
    </mat-dialog-actions>
  `,
  styles: [`
    h2 {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    p {
      margin: 0 0 0.75rem;
      line-height: 1.45;
    }
    .hint {
      margin: 0;
      font-size: 0.8125rem;
      opacity: 0.75;
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
