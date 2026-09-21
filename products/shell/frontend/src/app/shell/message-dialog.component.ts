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
  /** Botones; por defecto uno solo de cerrar. */
  actions?: readonly MessageDialogAction[];
}

const DEFAULT_ACTIONS: readonly MessageDialogAction[] = [
  { label: 'Entendido', value: 'ok', primary: true },
];

/**
 * Popup para decisiones que no pueden pasar desapercibidas. El snackbar del
 * shell sirve para confirmaciones (se va solo); cuando hay algo que perder, el
 * usuario tiene que elegir.
 *
 * Es el gemelo del diálogo del RDF Explorer: los dos remotes y el host son
 * bundles distintos, así que el componente no se puede compartir.
 */
@Component({
  selector: 'app-message-dialog',
  standalone: true,
  imports: [DialogModule],
  template: `
    <div class="dialog">
      <h3>{{ data.title }}</h3>
      <p>{{ data.message }}</p>
      <div class="actions">
        @for (action of actions; track action.value) {
          <button
            type="button"
            [class.btn-primary]="action.primary"
            [class.btn-secondary]="!action.primary"
            (click)="close(action.value)"
          >
            {{ action.label }}
          </button>
        }
      </div>
    </div>
  `,
  styles: `
    .dialog {
      padding: 1.5rem;
      background: var(--color-bg-elevated, #fff);
      color: var(--color-text, #1a1a1a);
      border-radius: 8px;
      min-width: 340px;
      max-width: 520px;
      border-top: 4px solid var(--color-accent, #1f77b4);
      box-shadow: 0 8px 28px rgba(0, 0, 0, 0.2);
    }
    h3 {
      margin: 0 0 0.75rem;
      font-size: 1.125rem;
    }
    p {
      margin: 0 0 1.25rem;
      line-height: 1.5;
      color: var(--color-text-muted, #555);
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      gap: 0.5rem;
      flex-wrap: wrap;
    }
    button {
      padding: 0.5rem 1rem;
      border-radius: 6px;
      font-size: 0.9rem;
      cursor: pointer;
      border: 1px solid var(--color-border, #ddd);
    }
    .btn-primary {
      background: var(--color-accent, #1f77b4);
      color: var(--color-text-on-accent, #fff);
      border-color: var(--color-accent, #1f77b4);
    }
    .btn-secondary {
      background: var(--color-bg-elevated, #fff);
      color: var(--color-text, #1a1a1a);
    }
    button:hover {
      filter: brightness(0.95);
    }
  `,
})
export class MessageDialogComponent {
  protected readonly data = inject<MessageDialogData>(DIALOG_DATA);
  private readonly dialogRef = inject<DialogRef<string>>(DialogRef);

  protected get actions(): readonly MessageDialogAction[] {
    return this.data.actions ?? DEFAULT_ACTIONS;
  }

  protected close(value: string): void {
    this.dialogRef.close(value);
  }
}
