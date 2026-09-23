import { TranslatePipe } from '../../core/services/translate.pipe';
import { Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { DashboardStateService } from '@core/services/dashboard-state.service';
import { dashboardHost } from '@rdfgis/platform-bridge';
import { I18nService } from '@core/services/i18n.service';

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
    TranslatePipe,
    MatIconModule,
    FormsModule,
  ],
  templateUrl: './save-dashboard-dialog.component.html',
  styleUrl: './save-dashboard-dialog.component.scss',
})
export class SaveDashboardDialogComponent implements OnInit {
  private readonly dialogRef = inject(MatDialogRef<SaveDashboardDialogComponent, SaveDashboardDialogResult>);
  protected readonly data = inject<SaveDashboardDialogData>(MAT_DIALOG_DATA);
  private readonly dashboardState = inject(DashboardStateService);
  private readonly i18n = inject(I18nService);

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
    dashboardHost().nameExists(
      'gis', trimmed,
      this.data.hasCurrentDashboard ? this.dashboardState.currentDashboardId() : null,
    ).then((conflict) => {
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
      return this.i18n.text('Ya existe un tablero con ese nombre. Se sobreescribirá.');
    }
    return this.i18n.text('Ya existe un tablero con ese nombre. Cambiá el nombre o elegí "Sobreescribir existente".');
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

  protected onCancel(): void {
    this.dialogRef.close();
  }
}
