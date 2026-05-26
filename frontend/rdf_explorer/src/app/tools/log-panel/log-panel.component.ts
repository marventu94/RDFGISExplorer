import { Component, computed, inject } from '@angular/core';
import { LogService } from '../../core/log.service';

@Component({
  selector: 'app-log-panel',
  templateUrl: './log-panel.component.html',
  standalone: true,
})
export class LogPanelComponent {
  readonly log = inject(LogService);

  readonly entries = computed(() => this.log.entries());

  formatTime(date: Date): string {
    const h = String(date.getHours()).padStart(2, '0');
    const m = String(date.getMinutes()).padStart(2, '0');
    const s = String(date.getSeconds()).padStart(2, '0');
    return `${h}:${m}:${s}`;
  }

  download(): void {
    this.log.download();
  }
}
