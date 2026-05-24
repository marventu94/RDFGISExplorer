import { Component } from '@angular/core';
import type { ICellRendererAngularComp } from 'ag-grid-angular';
import type { ICellRendererParams } from 'ag-grid-community';
import type { BindingValue, CurationRecord } from '@shared/models';

@Component({
  selector: 'app-editable-cell-renderer',
  standalone: true,
  imports: [],
  template: `
    <div class="editable-cell">
      <span
        class="cell-value"
        [class.corrected]="status === 'corrected'"
        [class.scripted]="status === 'script'"
      >
        {{ effectiveValue }}
      </span>
      @if (status === 'validated') {
        <span class="badge badge-validated" title="Validado">&#x2713;</span>
      } @else if (status === 'corrected') {
        <span class="badge badge-corrected" title="Corregido">&#x270F;</span>
      } @else if (status === 'pending') {
        <span class="badge badge-pending" title="Pendiente">&#x23F3;</span>
      } @else if (status === 'script') {
        <span class="badge badge-script" title="Script">&#x1F916;</span>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
      }
      .editable-cell {
        display: flex;
        align-items: center;
        gap: 4px;
        position: relative;
        min-height: 32px;
      }
      .cell-value {
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .cell-value.corrected {
        color: var(--color-corrected, #1565c0);
        border-bottom: 2px dotted var(--color-corrected, #1565c0);
        font-style: italic;
      }
      .cell-value.scripted {
        color: var(--color-script, #7b1fa2);
      }
      .badge {
        flex-shrink: 0;
        font-size: 14px;
        width: 20px;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
      }
      .badge-validated {
        background-color: #e8f5e9;
        color: #2e7d32;
      }
      .badge-corrected {
        background-color: #e3f2fd;
        color: #1565c0;
      }
      .badge-pending {
        background-color: #fff8e1;
        color: #f57f17;
      }
      .badge-script {
        background-color: #f3e5f5;
        color: #7b1fa2;
      }
    `,
  ],
})
export class EditableCellRendererComponent implements ICellRendererAngularComp {
  params!: ICellRendererParams;
  effectiveValue = '';
  status: 'validated' | 'corrected' | 'pending' | 'script' | null = null;
  curationRecord: CurationRecord | null = null;

  agInit(params: ICellRendererParams): void {
    this.params = params;
    this.refreshDisplay(params);
  }

  refresh(params: ICellRendererParams): boolean {
    this.refreshDisplay(params);
    return true;
  }

  private refreshDisplay(params: ICellRendererParams): void {
    const field = params.colDef?.field;
    const rawValue = field
      ? (params.data as Record<string, BindingValue> | undefined)?.[field]
      : undefined;
    const rawString = this.bindingToString(rawValue);
    this.curationRecord =
      ((params.data as Record<string, unknown>)?.[
        '__curation__' + params.colDef?.field
      ] as CurationRecord) ?? null;

    const record = this.curationRecord;
    if (record) {
      if (record.status === 'validated') {
        this.status = 'validated';
        this.effectiveValue = record.manualValue ?? record.scriptValue ?? rawString;
      } else if (record.manualValue) {
        this.status = 'corrected';
        this.effectiveValue = record.manualValue;
      } else if (record.scriptValue) {
        this.status = 'script';
        this.effectiveValue = record.scriptValue;
      } else if (record.status === 'pending') {
        this.status = 'pending';
        this.effectiveValue = rawString;
      } else {
        this.status = null;
        this.effectiveValue = rawString;
      }
    } else {
      this.status = null;
      this.effectiveValue = rawString;
    }
  }

  private bindingToString(value: BindingValue | undefined): string {
    if (!value) return '';
    switch (value.type) {
      case 'literal':
        return value.value;
      case 'uri':
        return this.shortenUri(value.value);
      case 'coordinate':
        return `${value.value.lat.toFixed(4)}, ${value.value.lng.toFixed(4)}`;
      case 'date':
        try {
          return new Date(value.value).toLocaleString('es-AR');
        } catch {
          return value.value;
        }
      case 'bnode':
        return value.value;
      default:
        return '';
    }
  }

  private shortenUri(uri: string): string {
    if (!uri) return '';
    const hashIndex = uri.lastIndexOf('#');
    if (hashIndex > 0) {
      const base = uri.substring(0, hashIndex);
      const fragment = uri.substring(hashIndex + 1);
      if (fragment.length < 30) {
        const parts = base.split('/');
        const ns = parts[parts.length - 1] || parts[parts.length - 2] || base;
        return `${ns}:${fragment}`;
      }
    }
    const parts = uri.split('/');
    const last = parts[parts.length - 1] || parts[parts.length - 2] || uri;
    if (last.length > 40) {
      return last.substring(0, 37) + '...';
    }
    return last;
  }

}
