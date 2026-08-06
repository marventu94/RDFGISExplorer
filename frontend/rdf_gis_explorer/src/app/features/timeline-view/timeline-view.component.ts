import {
  Component,
  OnInit,
  OnDestroy,
  ElementRef,
  ViewChild,
  HostListener,
  HostBinding,
  NgZone,
  ChangeDetectorRef,
  inject,
} from '@angular/core';
import { SelectionService } from '@core/services/selection.service';
import { combineLatest, Subject, takeUntil } from 'rxjs';
import { debounceTime, filter } from 'rxjs/operators';
import { Timeline } from 'vis-timeline/standalone';
import type { DataItem, DataGroup, TimelineOptions } from 'vis-timeline/standalone';
import { DataSet } from 'vis-data';
import type { QueryResult, NormalizedNode, Selection, TemporalFilter } from '@shared/models';
import { EntityColorService } from '@core/services/entity-color.service';
import { DashboardViewStateService } from '@core/services/dashboard-view-state.service';
import { computeCoverageStats } from '@shared/stats/coverage-stats';
import { CoverageChipComponent } from '@shared/components/coverage-chip/coverage-chip.component';

type QueryState = 'no-query' | 'no-dates' | 'no-dates-lot' | 'filtered-zero' | 'normal';

/** Padding a cada lado del encuadre inicial, para que los items no queden pegados al borde. */
const WINDOW_PAD_RATIO = 0.05;
/** Piso del padding (y semi-ancho de la ventana cuando todos los items caen en la misma fecha). */
const WINDOW_PAD_MIN_MS = 1000 * 60 * 60 * 24 * 30;
/** Tope de atributos numéricos en el tooltip; más que esto no entra en un cuadrante. */
const TOOLTIP_MAX_ATTRS = 6;

enum ZoomLevel {
  TenYears = 'ten-years',
  FiveYears = 'five-years',
  Year = 'year',
  Month = 'month',
  Week = 'week',
  Day = 'day',
}

@Component({
  selector: 'app-timeline-view',
  standalone: true,
  imports: [CoverageChipComponent],
  templateUrl: './timeline-view.component.html',
  styleUrls: ['./timeline-view.component.scss'],
})
export class TimelineViewComponent implements OnInit, OnDestroy {
  @ViewChild('tlContainer', { static: true }) tlContainer!: ElementRef<HTMLDivElement>;

  protected readonly ZoomLevel = ZoomLevel;

  queryState: QueryState = 'no-query';
  activeFilterLabel = '';
  originalNodeCount = 0;
  filteredNodeCount = 0;
  canApplyRange = false;
  activeFilterCount = 0;
  /** Texto del chip de cobertura; vacío cuando la timeline muestra todos los nodos. */
  coverageLabel = '';

  @HostBinding('class.is-active-view') isActiveView = false;

  private timeline?: Timeline;
  private readonly items = new DataSet<DataItem>();
  private readonly groups = new DataSet<DataGroup>();
  private readonly destroy$ = new Subject<void>();
  private resizeObserver?: ResizeObserver;
  private pendingRange?: { start: Date; end: Date };
  private allNodes: NormalizedNode[] = [];
  private suppressViewportEmit = false;
  private readonly viewportChange$ = new Subject<{ start: Date; end: Date }>();
  private markActiveListener?: () => void;
  private redrawHandle?: number;

  private readonly viewState = inject(DashboardViewStateService);

  constructor(
    private readonly selectionService: SelectionService,
    private readonly ngZone: NgZone,
    private readonly cdr: ChangeDetectorRef,
    private readonly colorService: EntityColorService,
  ) {}

