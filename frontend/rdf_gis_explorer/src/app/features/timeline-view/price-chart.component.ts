import {
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  ViewChild,
} from '@angular/core';
import { Chart, registerables } from 'chart.js/auto';
import type { NormalizedNode } from '@shared/models';

Chart.register(...registerables);

@Component({
  selector: 'app-price-chart',
  standalone: true,
  template: `
    <div class="price-chart-container">
      @if (hasData) {
        <canvas #chartCanvas></canvas>
      } @else if (showEmptyMessage) {
        <div class="price-chart-placeholder">Sin historial de precio para este nodo</div>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
        height: 120px;
        overflow: hidden;
      }
      .price-chart-container {
        width: 100%;
        height: 100%;
      }
      .price-chart-placeholder {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100%;
        color: #78909c;
        font-size: 13px;
        background: #fafafa;
        border-top: 1px solid var(--mat-sys-outline-variant, #e0e0e0);
      }
    `,
  ],
})
export class PriceChartComponent implements OnChanges, OnDestroy {
  @Input() node?: NormalizedNode | null;

  @ViewChild('chartCanvas', { static: false }) chartCanvas?: ElementRef<HTMLCanvasElement>;

  hasData = false;
  showEmptyMessage = false;

  private chart?: Chart<'line'>;

  ngOnChanges(): void {
    this.renderChart();
  }

  ngOnDestroy(): void {
    this.destroyChart();
  }

  private destroyChart(): void {
    this.chart?.destroy();
    this.chart = undefined;
  }

  private renderChart(): void {
    this.destroyChart();

    if (!this.node || !this.node.temporalEvents?.length) {
      this.hasData = false;
      this.showEmptyMessage = false;
      return;
    }

    const priced = this.node.temporalEvents.filter((ev) => ev.numericValue != null);

    if (priced.length < 2) {
      this.hasData = false;
      this.showEmptyMessage = !!this.node.temporalEvents.length;
      return;
    }

    const sorted = [...priced].sort((a, b) => a.isoDate.localeCompare(b.isoDate));

    if (!this.chartCanvas?.nativeElement) {
      return;
    }

    this.hasData = true;
    this.showEmptyMessage = false;

    this.chart = new Chart<'line'>(this.chartCanvas.nativeElement, {
      type: 'line',
      data: {
        labels: sorted.map((e) => e.isoDate.slice(0, 10)),
        datasets: [
          {
            label: `${this.node.label} — evolución`,
            data: sorted.map((e) => e.numericValue as number),
            borderColor: '#2196F3',
            backgroundColor: 'rgba(33, 150, 243, 0.1)',
            fill: true,
            tension: 0.3,
            pointRadius: 3,
            pointHoverRadius: 5,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: 'top',
            labels: {
              boxWidth: 12,
              font: { size: 11 },
            },
          },
        },
        scales: {
          x: {
            ticks: { maxTicksLimit: 8, font: { size: 10 } },
            grid: { display: false },
          },
          y: {
            ticks: { font: { size: 10 } },
            grid: { color: 'rgba(0,0,0,0.06)' },
          },
        },
        interaction: {
          intersect: false,
          mode: 'index',
        },
      },
    });
  }
}
