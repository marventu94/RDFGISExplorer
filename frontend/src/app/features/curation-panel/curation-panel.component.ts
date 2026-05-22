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
import { MatBadgeModule } from '@angular/material/badge';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { SelectionService } from '@core/services/selection.service';
import { CurationService } from '@core/services/curation.service';
import type { NormalizedNode, CurationRecord, DuplicateCandidate } from '@shared/models';
import { DataTabComponent } from './tabs/data-tab.component';
import { AnnotationsTabComponent } from './tabs/annotations-tab.component';
import { DuplicatesTabComponent } from './tabs/duplicates-tab.component';

@Component({
  selector: 'app-curation-panel',
  standalone: true,
  imports: [
    MatIconModule,
    MatButtonModule,
    MatTabsModule,
    MatBadgeModule,
    MatProgressSpinnerModule,
    DataTabComponent,
    AnnotationsTabComponent,
    DuplicatesTabComponent,
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
  readonly duplicates = signal<DuplicateCandidate[]>([]);
  readonly loading = signal(false);
  readonly pendingDuplicateCount = signal(0);

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
          this.duplicates.set([]);
          this.pendingDuplicateCount.set(0);
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
      this.updatePendingReviewFlag(n);
    }
  }

  async onDuplicateDecision(): Promise<void> {
    const n = this.node();
    if (n) {
      await this.loadCurationData(n.uri);
      this.updatePendingReviewFlag(n);
    }
  }

  private async loadCurationData(nodeUri: string): Promise<void> {
    this.loading.set(true);
    try {
      const { records: recs, duplicates: dups } = await firstValueFrom(
        this.curationService.getForNode(nodeUri),
      );
      this.records.set(recs);
      this.duplicates.set(dups);
      this.pendingDuplicateCount.set(
        dups.filter((d) => d.decision === 'pending').length,
      );
    } catch {
      this.records.set([]);
      this.duplicates.set([]);
      this.pendingDuplicateCount.set(0);
    } finally {
      this.loading.set(false);
    }
  }

  private updatePendingReviewFlag(node: NormalizedNode): void {
    const hasPendingRecords = this.records().some((r) => r.status === 'pending');
    const hasPendingDuplicates = this.duplicates().some(
      (d) => d.decision === 'pending',
    );

    if (hasPendingRecords || hasPendingDuplicates) {
      if (!node.flags) {
        node.flags = {};
      }
      node.flags.hasPendingReview = true;
    } else if (node.flags) {
      node.flags.hasPendingReview = false;
    }
  }
}
