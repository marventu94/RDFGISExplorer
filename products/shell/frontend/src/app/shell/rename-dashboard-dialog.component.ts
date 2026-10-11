import { AfterViewInit, Component, ElementRef, ViewChild, inject, signal } from '@angular/core';
import { DialogModule, DialogRef, DIALOG_DATA } from '@angular/cdk/dialog';
import { TranslatePipe } from '../core/translate.pipe';
import { DIALOG_STYLES } from './dialog.styles';

export interface RenameDashboardDialogData {
  currentName: string;
}

/**
 * Renombrar un tablero desde la pantalla de inicio. Mismo diseño que
 * "Guardar tablero" de GIS y "Guardar workspace" del RDF Explorer.
 * Cierra con el nombre nuevo (recortado) o sin valor si se cancela.
 */
@Component({
  selector: 'app-rename-dashboard-dialog',
  standalone: true,
  imports: [DialogModule, TranslatePipe],
  template: `
    <form class="dialog-container" (submit)="$event.preventDefault(); save()">
      <h3>{{ 'Renombrar tablero' | translate }}</h3>

      <label class="field">
        <span>{{ 'Nombre del tablero' | translate }}</span>
        <input
          #nameInput
          type="text"
          [value]="name()"
          (input)="name.set(nameInput.value)"
        />
      </label>

      <div class="actions">
        <button class="btn-secondary" type="button" (click)="dialogRef.close()">
          {{ 'Cancelar' | translate }}
        </button>
        <button class="btn-primary" type="submit" [disabled]="!canSave()">
          {{ 'Guardar' | translate }}
        </button>
      </div>
    </form>
  `,
  styles: [DIALOG_STYLES, `.dialog-container { width: min(420px, calc(100vw - 2rem)); }`],
})
export class RenameDashboardDialogComponent implements AfterViewInit {
  readonly data = inject<RenameDashboardDialogData>(DIALOG_DATA);
  readonly dialogRef = inject<DialogRef<string>>(DialogRef);
  protected readonly name = signal(this.data.currentName);

  @ViewChild('nameInput') private readonly nameInput?: ElementRef<HTMLInputElement>;

  ngAfterViewInit(): void {
    // Seleccionado para reemplazarlo de una o editarlo con las flechas.
    this.nameInput?.nativeElement.select();
  }

  protected canSave(): boolean {
    const trimmed = this.name().trim();
    return trimmed.length > 0 && trimmed !== this.data.currentName.trim();
  }

  protected save(): void {
    if (this.canSave()) this.dialogRef.close(this.name().trim());
  }
}
