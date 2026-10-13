import { Component, inject, signal } from '@angular/core';
import { DialogModule, DialogRef, DIALOG_DATA } from '@angular/cdk/dialog';
import type { QueryExportCandidate } from '@rdfgis/platform-bridge';
import { TranslatePipe } from '../core/translate.pipe';
import { DIALOG_STYLES } from './dialog.styles';

export interface QuerySelectionDialogData {
  panelName: string;
  candidates: readonly QueryExportCandidate[];
}

@Component({
  selector: 'app-query-selection-dialog',
  standalone: true,
  imports: [DialogModule, TranslatePipe],
  template: `
    <div class="dialog-container">
      <h3>{{ data.panelName }}</h3>
      <p>{{ 'El panel genera varias consultas separadas. Elegí cuál querés explorar en GIS.' | translate }}</p>

      <div class="options" role="radiogroup" [attr.aria-label]="'Consultas disponibles' | translate">
        @for (candidate of data.candidates; track candidate.id) {
          <button
            type="button"
            class="option"
            role="radio"
            [attr.aria-checked]="selectedId() === candidate.id"
            [class.option--selected]="selectedId() === candidate.id"
            (click)="selectedId.set(candidate.id)"
          >
            <span class="radio" aria-hidden="true"></span>
            <span class="option-label" [attr.title]="candidate.label">{{ candidate.label }}</span>
          </button>
        }
      </div>

      <div class="actions">
        <button type="button" class="btn-secondary" (click)="dialogRef.close()">{{ 'Cancelar' | translate }}</button>
        <button type="button" class="btn-primary" (click)="confirm()">{{ 'Explorar en GIS' | translate }}</button>
      </div>
    </div>
  `,
  styles: [
    DIALOG_STYLES,
    `
      .dialog-container { width: min(520px, calc(100vw - 2rem)); }
      .options { display: grid; gap: 0.5rem; max-height: 320px; overflow: auto; margin-bottom: 1.25rem; }
      .option {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        width: 100%;
        padding: 0.75rem;
        text-align: left;
        font: inherit;
        background: var(--color-bg, #fff);
        color: var(--color-text, #212529);
        border: 1px solid var(--color-border, #dee2e6);
        border-radius: 4px;
        cursor: pointer;
      }
      .option:hover { background: var(--color-bg-hover, #f1f3f5); }
      .option:focus-visible { outline: 2px solid var(--color-accent, #0d6efd); outline-offset: 2px; }
      .option--selected { border-color: var(--color-accent, #0d6efd); background: var(--color-accent-soft, #e7f1ff); }
      .option-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .radio { width: 16px; height: 16px; border: 2px solid var(--color-border-strong, #ced4da); border-radius: 50%; flex: 0 0 auto; }
      .option--selected .radio { border: 5px solid var(--color-accent, #0d6efd); }
    `,
  ],
})
export class QuerySelectionDialogComponent {
  readonly data = inject<QuerySelectionDialogData>(DIALOG_DATA);
  readonly dialogRef = inject<DialogRef<QueryExportCandidate>>(DialogRef);
  readonly selectedId = signal(this.data.candidates[0]?.id ?? '');

  confirm(): void {
    const selected = this.data.candidates.find(candidate => candidate.id === this.selectedId());
    if (selected) this.dialogRef.close(selected);
  }
}
