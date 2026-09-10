import { Component, inject } from '@angular/core';
import { MatDialogModule, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

export interface ErrorDialogData {
  title: string;
  message: string;
  /** Mensaje crudo del backend / del parser, monoespaciado. */
  detail?: string;
}

/**
 * Popup de error para la ejecución de queries. El snackbar se va solo y, con
 * el editor colapsado o una query importada que corre sola (handoff del RDF
 * Explorer), el usuario se quedaba sin ninguna señal de que algo falló.
 */
@Component({
  selector: 'app-error-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, MatIconModule],
  template: `
    <h2 mat-dialog-title>
      <mat-icon color="warn">error_outline</mat-icon>
      {{ data.title }}
    </h2>
    <mat-dialog-content>
      <p>{{ data.message }}</p>
      @if (data.detail) {
        <pre class="detail">{{ data.detail }}</pre>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-flat-button mat-dialog-close>Cerrar</button>
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
    .detail {
      margin: 0;
      padding: 0.5rem 0.75rem;
      background: rgba(0, 0, 0, 0.06);
      border-radius: 4px;
      font-size: 0.8125rem;
      max-height: 200px;
      overflow: auto;
      white-space: pre-wrap;
      word-break: break-word;
    }
  `],
})
export class ErrorDialogComponent {
  readonly data = inject<ErrorDialogData>(MAT_DIALOG_DATA);
}