  ngOnInit(): void {
    // La timeline se crea ANTES de suscribirse: los BehaviorSubject de
    // SelectionService emiten sincrónicamente al suscribirse, así que con un
    // queryResult ya presente (dashboard hidratado / handoff) renderItems()
    // correría con this.timeline undefined y se perdería el encuadre inicial.
    this.initTimeline();
    this.initResizeObserver();

    combineLatest([
      this.selectionService.queryResult$,
      this.selectionService.visibleQueryResult$,
      this.selectionService.activeFilters$,
      this.selectionService.lotState$,
    ])
      .pipe(takeUntil(this.destroy$))
      .subscribe(([original, visible, filters, lotState]) => {
        this.activeFilterCount = filters.length;
        this.coverageLabel = '';

        const temporalFilter = filters.find((f): f is TemporalFilter => f.kind === 'temporal');
        this.activeFilterLabel = temporalFilter?.label ?? '';

        if (!visible || visible.nodes.length === 0) {
          if (!original || original.nodes.length === 0) {
            this.queryState = 'no-query';
          } else if (filters.length > 0) {
            this.queryState = 'filtered-zero';
            this.originalNodeCount = original.nodes.length;
          } else {
            this.queryState = 'no-query';
          }

          this.allNodes = [];
          this.items.clear();
          this.groups.clear();
          this.timeline?.setItems(this.items);
          this.timeline?.setGroups(this.groups);
          this.cdr.markForCheck();
          return;
        }

        this.originalNodeCount = original?.nodes.length ?? visible.nodes.length;
        this.filteredNodeCount = visible.nodes.length;
        this.allNodes = visible.nodes;

        const nodesWithDates = visible.nodes.filter((n) => (n.temporalEvents?.length ?? 0) > 0);

        if (nodesWithDates.length === 0) {
          // Si el resultado completo tampoco tiene fechas, la query no las
          // devuelve; si el completo sí tiene y el lote visible no, las fechas
          // quedaron en otro lote (o fuera por un filtro si hay uno solo).
          const originalHasDates = (original?.nodes ?? []).some(
            (n) => (n.temporalEvents?.length ?? 0) > 0,
          );
          this.queryState =
            originalHasDates && lotState.lotCount > 1 ? 'no-dates-lot' : 'no-dates';
          this.items.clear();
          this.groups.clear();
          this.timeline?.setItems(this.items);
          this.timeline?.setGroups(this.groups);
          this.cdr.markForCheck();
          return;
        }

        this.queryState = 'normal';
        const stats = computeCoverageStats(visible);
        if (stats.primaryWithoutTemporalEvents > 0) {
          const lotSuffix = lotState.lotCount > 1 ? ' del lote' : '';
          this.coverageLabel =
            `Mostrando ${stats.primaryWithTemporalEvents} de ${stats.primary} entidades${lotSuffix} · ` +
            `${stats.primaryWithoutTemporalEvents} sin fecha${stats.primaryWithoutTemporalEvents !== 1 ? 's' : ''}`;
        } else {
          this.coverageLabel = '';
        }
        this.renderItems(visible);
        this.cdr.markForCheck();
      });

    this.selectionService.selectedNode$
      .pipe(
        takeUntil(this.destroy$),
        filter((sel: Selection) => sel.source !== 'timeline'),
      )
      .subscribe((sel: Selection) => {
        this.cdr.markForCheck();

        if (sel.node && sel.node.temporalEvents?.length && this.timeline) {
          const mostRecent = sel.node.temporalEvents.reduce((a, b) =>
            a.isoDate > b.isoDate ? a : b,
          );
          this.timeline.setSelection([sel.node.uri]);

          const targetDate = new Date(mostRecent.isoDate);
          const window = this.timeline.getWindow();
          const isVisible =
            window && targetDate >= window.start && targetDate <= window.end;

          if (!isVisible) {
            this.timeline.moveTo(targetDate, {
              animation: { duration: 600, easingFunction: 'easeInOutQuad' },
            });
          }
        }
      });

    this.viewportChange$
      .pipe(takeUntil(this.destroy$), debounceTime(500))
      .subscribe((range) => this.emitFocusFromViewport(range));

    this.selectionService.activeView$.pipe(takeUntil(this.destroy$)).subscribe((v) => {
      this.isActiveView = v === 'timeline';
      this.cdr.markForCheck();
    });

    this.selectionService.focus$
      .pipe(
        takeUntil(this.destroy$),
        filter(
          (f) =>
            f.source !== null &&
            f.source !== 'timeline' &&
            f.uris.size > 0 &&
            this.selectionService.getActiveView() !== 'timeline',
        ),
      )
      .subscribe((f) => this.applyExternalFocus(f.uris));
  }

  private emitFocusFromViewport(range: { start: Date; end: Date }): void {
    if (this.allNodes.length === 0) return;
    const fromMs = range.start.getTime();
    const toMs = range.end.getTime();
    const uris: string[] = [];
    for (const node of this.allNodes) {
      if (!node.temporalEvents?.length) continue;
      const inRange = node.temporalEvents.some((ev) => {
        const t = new Date(ev.isoDate).getTime();
        return t >= fromMs && t <= toMs;
      });
      if (inRange) uris.push(node.uri);
    }
    if (uris.length === 0) return;
    this.selectionService.markActiveView('timeline');
    this.selectionService.setFocus(uris, 'timeline');
  }

