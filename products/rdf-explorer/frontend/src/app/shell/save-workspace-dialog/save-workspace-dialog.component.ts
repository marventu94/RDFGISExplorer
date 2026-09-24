import { TranslatePipe } from '../../core/translate.pipe';
import { Component, inject } from '@angular/core';
import { DialogModule, DialogRef, DIALOG_DATA } from '@angular/cdk/dialog';
import { FormsModule } from '@angular/forms';
import type { SaveWorkspaceDialogData, SaveWorkspaceDialogResult } from './save-workspace-dialog.model';

@Component({
  selector: 'app-save-workspace-dialog',
  standalone: true,
  imports: [TranslatePipe, DialogModule, FormsModule],
  templateUrl: './save-workspace-dialog.component.html',
  styleUrl: './save-workspace-dialog.component.scss',
})
export class SaveWorkspaceDialogComponent {
  readonly dialogRef = inject(DialogRef<SaveWorkspaceDialogResult>);
  readonly data = inject<SaveWorkspaceDialogData>(DIALOG_DATA);

  name = this.data.currentName ?? '';
  mode: 'overwrite' | 'copy' = !!this.data.currentId && !!this.data.currentName ? 'overwrite' : 'copy';

  get canOverwrite(): boolean {
    return !!this.data.currentId && !!this.data.currentName;
  }

  get hasNameConflict(): boolean {
    const trimmed = this.name.trim().toLowerCase();
    if (!trimmed) return false;
    if (
      this.mode === 'overwrite'
      && trimmed === this.data.currentName?.trim().toLowerCase()
    ) {
      return false;
    }
    return (this.data.existingNames ?? []).some(n => n.trim().toLowerCase() === trimmed);
  }

  get canSave(): boolean {
    return !!this.name.trim() && !this.hasNameConflict;
  }

  setMode(mode: 'overwrite' | 'copy'): void {
    this.mode = mode;
    if (mode === 'overwrite') {
      this.name = this.data.currentName?.trim() ?? this.name.trim();
      return;
    }

    if (this.canOverwrite) {
      this.name = this.nextCopyName();
    }
  }

  save(): void {
    if (!this.canSave) return;
    const result: SaveWorkspaceDialogResult = {
      name: this.name.trim(),
      overwriteId: this.mode === 'overwrite' ? this.data.currentId : undefined,
    };
    this.dialogRef.close(result);
  }

  cancel(): void {
    this.dialogRef.close(undefined);
  }

  private nextCopyName(): string {
    const baseName = this.data.currentName?.trim() || this.name.trim() || 'Workspace';
    const existing = new Set(
      (this.data.existingNames ?? []).map(name => name.trim().toLowerCase()),
    );
    let candidate = `${baseName} copy`;
    let copyNumber = 2;
    while (existing.has(candidate.toLowerCase())) {
      candidate = `${baseName} ${copyNumber} copy`;
      copyNumber += 1;
    }
    return candidate;
  }
}
