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
      box-sizing: border-box;
      padding: 1.5rem;
      background: var(--explorer-panel-bg, var(--color-bg-elevated, #fff));
      color: var(--explorer-text, var(--color-text, #212529));
      border: 1px solid var(--explorer-panel-border, var(--color-border, #dee2e6));
      border-radius: 8px;
      box-shadow: var(--shadow-lg, 0 4px 12px rgb(0 0 0 / 18%));
      min-width: 320px;
      max-width: 480px;
    }
    h3 {
      margin: 0 0 0.75rem;
      font-size: 1.125rem;
    }
    p {
      margin: 0 0 1rem;
      font-size: 0.9375rem;
      line-height: 1.45;
      color: var(--explorer-text, var(--color-text, #212529));
    }
    .detail {
      margin: 0 0 1rem;
      padding: 0.5rem 0.75rem;
      border: 1px solid var(--explorer-panel-border, var(--color-border, #dee2e6));
      background: var(--explorer-input-bg, var(--color-bg, #fff));
      color: var(--explorer-text, var(--color-text, #212529));
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
      gap: 0.75rem;
    }
    .actions button {
      padding: 0.5rem 1rem;
      border-radius: 4px;
      border: 1px solid var(--explorer-panel-border, var(--color-border, #dee2e6));
      background: var(--explorer-input-bg, var(--color-bg, #fff));
      color: var(--explorer-text, var(--color-text, #212529));
      cursor: pointer;
      font-size: 0.875rem;
      font: inherit;
    }
    .actions button:hover {
      background: var(--explorer-toolbar-btn-hover-bg, var(--color-bg-hover, #f1f3f5));
    }
    .actions button:focus-visible {
      outline: 2px solid var(--color-accent, var(--explorer-link, #0d6efd));
      outline-offset: 2px;
    }
    .btn-primary {
      border-color: var(--color-accent, var(--explorer-link, #0d6efd));
      background: var(--color-accent, var(--explorer-link, #0d6efd));
      color: var(--color-text-on-accent, #fff);
    }
    .btn-primary:hover {
      border-color: var(--color-accent-hover, #0b5ed7);
      background: var(--color-accent-hover, #0b5ed7);
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
