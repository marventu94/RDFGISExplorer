import {
  Component,
  inject,
  signal,
  OnDestroy,
  output,
} from '@angular/core';
import { Subject, takeUntil, firstValueFrom } from 'rxjs';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTabsModule } from '@angular/material/tabs';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { SelectionService } from '@core/services/selection.service';
import { CurationService } from '@core/services/curation.service';
import type { NormalizedNode, CurationRecord } from '@shared/models';
import { DataTabComponent } from './tabs/data-tab.component';

@Component({
  selector: 'app-curation-panel',
  standalone: true,
  imports: [
    MatIconModule,
    MatButtonModule,
    MatTabsModule,
    MatProgressSpinnerModule,
    DataTabComponent,
  ],
  templateUrl: './curation-panel.component.html',
  styleUrl: './curation-panel.component.scss',
})
export class CurationPanelComponent implements OnDestroy {
  private readonly selectionService = inject(SelectionService);
  private readonly curationService = inject(CurationService);
  private readonly destroy$ = new Subject<void>();

  readonly close = output<void>();

  readonly node = signal<NormalizedNode | null>(null);
  readonly records = signal<CurationRecord[]>([]);
  readonly loading = signal(false);

  constructor() {
    this.selectionService.selectedNode$
      .pipe(takeUntil(this.destroy$))
      .subscribe((sel) => {
        if (sel.node) {
          this.node.set(sel.node);
          void this.loadCurationData(sel.node.uri);
        } else {
          this.node.set(null);
          this.records.set([]);
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  closePanel(): void {
    this.selectionService.clearSelection();
    this.close.emit();
  }

  async onRecordChanged(): Promise<void> {
    const n = this.node();
    if (n) {
      await this.loadCurationData(n.uri);
    }
  }

  private async loadCurationData(nodeUri: string): Promise<void> {
    this.loading.set(true);
    try {
      const { records: recs } = await firstValueFrom(
        this.curationService.getForNode(nodeUri),
      );
      this.records.set(recs);
    } catch {
      this.records.set([]);
    } finally {
      this.loading.set(false);
    }
  }
}
