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
  mode: 'overwrite' | 'copy' = 'copy';

  get canOverwrite(): boolean {
    return !!this.data.currentId && !!this.data.currentName;
  }

  save(): void {
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
