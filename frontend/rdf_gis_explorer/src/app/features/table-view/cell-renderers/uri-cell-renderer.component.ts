import { Component, HostListener } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import type { ICellRendererAngularComp } from 'ag-grid-angular';
import type { ICellRendererParams } from 'ag-grid-community';
import type { BindingValue } from '@shared/models';

@Component({
  selector: 'app-uri-cell-renderer',
  standalone: true,
  imports: [MatIconModule, MatButtonModule],
  // Sin [title]: el tooltip lo maneja AG Grid vía tooltipValueGetter de la columna.
  // Con ambos aparecían dos tooltips superpuestos (el nativo del navegador y el de
  // la grilla), y sólo el de la grilla permite seleccionar y copiar el texto.
  template: ` <span class="uri-cell">{{ displayValue }}</span> `,
  styles: [
    `
      :host {
        display: block;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .uri-cell {
        font-family: var(--font-mono, monospace);
        font-size: 12px;
      }
    `,
  ],
})
export class UriCellRendererComponent implements ICellRendererAngularComp {
  params!: ICellRendererParams;
  fullUri = '';
  displayValue = '';

  agInit(params: ICellRendererParams): void {
    this.params = params;
    const field = params.colDef?.field;
    const value = field
      ? (params.data as Record<string, BindingValue> | undefined)?.[field]
      : undefined;
    this.fullUri = value?.type === 'uri' || value?.type === 'literal' ? String(value.value) : '';
    this.displayValue = this.shortenUri(this.fullUri);
  }

  refresh(params: ICellRendererParams): boolean {
    this.agInit(params);
    return true;
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
