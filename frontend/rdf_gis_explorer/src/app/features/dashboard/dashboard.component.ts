import { Component, ElementRef, ViewChild, computed, inject, input, signal, AfterViewInit } from '@angular/core';
import { CdkDrag, CdkDragEnd } from '@angular/cdk/drag-drop';
import { trigger, state, style, transition, animate } from '@angular/animations';
import { SparqlInputComponent } from '@features/sparql-input/sparql-input.component';
import { DashboardLayoutService } from '@core/services/dashboard-layout.service';
import { GisHandoffService } from './gis-handoff.service';
import { ViewSlotComponent } from './view-slot.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CdkDrag, SparqlInputComponent, ViewSlotComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
  animations: [
    trigger('editorCollapse', [
      state('expanded', style({ height: '240px', opacity: 1, marginBottom: '0' })),
      state('collapsed', style({ height: '0px', opacity: 0, marginBottom: '0' })),
      transition('expanded <=> collapsed', animate('300ms ease-in-out')),
    ]),
  ],
})
export class DashboardComponent implements AfterViewInit {
  readonly editorCollapsed = input(false);

  @ViewChild('container', { static: true }) containerRef!: ElementRef<HTMLElement>;
  @ViewChild(SparqlInputComponent) sparqlInput!: SparqlInputComponent;

  private readonly gisHandoff = inject(GisHandoffService);

  protected readonly colLeft = signal(50);
  protected readonly rowTop = signal(50);

  protected readonly layout = inject(DashboardLayoutService);
  protected readonly preset = this.layout.preset;
  protected readonly slotIndices = computed(() =>
    Array.from({ length: this.layout.slotCount() }, (_, i) => i),
  );

  protected readonly showVerticalDivider = computed(() => {
    const p = this.preset();
    return p === 'quad' || p === 'split-h' || p === 'triple-inv' || p === 'triple-v' || p === 'triple-v-inv';
  });
  protected readonly showHorizontalDivider = computed(() => {
    const p = this.preset();
    return p === 'quad' || p === 'split-v' || p === 'triple' || p === 'triple-inv' || p === 'triple-v' || p === 'triple-v-inv';
  });

  protected get editorState(): string {
    return this.editorCollapsed() ? 'collapsed' : 'expanded';
  }

  ngAfterViewInit(): void {
    const params = new URLSearchParams(window.location.search);
    if (params.get('handoff') !== '1') return;

    // El flag se saca de la URL antes de consumir: si el usuario recarga, no
    // se vuelve a intentar importar una query que ya no está.
    const url = new URL(window.location.href);
    url.searchParams.delete('handoff');
    window.history.replaceState({}, '', url.toString());

    this.gisHandoff.consumeInto(this.sparqlInput);
  }

  protected onVerticalDragEnded(event: CdkDragEnd): void {
    const containerWidth = this.containerRef.nativeElement.offsetWidth;
    const delta = event.distance.x;
    const pct = Math.max(20, Math.min(80, this.colLeft() + (delta / containerWidth) * 100));
    this.colLeft.set(pct);
    event.source.reset();
  }

  protected onHorizontalDragEnded(event: CdkDragEnd): void {
    const containerHeight = this.containerRef.nativeElement.offsetHeight;
    const delta = event.distance.y;
    const pct = Math.max(20, Math.min(80, this.rowTop() + (delta / containerHeight) * 100));
    this.rowTop.set(pct);
    event.source.reset();
  }
}
