import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import type { DiscoveryConnections, DiscoveryConnection, DiscoveryExample } from '@rdfgis/contracts';
import { TranslatePipe } from '../../core/translate.pipe';
import { RequestService } from '../../core/request.service';
import { DiscoveryApiService } from './discovery-api.service';
import { DiscoveryStateService } from './discovery-state.service';

@Component({
  selector: 'app-discovery-panel', imports: [FormsModule, TranslatePipe],
  templateUrl: './discovery-panel.component.html', styleUrl: './discovery-panel.component.scss',
})
export class DiscoveryPanelComponent implements OnDestroy {
  readonly state = inject(DiscoveryStateService);
  private readonly api = inject(DiscoveryApiService);
  private readonly request = inject(RequestService);
  readonly data = signal<DiscoveryConnections | null>(null);
  readonly busy = signal(false);
  readonly error = signal(false);
  readonly filter = signal('');
  readonly concrete = computed(() => !!this.state.origin()?.uri);
  readonly connections = computed(() => {
    const text = this.filter().trim().toLowerCase();
    return (this.data()?.connections ?? []).filter(connection =>
      [connection.label, connection.predicate, connection.targetLabel, connection.targetClass,
        connection.datatype, ...connection.examples.flatMap(example => [example.label, example.value])]
        .filter(Boolean).join(' ').toLowerCase().includes(text))
      .sort((a, b) => Number(a.direction === 'in') - Number(b.direction === 'in'));
  });
  private connectionSub?: Subscription;
  constructor() {
    effect(() => { const focus = this.state.focus(); this.filter.set(''); this.load(focus); });
  }
  private load(focus = this.state.focus()): void {
    this.connectionSub?.unsubscribe();
    this.data.set(null); this.error.set(false); this.busy.set(!!focus);
    if (!focus) return;
    this.connectionSub = this.api.connections(focus).subscribe({
      next: data => { this.data.set(data); this.busy.set(false); },
      error: () => { this.error.set(true); this.busy.set(false); },
    });
  }
  retry(): void { this.load(); }
  key(connection: DiscoveryConnection): string {
    return JSON.stringify([connection.predicate, connection.direction, connection.targetClass, connection.datatype]);
  }
  exampleLabel(example: DiscoveryExample): string {
    if (example.kind === 'bnode') return 'Nodo anónimo';
    return example.label ?? this.request.getLabel(example.value) ?? example.value;
  }
  dragConnection(event: DragEvent, connection: DiscoveryConnection, example?: DiscoveryExample): void {
    // A concrete-resource card represents its displayed value, so dragging the
    // card must carry the same constraint as dragging the value chip.
    if (!example && this.concrete()) {
      const displayed = connection.examples[0];
      if (displayed?.kind !== 'bnode') example = displayed;
    }
    const source = this.state.source();
    if (!source || !event.dataTransfer || example?.kind === 'bnode') { event.preventDefault(); return; }
    this.request.setLabel(connection.predicate, connection.label);
    if (connection.targetClass && connection.targetLabel) this.request.setLabel(connection.targetClass, connection.targetLabel);
    if (example?.kind === 'uri' && example.label) this.request.setLabel(example.value, example.label);
    const token = this.state.graph.prepareConnectionDrag(source, this.state.asStep(connection), example);
    event.dataTransfer.setData('special', 'connection');
    event.dataTransfer.setData('connection', token);
    event.dataTransfer.effectAllowed = 'copy';
    event.stopPropagation();
  }
  dragEnd(): void { this.state.graph.clearConnectionDrag(); }
  ngOnDestroy(): void { this.connectionSub?.unsubscribe(); this.dragEnd(); }
}
