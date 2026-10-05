import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription, timeout } from 'rxjs';
import type { DiscoveryConnections, DiscoveryConnection, DiscoveryExample } from '@rdfgis/contracts';
import type { UiTextKey } from '@rdfgis/platform-bridge';
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
  readonly errorMessage = signal<UiTextKey>('No se pudo explorar este conjunto.');
  readonly retryIn = signal(0);
  private retryTimer?: ReturnType<typeof setInterval>;
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
  private load(focus = this.state.focus(), preserve = false): void {
    this.connectionSub?.unsubscribe();
    this.stopRetryTimer();
    if (!preserve) this.data.set(null);
    this.error.set(false); this.busy.set(!!focus);
    if (!focus) return;
    const previous = preserve ? this.data() : null;
    const directions = previous?.failedDirections.length ? previous.failedDirections : undefined;
    this.connectionSub = this.api.connections(focus, directions, previous).pipe(timeout(60000)).subscribe({
      next: data => {
        this.data.set(data); this.busy.set(!!data.pendingDirections?.length);
        this.startRetryTimer(data.retryAfterSeconds);
      },
      error: (error: unknown) => {
        const failure = error as { status?: number; name?: string; error?: { error?: string; retryAfterSeconds?: number } };
        const code = failure?.error?.error;
        this.errorMessage.set(code === 'DISCOVERY_COOLDOWN'
          ? 'El servidor está en pausa después de un error.'
          : code === 'TIMEOUT' || failure?.name === 'TimeoutError' || failure?.status === 408
            ? 'La exploración tardó demasiado. Podés reintentar o explorar un alcance más simple.'
            : code === 'UPSTREAM_ERROR' || failure?.status === 502
              ? 'El servidor RDF no pudo completar la exploración.'
              : failure?.status === 0
                ? 'No se pudo conectar con el servidor. Comprobá la conexión y reintentá.'
                : 'No se pudo explorar este conjunto.');
        this.error.set(true); this.busy.set(false);
        this.startRetryTimer(failure?.error?.retryAfterSeconds);
      },
    });
  }
  private stopRetryTimer(): void {
    if (this.retryTimer) clearInterval(this.retryTimer);
    this.retryTimer = undefined;
    this.retryIn.set(0);
  }
  private startRetryTimer(seconds?: number): void {
    this.stopRetryTimer();
    if (!seconds || !Number.isFinite(seconds) || seconds <= 0) return;
    const until = Date.now() + Math.ceil(seconds) * 1000;
    this.retryIn.set(Math.ceil(seconds));
    this.retryTimer = setInterval(() => {
      this.retryIn.set(Math.max(0, Math.ceil((until - Date.now()) / 1000)));
      if (!this.retryIn()) this.stopRetryTimer();
    }, 250);
  }
  retry(): void {
    if (!this.busy() && !this.retryIn()) this.load(this.state.focus(), true);
  }
  key(connection: DiscoveryConnection): string {
    return JSON.stringify([connection.predicate, connection.direction, connection.targetClass, connection.datatype]);
  }
  exampleLabel(example: DiscoveryExample): string {
    if (example.kind === 'bnode') return 'Nodo anónimo';
    return example.label ?? this.request.getLabel(example.value) ?? example.value;
  }
  dragConnection(event: DragEvent, connection: DiscoveryConnection, example?: DiscoveryExample): void {
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
  ngOnDestroy(): void { this.connectionSub?.unsubscribe(); this.stopRetryTimer(); this.dragEnd(); }
}
