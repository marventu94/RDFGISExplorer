import { AppConfigService } from '@core/services/app-config.service';
import { abbreviateUri } from '@shared/uri/abbreviate-uri';
import { Component, computed, inject, signal } from '@angular/core';
import type { ICellRendererAngularComp } from 'ag-grid-angular';
import type { ICellRendererParams } from 'ag-grid-community';
import type { BindingValue } from '@shared/models';

@Component({
  selector: 'app-uri-cell-renderer',
  standalone: true,
  // Sin [title]: el tooltip lo maneja AG Grid vía tooltipValueGetter de la columna.
  // Con ambos aparecían dos tooltips superpuestos (el nativo del navegador y el de
  // la grilla), y sólo el de la grilla permite seleccionar y copiar el texto.
  template: ` <span class="uri-cell">{{ displayValue() }}</span> `,
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
  private readonly config = inject(AppConfigService);
  private readonly uri = signal('');
  readonly displayValue = computed(() => abbreviateUri(this.uri(), this.config.config()?.defaultPrefixes ?? {}));

  agInit(params: ICellRendererParams): void {
    this.params = params;
    const field = params.colDef?.field;
    const value = field
      ? (params.data as Record<string, BindingValue> | undefined)?.[field]
      : undefined;
    this.fullUri = value?.type === 'uri' ? String(value.value) : '';
    this.uri.set(this.fullUri);
  }

  refresh(params: ICellRendererParams): boolean {
    this.agInit(params);
    return true;
  }

}
