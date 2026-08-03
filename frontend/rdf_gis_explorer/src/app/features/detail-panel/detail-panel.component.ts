import { Component, inject, signal, OnDestroy, output } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTableModule } from '@angular/material/table';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { FormsModule } from '@angular/forms';

import { SelectionService } from '@core/services/selection.service';
import type { NormalizedNode, BindingValue } from '@shared/models';

interface AttributeRow {
  field: string;
  value: string;
}

@Component({
  selector: 'app-detail-panel',
  standalone: true,
  imports: [
    MatIconModule,
    MatButtonModule,
    MatTableModule,
    MatFormFieldModule,
    MatInputModule,
    MatTooltipModule,
    FormsModule,
  ],
  templateUrl: './detail-panel.component.html',
  styleUrl: './detail-panel.component.scss',
})
export class DetailPanelComponent implements OnDestroy {
  private readonly selectionService = inject(SelectionService);
  private readonly destroy$ = new Subject<void>();

  readonly close = output<void>();

  readonly node = signal<NormalizedNode | null>(null);
  readonly searchTerm = signal('');
  readonly displayedColumns: string[] = ['field', 'value'];

  constructor() {
    this.selectionService.selectedNode$
      .pipe(takeUntil(this.destroy$))
      .subscribe((sel) => {
        this.node.set(sel.node);
        this.searchTerm.set('');
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get rows(): AttributeRow[] {
    const n = this.node();
    if (!n) return [];
    return Object.entries(n.attributes).map(([field, binding]) => ({
      field,
      value: this.bindingToString(binding),
    }));
  }

  get filteredRows(): AttributeRow[] {
    const term = this.searchTerm().toLowerCase().trim();
    if (!term) return this.rows;
    return this.rows.filter((row) =>
      [row.field, row.value].some((v) => v.toLowerCase().includes(term)),
    );
  }

  closePanel(): void {
    this.selectionService.clearSelection();
    this.close.emit();
  }

  private bindingToString(value: BindingValue | undefined): string {
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
