import { Injectable, signal } from '@angular/core';

export interface LogEntry {
  readonly date: Date;
  readonly info: string;
}

@Injectable({ providedIn: 'root' })
export class LogService {
  readonly entries = signal<readonly LogEntry[]>([]);

  add(info: string): void {
    this.entries.update(list => [...list, { date: new Date(), info }]);
  }

  download(): void {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(this.entries()));
    const anchor = document.createElement('a');
    anchor.setAttribute('href', dataStr);
    anchor.setAttribute('download', 'log.json');
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }

  clear(): void {
    this.entries.set([]);
  }
}
