import { Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import type { ICellRendererAngularComp } from 'ag-grid-angular';
import type { ICellRendererParams } from 'ag-grid-community';
import type { BindingValue, Coordinate } from '@shared/models';
import { SelectionService } from '@core/services/selection.service';
import type { NormalizedNode } from '@shared/models';

@Component({
  selector: 'app-coord-cell-renderer',
  standalone: true,
  imports: [MatIconModule, MatButtonModule],
  template: `
    <div class="coord-cell">
      <span>{{ displayText }}</span>
      @if (hasCoord) {
        <button
          class="pin-btn"
          mat-icon-button
          (click)="onPinClick($event)"
          aria-label="Centrar en el mapa"
          title="Centrar en el mapa"
        >
          <mat-icon>place</mat-icon>
        </button>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .coord-cell {
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .pin-btn {
        width: 28px;
        height: 28px;
        line-height: 28px;
        flex-shrink: 0;
      }
      .pin-btn mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
      }
    `,
  ],
})
export class CoordCellRendererComponent implements ICellRendererAngularComp {
  params!: ICellRendererParams;
  hasCoord = false;
  displayText = '';

  constructor(private readonly selectionService: SelectionService) {}

  agInit(params: ICellRendererParams): void {
    this.params = params;
    const value = params.value as BindingValue | undefined;
    if (value?.type === 'coordinate') {
      this.hasCoord = true;
      const coord: Coordinate = value.value;
      this.displayText = `${coord.lat.toFixed(4)}, ${coord.lng.toFixed(4)}`;
    } else {
      this.hasCoord = false;
      this.displayText = value?.value
        ? typeof value.value === 'string'
          ? value.value
          : ''
        : '';
    }
  }

  refresh(params: ICellRendererParams): boolean {
    this.agInit(params);
    return true;
  }

  onPinClick(event: MouseEvent): void {
    event.stopPropagation();
    const node = this.findNodeForRow();
    if (node) {
      this.selectionService.select(node, 'table');
    }
  }

  private findNodeForRow(): NormalizedNode | null {
    const rowNode = this.params.node;
    if (!rowNode?.data) return null;
    const rowData = rowNode.data as Record<string, BindingValue>;
    const uriEntry = Object.entries(rowData).find(
      ([, v]) => v?.type === 'uri',
    );
    if (!uriEntry) return null;
    return {
      uri: String(uriEntry[1].value),
      label: '',
      attributes: {},
    };
  }
}
