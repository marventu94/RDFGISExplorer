import { Component, inject } from '@angular/core';
import { DialogModule, DialogRef, DIALOG_DATA } from '@angular/cdk/dialog';
import { I18nService } from '../core/i18n.service';
import { DIALOG_STYLES } from './dialog.styles';

export interface MessageDialogAction {
  label: string;
  /** Valor con el que cierra el diálogo. */
  value: string;
  /** Botón destacado (el de la acción principal). */
  primary?: boolean;
  /** Acción destructiva (eliminar): botón destacado en rojo. */
  danger?: boolean;
}

export interface MessageDialogData {
  title: string;
  message: string;
  /** Botones; por defecto uno solo de cerrar. */
  actions?: readonly MessageDialogAction[];
}

/**
 * Popup para decisiones que no pueden pasar desapercibidas. El snackbar del
 * shell sirve para confirmaciones (se va solo); cuando hay algo que perder, el
 * usuario tiene que elegir.
 *
 * Usa el mismo diseño que los diálogos de GIS y del RDF Explorer (ver
 * `DIALOG_STYLES`): son bundles distintos, así que se comparte el estilo.
 */
@Component({
  selector: 'app-message-dialog',
  standalone: true,
  imports: [DialogModule],
  template: `
    <div class="dialog-container">
      <h3>{{ data.title }}</h3>
      <p>{{ data.message }}</p>
      <div class="actions">
        @for (action of actions; track action.value) {
          <button
            type="button"
            [class.btn-primary]="action.primary && !action.danger"
            [class.btn-danger]="action.danger"
            [class.btn-secondary]="!action.primary && !action.danger"
            (click)="close(action.value)"
          >
            {{ action.label }}
          </button>
        }
      </div>
    </div>
  `,
  styles: [DIALOG_STYLES],
})
export class MessageDialogComponent {
  protected readonly data = inject<MessageDialogData>(DIALOG_DATA);
  private readonly dialogRef = inject<DialogRef<string>>(DialogRef);
  private readonly i18n = inject(I18nService);

  protected get actions(): readonly MessageDialogAction[] {
    return this.data.actions ?? [{ label: this.i18n.text('Entendido'), value: 'ok', primary: true }];
  }

  protected close(value: string): void {
    this.dialogRef.close(value);
  }
}
