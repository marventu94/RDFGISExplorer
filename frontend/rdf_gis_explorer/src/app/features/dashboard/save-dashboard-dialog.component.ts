import { Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { DashboardPersistenceService } from '@core/services/dashboard-persistence.service';

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
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatRadioModule,
    FormsModule,
  ],
  templateUrl: './save-dashboard-dialog.component.html',
  styleUrl: './save-dashboard-dialog.component.scss',
})
export class SaveDashboardDialogComponent implements OnInit {
  private readonly dialogRef = inject(MatDialogRef<SaveDashboardDialogComponent, SaveDashboardDialogResult>);
  protected readonly data = inject<SaveDashboardDialogData>(MAT_DIALOG_DATA);
  private readonly persistence = inject(DashboardPersistenceService);

  protected readonly name = signal(this.data.currentName ?? '');
  protected readonly mode = signal<'overwrite' | 'copy'>('overwrite');
  protected readonly hasConflict = signal(false);
  protected readonly checking = signal(false);

  ngOnInit(): void {
    if (this.data.hasCurrentDashboard) {
      this.mode.set('overwrite');
      if (this.name()) {
        this.checkForConflict();
      }
    }
  }

  protected onNameChange(value: string): void {
    this.name.set(value);
    this.hasConflict.set(false);
    if (value.trim().length > 0) {
      this.checkForConflict();
    }
  }

  private checkForConflict(): void {
    const trimmed = this.name().trim();
    if (!trimmed) return;

    this.checking.set(true);
    this.persistence
      .checkNameConflict(
        trimmed,
        this.data.hasCurrentDashboard ? this.persistence.currentDashboardId() : null,
      )
      .subscribe((conflict) => {
        this.hasConflict.set(conflict);
        this.checking.set(false);
      });
  }

  protected get isValid(): boolean {
    const trimmed = this.name().trim();
    return trimmed.length > 0;
  }

  protected get canSave(): boolean {
    if (!this.isValid) return false;
    if (this.hasConflict() && this.mode() === 'copy') return false;
    return true;
  }

  protected get conflictMessage(): string {
    if (!this.hasConflict()) return '';
    if (this.mode() === 'overwrite') {
      return 'Ya existe un tablero con ese nombre. Se sobreescribirá.';
    }
    return 'Ya existe un tablero con ese nombre. Cambiá el nombre o elegí "Sobreescribir existente".';
  }

  protected get showModeOptions(): boolean {
    return this.data.hasCurrentDashboard;
  }

  protected onSave(): void {
    if (!this.isValid) return;
    if (this.hasConflict() && this.mode() === 'copy') return;
    const result: SaveDashboardDialogResult = {
      name: this.name().trim(),
      mode: this.data.hasCurrentDashboard ? this.mode() : 'copy',
    };
    this.dialogRef.close(result);
  }
}
