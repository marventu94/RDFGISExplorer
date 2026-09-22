import { Component, inject } from '@angular/core';
import { DialogModule, DialogRef, DIALOG_DATA } from '@angular/cdk/dialog';

export interface MessageDialogAction {
  label: string;
  /** Valor con el que cierra el diálogo. */
  value: string;
  /** Botón destacado (el de la acción principal). */
  primary?: boolean;
}

export interface MessageDialogData {
  title: string;
  message: string;
  /** Texto monoespaciado opcional (mensaje crudo del backend, query, etc.). */
  detail?: string;
  kind?: 'error' | 'info';
  /** Botones; por defecto uno solo de cerrar. */
  actions?: readonly MessageDialogAction[];
}

const DEFAULT_ACTIONS: readonly MessageDialogAction[] = [
  { label: 'Entendido', value: 'ok', primary: true },
];

/**
 * Popup de un solo botón para avisos que NO pueden pasar desapercibidos.
 * El snackbar de main.component sirve para confirmaciones (se va solo en 3s);
 * cuando una acción falla y no pasa nada más en pantalla —el caso de "Explorar
 * en GIS"— hace falta algo que el usuario tenga que cerrar.
 */
@Component({
  selector: 'app-message-dialog',
  standalone: true,
  imports: [DialogModule],
  template: `
    <div class="dialog-container" [class.is-error]="data.kind !== 'info'">
      <h3>{{ data.title }}</h3>
      <p>{{ data.message }}</p>
      @if (data.detail) {
        <pre class="detail">{{ data.detail }}</pre>
      }
      <div class="actions">
        @for (action of actions; track action.value) {
          <button
            type="button"
            [class.btn-primary]="action.primary"
            [class.btn-secondary]="!action.primary"
            (click)="close(action.value)"
          >{{ action.label }}</button>
        }
      </div>
    </div>
  `,
  styles: [`
    .dialog-container {
      padding: 1.5rem;
      background: var(--explorer-panel-bg);
      color: var(--explorer-text);
      border-radius: 6px;
      min-width: 320px;
      max-width: 480px;
      border-top: 4px solid #1f77b4;
    }
    .dialog-container.is-error {
      border-top-color: #c0392b;
    }
    h3 {
      margin: 0 0 0.75rem;
      font-size: 1.125rem;
    }
    p {
      margin: 0 0 1rem;
      font-size: 0.9375rem;
      line-height: 1.45;
      color: var(--explorer-text);
    }
    .detail {
      margin: 0 0 1rem;
      padding: 0.5rem 0.75rem;
      background: var(--explorer-bg);
      border-radius: 4px;
      font-size: 0.8125rem;
      max-height: 180px;
      overflow: auto;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      flex-wrap: wrap;
      gap: 0.5rem;
    }
    .actions button {
      padding: 0.5rem 1rem;
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.875rem;
    }
    .btn-primary {
      border: 1px solid #1f77b4;
      background: #1f77b4;
      color: #fff;
    }
    .btn-secondary {
      border: 1px solid var(--explorer-panel-border);
      background: var(--explorer-bg);
      color: var(--explorer-text);
    }
  `],
})
export class MessageDialogComponent {
  readonly dialogRef = inject(DialogRef<string>);
  readonly data = inject<MessageDialogData>(DIALOG_DATA);

  get actions(): readonly MessageDialogAction[] {
    return this.data.actions?.length ? this.data.actions : DEFAULT_ACTIONS;
  }

  close(value: string): void {
    this.dialogRef.close(value);
  }
}
