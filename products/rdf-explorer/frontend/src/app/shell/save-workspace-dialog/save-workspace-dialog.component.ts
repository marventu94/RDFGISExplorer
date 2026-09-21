import { Component, inject } from '@angular/core';
import { DialogModule, DialogRef, DIALOG_DATA } from '@angular/cdk/dialog';
import { FormsModule } from '@angular/forms';
import type { SaveWorkspaceDialogData, SaveWorkspaceDialogResult } from './save-workspace-dialog.model';

@Component({
  selector: 'app-save-workspace-dialog',
  standalone: true,
  imports: [DialogModule, FormsModule],
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
    return (this.data.existingNames ?? []).some(n => n.toLowerCase() === trimmed);
  }

  get canSave(): boolean {
    return !!this.name.trim() && !this.hasNameConflict;
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
}
