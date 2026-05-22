import { Component, inject } from '@angular/core';
import {
  MatDialogRef,
  MatDialogModule,
  MAT_DIALOG_DATA,
} from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';

export interface DuplicateDecisionDialogData {
  otherUri: string;
  action: 'confirm' | 'reject';
}

@Component({
  selector: 'app-duplicate-decision-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>Confirmar duplicado</h2>
    <mat-dialog-content>
      <p>
        ¿Estás seguro de que este nodo es un duplicado de
        <strong>{{ data.otherUri }}</strong
        >?
      </p>
      <p class="dialog-note">
        Esta acción marca ambos nodos como duplicados confirmados.
      </p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button [mat-dialog-close]="false">Cancelar</button>
      <button mat-flat-button color="primary" [mat-dialog-close]="true">
        Confirmar
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .dialog-note {
        font-size: 12px;
        color: rgba(0, 0, 0, 0.55);
        margin-top: 8px;
      }
    `,
  ],
})
export class DuplicateDecisionDialogComponent {
  readonly dialogRef = inject(
    MatDialogRef<DuplicateDecisionDialogComponent>,
  );
  readonly data = inject<DuplicateDecisionDialogData>(MAT_DIALOG_DATA);
}
