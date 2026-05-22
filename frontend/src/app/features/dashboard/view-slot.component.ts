import { ChangeDetectionStrategy, Component, Input, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { DashboardLayoutService, ViewType } from '@core/services/dashboard-layout.service';
import { TableViewComponent } from '@features/table-view/table-view.component';
import { GraphViewComponent } from '@features/graph-view/graph-view.component';
import { MapViewComponent } from '@features/map-view/map-view.component';
import { TimelineViewComponent } from '@features/timeline-view/timeline-view.component';

interface ViewOption {
  type: ViewType;
  label: string;
  icon: string;
}

@Component({
  selector: 'app-view-slot',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    TableViewComponent,
    GraphViewComponent,
    MapViewComponent,
    TimelineViewComponent,
  ],
  template: `
    <div class="view-slot">
      <div class="slot-toolbar">
        <button
          mat-icon-button
          class="slot-picker"
          [matMenuTriggerFor]="viewMenu"
          aria-label="Cambiar vista"
        >
          <mat-icon>{{ currentIcon() }}</mat-icon>
        </button>
        <mat-menu #viewMenu="matMenu">
          @for (opt of options; track opt.type) {
            <button mat-menu-item (click)="select(opt.type)">
              <mat-icon>{{ opt.icon }}</mat-icon>
              <span>{{ opt.label }}</span>
            </button>
          }
        </mat-menu>
      </div>

      <div class="slot-content">
        @switch (currentView()) {
          @case ('table') {
            <app-table-view />
          }
          @case ('graph') {
            <app-graph-view />
          }
          @case ('map') {
            <app-map-view />
          }
          @case ('timeline') {
            <app-timeline-view />
          }
        }
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
        height: 100%;
        position: relative;
      }
      .view-slot {
        width: 100%;
        height: 100%;
        position: relative;
      }
      .slot-toolbar {
        position: absolute;
        top: 4px;
        right: 4px;
        z-index: 1100;
      }
      .slot-picker {
        background: rgba(255, 255, 255, 0.85);
        backdrop-filter: blur(4px);
        width: 28px;
        height: 28px;
        line-height: 28px;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
      }
      .slot-picker .mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
      }
      .slot-content {
        width: 100%;
        height: 100%;
      }
    `,
  ],
})
export class ViewSlotComponent {
  @Input({ required: true }) index!: number;

  private readonly layout = inject(DashboardLayoutService);

  readonly options: ViewOption[] = [
    { type: 'table', label: 'Tabla', icon: 'table_chart' },
    { type: 'graph', label: 'Grafo', icon: 'hub' },
    { type: 'map', label: 'Mapa', icon: 'map' },
    { type: 'timeline', label: 'Línea del tiempo', icon: 'timeline' },
  ];

  currentView(): ViewType {
    return this.layout.slots()[this.index] ?? 'table';
  }

  currentIcon(): string {
    const view = this.currentView();
    return this.options.find((o) => o.type === view)?.icon ?? 'view_module';
  }

  select(view: ViewType): void {
    this.layout.setSlot(this.index, view);
  }
}
