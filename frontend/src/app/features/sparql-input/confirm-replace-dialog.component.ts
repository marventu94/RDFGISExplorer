import { Component, inject } from '@angular/core';
import {
  MatDialogRef,
  MatDialogModule,
} from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-confirm-replace-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>¿Reemplazar query actual?</h2>
    <mat-dialog-content>
      <p>El editor tiene contenido. Si cargás otra query se perderá lo que escribiste.</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancelar</button>
      <button mat-flat-button [mat-dialog-close]="true">Reemplazar</button>
    </mat-dialog-actions>
  `,
})
export class ConfirmReplaceDialogComponent {
  dialogRef = inject(MatDialogRef<ConfirmReplaceDialogComponent>);
}