  private applyExternalFocus(uris: ReadonlySet<string>): void {
    if (!this.timeline || this.allNodes.length === 0) return;

    let focusMin = Infinity;
    let focusMax = -Infinity;
    let totalMin = Infinity;
    let totalMax = -Infinity;
    let focusedCount = 0;
    let totalWithDates = 0;

    for (const node of this.allNodes) {
      if (!node.temporalEvents?.length) continue;
      totalWithDates++;
      const inFocus = uris.has(node.uri);
      if (inFocus) focusedCount++;
      for (const ev of node.temporalEvents) {
        const t = new Date(ev.isoDate).getTime();
        if (t < totalMin) totalMin = t;
        if (t > totalMax) totalMax = t;
        if (inFocus) {
          if (t < focusMin) focusMin = t;
          if (t > focusMax) focusMax = t;
        }
      }
    }

    if (!isFinite(totalMin) || !isFinite(totalMax)) return;

    let winMin: number;
    let winMax: number;

    const coverage = totalWithDates > 0 ? focusedCount / totalWithDates : 0;
    if (!isFinite(focusMin) || coverage >= 0.7) {
      winMin = totalMin;
      winMax = totalMax;
    } else {
      winMin = focusMin;
      winMax = focusMax;
    }

    const span = winMax - winMin;
    const pad = Math.max(span * 0.2, WINDOW_PAD_MIN_MS);

    const targetStart = winMin - pad;
    const targetEnd = winMax + pad;
    
    const currentWindow = this.timeline.getWindow();
    if (currentWindow) {
      const currentStart = currentWindow.start.getTime();
      const currentEnd = currentWindow.end.getTime();
      
      const allVisible = targetStart >= currentStart && targetEnd <= currentEnd;
      if (allVisible) {
        return;
      }
    }

    this.suppressViewportEmit = true;
    this.timeline.setWindow(new Date(targetStart), new Date(targetEnd), {
      animation: { duration: 600, easingFunction: 'easeInOutQuad' },
    });
    setTimeout(() => {
      this.suppressViewportEmit = false;
    }, 800);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.resizeObserver?.disconnect();
    if (this.redrawHandle !== undefined) {
      cancelAnimationFrame(this.redrawHandle);
    }
    const container = this.tlContainer?.nativeElement;
    if (container && this.markActiveListener) {
      container.removeEventListener('pointerdown', this.markActiveListener, { capture: true });
      container.removeEventListener('wheel', this.markActiveListener, { capture: true });
      this.markActiveListener = undefined;
    }
    this.timeline?.destroy();
  }

  @HostListener('window:resize')
  onResize(): void {
    this.timeline?.redraw();
  }

  applyRange(): void {
    if (!this.pendingRange) return;

    const filter: TemporalFilter = {
      id: 'timeline-range',
      kind: 'temporal',
      from: this.pendingRange.start.toISOString(),
      to: this.pendingRange.end.toISOString(),
      label: `${this.pendingRange.start.toLocaleDateString('es-AR')} – ${this.pendingRange.end.toLocaleDateString('es-AR')}`,
    };

    this.selectionService.addFilter(filter);
    this.canApplyRange = false;
    this.pendingRange = undefined;
  }

  zoomTo(level: ZoomLevel): void {
    if (!this.timeline) return;

    const visible = this.timeline.getWindow();
    const center = new Date((visible.start.getTime() + visible.end.getTime()) / 2);

    let start: Date;
    let end: Date;

    switch (level) {
      case ZoomLevel.TenYears:
        start = new Date(center.getFullYear() - 5, 0, 1);
        end = new Date(center.getFullYear() + 5, 0, 1);
        break;
      case ZoomLevel.FiveYears:
        start = new Date(center.getFullYear() - 2, 0, 1);
        end = new Date(center.getFullYear() + 3, 0, 1);
        break;
      case ZoomLevel.Day:
        start = new Date(center);
        start.setHours(0, 0, 0, 0);
        end = new Date(start);
        end.setDate(end.getDate() + 1);
        break;
      case ZoomLevel.Week:
        start = new Date(center);
        start.setDate(start.getDate() - start.getDay());
        start.setHours(0, 0, 0, 0);
        end = new Date(start);
        end.setDate(end.getDate() + 7);
        break;
      case ZoomLevel.Month:
        start = new Date(center.getFullYear(), center.getMonth(), 1);
        end = new Date(center.getFullYear(), center.getMonth() + 1, 1);
        break;
      case ZoomLevel.Year:
      default:
        start = new Date(center.getFullYear(), 0, 1);
        end = new Date(center.getFullYear() + 1, 0, 1);
        break;
    }

    this.timeline.setWindow(start, end, {
      animation: { duration: 400, easingFunction: 'easeInOutQuad' },
    });
  }

