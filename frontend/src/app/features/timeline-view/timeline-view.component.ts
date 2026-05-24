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
} from '@angular/core';
import { SelectionService } from '@core/services/selection.service';
import { combineLatest, Subject, takeUntil } from 'rxjs';
import { debounceTime, filter } from 'rxjs/operators';
import { Timeline } from 'vis-timeline/standalone';
import type { DataItem, DataGroup, TimelineOptions } from 'vis-timeline/standalone';
import { DataSet } from 'vis-data';
import type { QueryResult, NormalizedNode, Selection, TemporalFilter } from '@shared/models';
import { colorForType } from '@shared/entity-colors';
import { PriceChartComponent } from './price-chart.component';

type QueryState = 'no-query' | 'no-dates' | 'filtered-zero' | 'normal';

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
  imports: [PriceChartComponent],
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
  selectedNode: NormalizedNode | null = null;

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

  constructor(
    private readonly selectionService: SelectionService,
    private readonly ngZone: NgZone,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.initResizeObserver();

    combineLatest([
      this.selectionService.queryResult$,
      this.selectionService.filteredQueryResult$,
      this.selectionService.activeFilters$,
    ])
      .pipe(takeUntil(this.destroy$))
      .subscribe(([original, filtered, filters]) => {
        this.activeFilterCount = filters.length;

        const temporalFilter = filters.find((f): f is TemporalFilter => f.kind === 'temporal');
        this.activeFilterLabel = temporalFilter?.label ?? '';

        if (!filtered || filtered.nodes.length === 0) {
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

        this.originalNodeCount = original?.nodes.length ?? filtered.nodes.length;
        this.filteredNodeCount = filtered.nodes.length;
        this.allNodes = filtered.nodes;

        const nodesWithDates = filtered.nodes.filter((n) => (n.temporalEvents?.length ?? 0) > 0);

        if (nodesWithDates.length === 0) {
          this.queryState = 'no-dates';
          this.items.clear();
          this.groups.clear();
          this.timeline?.setItems(this.items);
          this.timeline?.setGroups(this.groups);
          this.cdr.markForCheck();
          return;
        }

        this.queryState = 'normal';
        this.renderItems(filtered);
        this.cdr.markForCheck();
      });

    this.selectionService.selectedNode$
      .pipe(
        takeUntil(this.destroy$),
        filter((sel: Selection) => sel.source !== 'timeline'),
      )
      .subscribe((sel: Selection) => {
        this.selectedNode = sel.node;
        this.cdr.markForCheck();

        if (sel.node && sel.node.temporalEvents?.length) {
          const mostRecent = sel.node.temporalEvents.reduce((a, b) =>
            a.isoDate > b.isoDate ? a : b,
          );
          this.timeline?.setSelection([sel.node.uri]);
          this.timeline?.moveTo(new Date(mostRecent.isoDate), {
            animation: { duration: 600, easingFunction: 'easeInOutQuad' },
          });
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

    this.initTimeline();
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
    const pad = Math.max(span * 0.2, 1000 * 60 * 60 * 24 * 30);

    this.suppressViewportEmit = true;
    this.timeline.setWindow(new Date(winMin - pad), new Date(winMax + pad), {
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
      horizontalScroll: true,
      zoomKey: 'ctrlKey',
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
    container.addEventListener('pointerdown', markActive, { capture: true });
    container.addEventListener('wheel', markActive, { passive: true, capture: true });

    this.timeline.on('select', (props: { items: string[] }) => {
      if (!props.items || props.items.length === 0) return;
      const nodeUri = String(props.items[0]);
      const node = this.allNodes.find((n) => n.uri === nodeUri);
      if (node) {
        this.ngZone.run(() => {
          this.selectedNode = node;
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
      if (!this.suppressViewportEmit) {
        this.ngZone.run(() => {
          this.viewportChange$.next({ start: props.start, end: props.end });
        });
      }
    });
  }

  private initResizeObserver(): void {
    if (typeof ResizeObserver === 'undefined') return;
    this.resizeObserver = new ResizeObserver(() => {
      this.timeline?.redraw();
    });
    const containerEl = this.tlContainer?.nativeElement;
    if (containerEl) {
      this.resizeObserver.observe(containerEl);
    }
  }

  private renderItems(result: QueryResult): void {
    this.items.clear();
    this.groups.clear();

    const typeGroups = new Map<string, DataGroup>();

    for (const node of result.nodes) {
      if (!node.temporalEvents?.length) continue;

      const type = node.type ?? 'unknown';
      if (!typeGroups.has(type)) {
        typeGroups.set(type, {
          id: type,
          content: type,
        });
      }

      const mostRecent = node.temporalEvents.reduce((a, b) => (a.isoDate > b.isoDate ? a : b));

      const color = colorForType(node.type);

      this.items.add({
        id: node.uri,
        group: type,
        start: new Date(mostRecent.isoDate),
        content: node.label,
        style: `color: ${color}; border-color: ${color};`,
      } as DataItem);
    }

    this.groups.add(Array.from(typeGroups.values()));
    this.timeline?.setItems(this.items);
    this.timeline?.setGroups(this.groups);

    if (this.timeline && this.items.length > 0) {
      let minDate: Date | null = null;
      let maxDate: Date | null = null;

      this.items.forEach((item) => {
        if (item.start) {
          const d = item.start instanceof Date ? item.start : new Date(item.start as string);
          if (!minDate || d < minDate) minDate = d;
          if (!maxDate || d > maxDate) maxDate = d;
        }
      });

      if (minDate && maxDate) {
        this.timeline.setWindow(minDate, maxDate, { animation: false });
      }
    }
  }
}
