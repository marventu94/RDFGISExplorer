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
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
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
    MatInputModule,
    MatFormFieldModule,
    MatTooltipModule,
    FormsModule
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

  protected readonly searchTerm = signal('');
  protected readonly displayedColumns: string[] = [
    'field',
    'rawValue',
    'scriptValue',
    'manualValue',
    'status',
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

  protected readonly filteredRows = computed<AttributeRow[]>(() => {
    const term = this.searchTerm().toLowerCase().trim();
    if (!term) return this.rows();
    return this.rows().filter((row) =>
      [row.field, row.rawValue, row.scriptValue ?? '', row.manualValue ?? '', row.status ?? '']
        .some((v) => v.toLowerCase().includes(term)),
    );
  });

  protected effectiveValue(row: AttributeRow): string {
    return row.manualValue ?? row.scriptValue ?? row.rawValue;
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