  openVariableMapping(): void {
    window.dispatchEvent(new CustomEvent('open-variable-mapping'));
  }

  private initTimeline(): void {
    const options: TimelineOptions = {
      stack: true,
      // La timeline queda clavada al alto del cuadrante en vez de crecer con el
      // apilado: vis relee dom.root.offsetHeight después de aplicar la altura y
      // deriva de ahí el alto del área central, así que el eje inferior (que es
      // hermano de esa área, no hijo) queda siempre visible.
      height: '100%',
      // Barra de scroll interna para los items, en lugar de scrollear el panel
      // entero con la toolbar incluida.
      verticalScroll: true,
      // preferZoom + zoomKey ausente = la rueda hace zoom temporal (igual que el
      // mapa). No agregar zoomKey: haría que la rueda vuelva a scrollear.
      preferZoom: true,
      horizontalScroll: false,
      tooltip: { followMouse: true, overflowMethod: 'flip' },
      selectable: true,
      multiselect: false,
      showCurrentTime: false,
      showMajorLabels: true,
      showMinorLabels: true,
      zoomMin: 1000 * 60 * 60 * 24,
      zoomMax: 1000 * 60 * 60 * 24 * 365 * 50,
      orientation: { axis: 'bottom', item: 'top' },
    };

    this.timeline = new Timeline(this.tlContainer.nativeElement, this.items, this.groups, options);

    const container = this.tlContainer.nativeElement;
    const markActive = () => this.selectionService.markActiveView('timeline');
    this.markActiveListener = markActive;
    container.addEventListener('pointerdown', markActive, { capture: true });
    container.addEventListener('wheel', markActive, { passive: true, capture: true });

    this.timeline.on('select', (props: { items: string[] }) => {
      if (!props.items || props.items.length === 0) return;
      const nodeUri = String(props.items[0]);
      const node = this.allNodes.find((n) => n.uri === nodeUri);
      if (node) {
        this.ngZone.run(() => {
          this.selectionService.select(node, 'timeline');
        });
      }
    });

    this.timeline.on('rangechange', (props: { byUser: boolean }) => {
      if (props.byUser) {
        this.selectionService.markActiveView('timeline');
      }
    });

    this.timeline.on('rangechanged', (props: { start: Date; end: Date; byUser: boolean }) => {
      if (!props.byUser) return;
      this.pendingRange = { start: props.start, end: props.end };
      this.canApplyRange = true;
      this.cdr.markForCheck();
      this.viewState.timelineState.set({
        rangeStart: props.start.toISOString(),
        rangeEnd: props.end.toISOString(),
      });
      if (!this.suppressViewportEmit) {
        this.ngZone.run(() => {
          this.viewportChange$.next({ start: props.start, end: props.end });
        });
      }
    });

    // Restore stored view state
    const storedTimeline = this.viewState.timelineState();
    if (storedTimeline?.rangeStart && storedTimeline?.rangeEnd) {
      this.timeline.setWindow(new Date(storedTimeline.rangeStart), new Date(storedTimeline.rangeEnd));
    }
  }

  private initResizeObserver(): void {
    if (typeof ResizeObserver === 'undefined') return;
    this.resizeObserver = new ResizeObserver(() => {
      // Coalescido en un frame: redraw() reescribe el DOM que estamos observando.
      if (this.redrawHandle !== undefined) return;
      this.redrawHandle = requestAnimationFrame(() => {
        this.redrawHandle = undefined;
        this.timeline?.redraw();
      });
    });
    const containerEl = this.tlContainer?.nativeElement;
    if (containerEl) {
      this.resizeObserver.observe(containerEl);
    }
  }

