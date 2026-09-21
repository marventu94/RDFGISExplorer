import { Component, inject } from '@angular/core';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { TranslatePipe } from '@core/services/translate.pipe';

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
  imports: [MatDialogModule, MatButtonModule, TranslatePipe],
  template: `
    <h2 mat-dialog-title>{{ 'Tope de exportación alcanzado' | translate }}</h2>
    <mat-dialog-content>
      <p>
        {{ 'El resultado supera el tope de {maxRows} filas exportables. Se descargaron las primeras {rows}.' | translate: { maxRows: data.maxRows, rows: data.rows } }}
      </p>
      <p>
        {{ 'Podés exportar el archivo parcial (queda marcado como PARCIAL) o copiar la query para hacer el volcado completo por otro canal.' | translate }}
      </p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="close('cancel')">{{ 'Cancelar' | translate }}</button>
      <button mat-button (click)="close('copy')">{{ 'Copiar query' | translate }}</button>
      <button mat-flat-button color="primary" (click)="close('partial')">
        {{ 'Exportar parcial' | translate }}
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
