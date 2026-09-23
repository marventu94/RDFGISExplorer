import { Component, inject, signal } from '@angular/core';
import { DialogModule, DialogRef, DIALOG_DATA } from '@angular/cdk/dialog';
import type { QueryExportCandidate } from '@rdfgis/platform-bridge';

export interface QuerySelectionDialogData {
  candidates: readonly QueryExportCandidate[];
}

@Component({
  selector: 'app-query-selection-dialog',
  standalone: true,
  imports: [DialogModule],
  template: `
    <div class="dialog">
      <h3>Elegí una consulta</h3>
      <p>El panel genera varias consultas separadas. Elegí cuál querés explorar en GIS.</p>

      <div class="options" role="radiogroup" aria-label="Consultas disponibles">
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
        <button type="button" class="btn-secondary" (click)="dialogRef.close()">Cancelar</button>
        <button type="button" class="btn-primary" (click)="confirm()">Explorar en GIS</button>
      </div>
    </div>
  `,
  styles: `
    .dialog {
      padding: 1.5rem;
      background: var(--color-bg-elevated, #fff);
      color: var(--color-text, #1a1a1a);
      border-radius: 8px;
      width: min(520px, calc(100vw - 2rem));
      border-top: 4px solid var(--color-accent, #1f77b4);
      box-shadow: 0 8px 28px rgba(0, 0, 0, 0.2);
    }
    h3 { margin: 0 0 0.75rem; font-size: 1.125rem; }
    p { margin: 0 0 1rem; line-height: 1.5; color: var(--color-text-muted, #555); }
    .options { display: grid; gap: 0.5rem; max-height: 320px; overflow: auto; margin-bottom: 1.25rem; }
    .option {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      width: 100%;
      padding: 0.75rem;
      text-align: left;
      background: var(--color-bg-elevated, #fff);
      color: var(--color-text, #1a1a1a);
      border: 1px solid var(--color-border, #ddd);
      border-radius: 6px;
      cursor: pointer;
    }
    .option--selected { border-color: var(--color-accent, #1f77b4); background: var(--color-bg-active, #eef6ff); }
    .option-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .radio { width: 16px; height: 16px; border: 2px solid var(--color-border, #aaa); border-radius: 50%; flex: 0 0 auto; }
    .option--selected .radio { border: 5px solid var(--color-accent, #1f77b4); }
    .actions { display: flex; justify-content: flex-end; gap: 0.5rem; flex-wrap: wrap; }
    .actions button { padding: 0.5rem 1rem; border-radius: 6px; font-size: 0.9rem; cursor: pointer; border: 1px solid var(--color-border, #ddd); }
    .btn-primary { background: var(--color-accent, #1f77b4); color: var(--color-text-on-accent, #fff); border-color: var(--color-accent, #1f77b4) !important; }
    .btn-secondary { background: var(--color-bg-elevated, #fff); color: var(--color-text, #1a1a1a); }
    button:hover { filter: brightness(0.95); }
  `,
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