  private renderItems(result: QueryResult): void {
    this.items.clear();
    this.groups.clear();

    const groupCounts = new Map<string, number>();
    let minMs = Infinity;
    let maxMs = -Infinity;

    for (const node of result.nodes) {
      if (!node.temporalEvents?.length) continue;

      const type = node.classes?.[0] ?? node.queryVariable ?? 'unknown';
      groupCounts.set(type, (groupCounts.get(type) ?? 0) + 1);

      const mostRecent = node.temporalEvents.reduce((a, b) => (a.isoDate > b.isoDate ? a : b));
      const start = new Date(mostRecent.isoDate);
      const ms = start.getTime();
      if (!isNaN(ms)) {
        if (ms < minMs) minMs = ms;
        if (ms > maxMs) maxMs = ms;
      }

      const color = this.colorService.colorForClass(node.classes?.[0]);

      this.items.add({
        id: node.uri,
        group: type,
        start,
        content: node.label,
        title: this.buildItemTooltip(node, start),
        style: `color: ${color}; border-color: ${color};`,
      } as DataItem);
    }

    // El conteo se conoce recién al terminar el recorrido, así que los grupos se
    // arman al final.
    const groups: DataGroup[] = Array.from(groupCounts, ([type, count]) => ({
      id: type,
      // vis inserta el content del grupo como HTML; el type sale de datos RDF.
      content: `${this.escapeHtml(this.humanizeLabel(type))} (${count})`,
    }));

    this.groups.add(groups);
    this.timeline?.setItems(this.items);
    this.timeline?.setGroups(this.groups);

    if (this.timeline && isFinite(minMs) && isFinite(maxMs)) {
      // Padding para que los items de los extremos no queden pegados al borde;
      // con todas las fechas iguales el span es 0 y el piso abre la ventana.
      const pad = Math.max((maxMs - minMs) * WINDOW_PAD_RATIO, WINDOW_PAD_MIN_MS);
      this.timeline.setWindow(new Date(minMs - pad), new Date(maxMs + pad), { animation: false });
    }
  }

  /**
   * El `type` de un nodo es el nombre de la variable SPARQL que lo ancló o una
   * URI completa, según el productor. Devuelve algo legible en ambos casos.
   */
  private humanizeLabel(type: string): string {
    if (type === 'unknown') return 'Sin tipo';

    let label = type;
    if (label.includes('://')) {
      const fragment = label.split('#').pop() ?? label;
      label = fragment.split('/').filter(Boolean).pop() ?? label;
    }

    label = label
      .replace(/[_-]+/g, ' ')
      .replace(/([a-z\d])([A-Z])/g, '$1 $2')
      .trim();

    if (!label) return type;
    return label.charAt(0).toUpperCase() + label.slice(1);
  }

  /**
   * Tooltip con lo que la timeline no puede mostrar en el item: la fecha
   * formateada, cuántos eventos tiene el nodo (solo se dibuja el más reciente) y
   * las magnitudes numéricas que traiga la query — m2, precio o lo que sea.
   */
  private buildItemTooltip(node: NormalizedNode, start: Date): string {
    const lines = [`<strong>${this.escapeHtml(node.label)}</strong>`];

    if (!isNaN(start.getTime())) {
      const formatted = start.toLocaleDateString('es-AR', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
      const eventCount = node.temporalEvents?.length ?? 0;
      const suffix = eventCount > 1 ? ` · ${eventCount} fechas` : '';
      lines.push(this.escapeHtml(formatted + suffix));
    }

    for (const [field, value] of this.collectNumericAttributes(node)) {
      lines.push(
        `${this.escapeHtml(this.humanizeLabel(field))}: ${this.escapeHtml(
          value.toLocaleString('es-AR'),
        )}`,
      );
    }

    return lines.join('<br>');
  }

  /** Atributos literales cuyo valor parsea como número finito. */
  private collectNumericAttributes(node: NormalizedNode): [string, number][] {
    const found: [string, number][] = [];

    for (const [field, binding] of Object.entries(node.attributes ?? {})) {
      if (found.length >= TOOLTIP_MAX_ATTRS) break;
      if (binding?.type !== 'literal') continue;
      const raw = binding.value.trim();
      if (!raw) continue;
      const parsed = Number(raw);
      if (!isFinite(parsed)) continue;
      found.push([field, parsed]);
    }

    return found;
  }

  /** Los valores vienen de datos RDF arbitrarios y el tooltip se inyecta como HTML. */
  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
