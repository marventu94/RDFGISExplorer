import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';

export interface SaveDashboardDialogData {
  currentName: string | null;
  hasCurrentDashboard: boolean;
}

export interface SaveDashboardDialogResult {
  name: string;
  mode: 'overwrite' | 'copy';
}

@Component({
  selector: 'app-save-dashboard-dialog',
  standalone: true,
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatRadioModule,
    FormsModule,
  ],
  templateUrl: './save-dashboard-dialog.component.html',
  styleUrl: './save-dashboard-dialog.component.scss',
})
export class SaveDashboardDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<SaveDashboardDialogComponent, SaveDashboardDialogResult>);
  protected readonly data = inject<SaveDashboardDialogData>(MAT_DIALOG_DATA);

  protected readonly name = signal(this.data.currentName ?? '');
  protected readonly mode = signal<'overwrite' | 'copy'>('overwrite');

  protected get isValid(): boolean {
    return this.name().trim().length > 0;
  }

  protected get showModeOptions(): boolean {
    return this.data.hasCurrentDashboard;
  }

  protected onSave(): void {
    if (!this.isValid) return;
    const result: SaveDashboardDialogResult = {
      name: this.name().trim(),
      mode: this.mode(),
    };
    this.dialogRef.close(result);
  }
}
