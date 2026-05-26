import { Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import type { ICellRendererAngularComp } from 'ag-grid-angular';
import type { ICellRendererParams } from 'ag-grid-community';

@Component({
  selector: 'app-plugin-cell-renderer',
  standalone: true,
  imports: [MatIconModule],
  template: `<mat-icon class="plugin-icon">extension</mat-icon>`,
  styles: [`
    :host { display: flex; align-items: center; justify-content: center; width: 100%; }
    .plugin-icon { font-size: 16px; width: 16px; height: 16px; opacity: 0.25; }
  `],
})
export class PluginCellRendererComponent implements ICellRendererAngularComp {
  agInit(_params: ICellRendererParams): void {}
  refresh(_params: ICellRendererParams): boolean { return true; }
}
