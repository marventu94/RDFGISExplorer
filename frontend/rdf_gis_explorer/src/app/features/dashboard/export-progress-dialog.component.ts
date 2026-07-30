import { Component, computed, inject, type Signal } from '@angular/core';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import type { ExportProgress } from '@shared/export/result-exporter';

export interface ExportProgressDialogData {
  /** Signal viva: el dueño del export la actualiza página a página. */
  progress: Signal<ExportProgress>;
  /** Total del COUNT del summary si está disponible; null → progreso indeterminado. */
  totalRows: number | null;
}

/** Diálogo de progreso del export completo, con cancelación. */
@Component({
  selector: 'app-export-progress-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, MatProgressBarModule],
  template: `
    <h2 mat-dialog-title>Exportando resultado completo</h2>
    <mat-dialog-content>
      @if (data.totalRows !== null) {
        <mat-progress-bar mode="determinate" [value]="percent()" />
        <p>{{ data.progress().rowsFetched }} de ~{{ data.totalRows }} filas</p>
      } @else {
        <mat-progress-bar mode="indeterminate" />
        <p>{{ data.progress().rowsFetched }} filas…</p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="dialogRef.close('cancel')">Cancelar</button>
    </mat-dialog-actions>
  `,
})
export class ExportProgressDialogComponent {
  protected readonly data = inject<ExportProgressDialogData>(MAT_DIALOG_DATA);
  protected readonly dialogRef = inject(MatDialogRef<ExportProgressDialogComponent>);

  protected readonly percent = computed(() => {
    const total = this.data.totalRows;
    if (!total || total <= 0) return 0;
    return Math.min(100, (this.data.progress().rowsFetched / total) * 100);
  });
}
