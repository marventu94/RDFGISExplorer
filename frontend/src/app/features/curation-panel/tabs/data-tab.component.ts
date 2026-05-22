import {
  Component,
  input,
  output,
  inject,
  signal,
  computed,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { FormsModule } from '@angular/forms';

import { CurationService } from '@core/services/curation.service';
import type { NormalizedNode, CurationRecord, BindingValue } from '@shared/models';

interface AttributeRow {
  field: string;
  rawValue: string;
  rawBinding: BindingValue;
  scriptValue: string | null;
  manualValue: string | null;
  status: CurationRecord['status'] | null;
  recordId: number | null;
  existingRawValue: string | null;
  existingScriptValue: string | null;
}

@Component({
  selector: 'app-data-tab',
  standalone: true,
  imports: [
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatSnackBarModule,
    MatTooltipModule,
    FormsModule,
  ],
  templateUrl: './data-tab.component.html',
  styleUrl: './data-tab.component.scss',
})
export class DataTabComponent {
  private readonly curationService = inject(CurationService);
  private readonly snackBar = inject(MatSnackBar);

  readonly node = input<NormalizedNode | null>(null);
  readonly records = input<CurationRecord[]>([]);
  readonly recordChanged = output<void>();

  protected readonly editingField = signal<string | null>(null);
  protected readonly editingValue = signal('');
  protected readonly displayedColumns: string[] = [
    'field',
    'rawValue',
    'scriptValue',
    'manualValue',
    'status',
    'actions',
  ];

  protected readonly rows = computed<AttributeRow[]>(() => {
    const n = this.node();
    if (!n) return [];

    const recs = this.records();
    const recordByField = new Map<string, CurationRecord>();
    for (const r of recs) {
      recordByField.set(r.fieldName, r);
    }

    return Object.entries(n.attributes).map(([field, binding]) => {
      const record = recordByField.get(field);
      return {
        field,
        rawValue: this.bindingToRawString(binding),
        rawBinding: binding,
        scriptValue: record?.scriptValue ?? null,
        manualValue: record?.manualValue ?? null,
        status: record?.status ?? null,
        recordId: record?.id ?? null,
        existingRawValue: record?.rawValue ?? null,
        existingScriptValue: record?.scriptValue ?? null,
      };
    });
  });

  protected effectiveValue(row: AttributeRow): string {
    return row.manualValue ?? row.scriptValue ?? row.rawValue;
  }

  protected statusLabel(status: CurationRecord['status'] | null): string {
    if (!status) return '—';
    switch (status) {
      case 'validated':
        return 'Validado';
      case 'corrected':
        return 'Corregido';
      case 'pending':
        return 'Pendiente';
    }
  }

  protected startEdit(row: AttributeRow): void {
    this.editingField.set(row.field);
    this.editingValue.set(this.effectiveValue(row));
  }

  protected cancelEdit(): void {
    this.editingField.set(null);
    this.editingValue.set('');
  }

  protected async saveEdit(row: AttributeRow): Promise<void> {
    const newValue = this.editingValue();
    const nodeUri = this.node()?.uri;
    if (!nodeUri) return;

    try {
      if (row.recordId) {
        await firstValueFrom(
          this.curationService.update(row.recordId, {
            manualValue: newValue,
            status: 'corrected',
          }),
        );
      } else {
        await firstValueFrom(
          this.curationService.create({
            nodeUri,
            fieldName: row.field,
            rawValue: row.rawValue || undefined,
            scriptValue: row.existingScriptValue ?? undefined,
            manualValue: newValue,
            status: 'corrected',
          }),
        );
      }
      this.editingField.set(null);
      this.editingValue.set('');
      this.snackBar.open('Guardado', 'Cerrar', { duration: 2000 });
      this.recordChanged.emit();
    } catch {
      this.snackBar.open('Error al guardar', 'Cerrar', { duration: 3000 });
    }
  }

  protected async validateField(row: AttributeRow): Promise<void> {
    const nodeUri = this.node()?.uri;
    if (!nodeUri) return;

    try {
      if (row.recordId) {
        await firstValueFrom(
          this.curationService.update(row.recordId, {
            status: 'validated',
          }),
        );
      } else {
        await firstValueFrom(
          this.curationService.create({
            nodeUri,
            fieldName: row.field,
            rawValue: row.rawValue || undefined,
            status: 'validated',
          }),
        );
      }
      this.snackBar.open('Validado', 'Cerrar', { duration: 2000 });
      this.recordChanged.emit();
    } catch {
      this.snackBar.open('Error al validar', 'Cerrar', { duration: 3000 });
    }
  }

  protected async validateAll(): Promise<void> {
    const n = this.node();
    if (!n) return;

    const fieldNames = Object.keys(n.attributes);
    const recs = this.records();
    const recordByField = new Map<string, CurationRecord>();
    for (const r of recs) {
      recordByField.set(r.fieldName, r);
    }

    let count = 0;
    const errors: string[] = [];

    for (const field of fieldNames) {
      const binding = n.attributes[field];
      const existing = recordByField.get(field);
      const rawStr = this.bindingToRawString(binding);

      try {
        if (existing) {
          await firstValueFrom(
            this.curationService.update(existing.id, {
              status: 'validated',
              manualValue: undefined,
            }),
          );
        } else {
          await firstValueFrom(
            this.curationService.create({
              nodeUri: n.uri,
              fieldName: field,
              rawValue: rawStr || undefined,
              status: 'validated',
            }),
          );
        }
        count++;
      } catch {
        errors.push(field);
      }
    }

    if (errors.length === 0) {
      this.snackBar.open(`${count} campos validados`, 'Cerrar', { duration: 3000 });
    } else {
      this.snackBar.open(
        `${count} validados, ${errors.length} errores (${errors.join(', ')})`,
        'Cerrar',
        { duration: 5000 },
      );
    }
    this.recordChanged.emit();
  }

  protected allValidated(): boolean {
    const r = this.rows();
    return r.length > 0 && r.every((row) => row.status === 'validated');
  }

  private bindingToRawString(value: BindingValue | undefined): string {
    if (!value) return '';
    switch (value.type) {
      case 'literal':
        return value.value;
      case 'uri':
        return value.value;
      case 'coordinate':
        return `${value.value.lat.toFixed(4)}, ${value.value.lng.toFixed(4)}`;
      case 'date':
        return value.value;
      case 'bnode':
        return value.value;
      default:
        return '';
    }
  }
}
