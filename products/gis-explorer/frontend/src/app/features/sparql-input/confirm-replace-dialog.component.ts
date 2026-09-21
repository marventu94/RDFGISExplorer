import { Component, inject } from '@angular/core';
import {
  MatDialogRef,
  MatDialogModule,
} from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { TranslatePipe } from '@core/services/translate.pipe';

@Component({
  selector: 'app-confirm-replace-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, TranslatePipe],
  template: `
    <h2 mat-dialog-title>{{ '¿Reemplazar query actual?' | translate }}</h2>
    <mat-dialog-content>
      <p>{{ 'El editor tiene contenido. Si cargás otra query se perderá lo que escribiste.' | translate }}</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>{{ 'Cancelar' | translate }}</button>
      <button mat-flat-button [mat-dialog-close]="true">{{ 'Reemplazar' | translate }}</button>
    </mat-dialog-actions>
  `,
})
export class ConfirmReplaceDialogComponent {
  dialogRef = inject(MatDialogRef<ConfirmReplaceDialogComponent>);
}
