import { Component, inject } from '@angular/core';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';

export interface ExportCapDialogData {
  /** Filas ya descargadas al llegar al tope. */
  rows: number;
  maxRows: number;
}

export type ExportCapAction = 'partial' | 'copy' | 'cancel';

/**
 * Diálogo del tope de exportación: el usuario decide si se lleva el CSV
 * parcial (marcado como PARCIAL en el encabezado), copia la query para un
 * volcado masivo por otro canal, o cancela.
 */
@Component({
  selector: 'app-export-cap-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>Tope de exportación alcanzado</h2>
    <mat-dialog-content>
      <p>
        El resultado supera el tope de {{ data.maxRows }} filas exportables. Se
        descargaron las primeras {{ data.rows }}.
      </p>
      <p>
        Podés exportar el CSV parcial (queda marcado como PARCIAL en el
        encabezado) o copiar la query para hacer el volcado completo por otro
        canal.
      </p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="close('cancel')">Cancelar</button>
      <button mat-button (click)="close('copy')">Copiar query</button>
      <button mat-flat-button color="primary" (click)="close('partial')">
        Exportar parcial
      </button>
    </mat-dialog-actions>
  `,
})
export class ExportCapDialogComponent {
  protected readonly data = inject<ExportCapDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<ExportCapDialogComponent>);

  protected close(action: ExportCapAction): void {
    this.dialogRef.close(action);
  }
}
