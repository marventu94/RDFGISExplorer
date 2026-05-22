import {
  Component,
  input,
  output,
  inject,
  computed,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';

import { CurationService } from '@core/services/curation.service';
import type { NormalizedNode, DuplicateCandidate } from '@shared/models';
import { DuplicateDecisionDialogComponent } from '../dialogs/duplicate-decision-dialog.component';

@Component({
  selector: 'app-duplicates-tab',
  standalone: true,
  imports: [
    MatButtonModule,
    MatIconModule,
    MatSnackBarModule,
    MatDialogModule,
    MatTooltipModule,
  ],
  templateUrl: './duplicates-tab.component.html',
  styleUrl: './duplicates-tab.component.scss',
})
export class DuplicatesTabComponent {
  private readonly curationService = inject(CurationService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);

  readonly node = input<NormalizedNode | null>(null);
  readonly duplicates = input<DuplicateCandidate[]>([]);
  readonly decisionMade = output<void>();

  protected readonly sortedDuplicates = computed(() => {
    return [...this.duplicates()].sort((a, b) => b.score - a.score);
  });

  protected otherUri(dup: DuplicateCandidate): string {
    const n = this.node();
    if (!n) return '';
    return dup.nodeUriA === n.uri ? dup.nodeUriB : dup.nodeUriA;
  }

  protected scorePercent(score: number): string {
    return `${(score * 100).toFixed(0)}%`;
  }

  protected shortenUri(uri: string): string {
    if (!uri) return '';
    const hashIndex = uri.lastIndexOf('#');
    if (hashIndex > 0) {
      const fragment = uri.substring(hashIndex + 1);
      return fragment;
    }
    const parts = uri.split('/');
    return parts[parts.length - 1] || uri;
  }

  protected async confirmDuplicate(dup: DuplicateCandidate): Promise<void> {
    const dialogRef = this.dialog.open(DuplicateDecisionDialogComponent, {
      width: '360px',
      data: { otherUri: this.otherUri(dup), action: 'confirm' },
    });

    const confirmed = await firstValueFrom(dialogRef.afterClosed());
    if (!confirmed) return;

    await this.sendDecision(dup.id, 'confirmed');
  }

  protected async rejectDuplicate(dup: DuplicateCandidate): Promise<void> {
    await this.sendDecision(dup.id, 'rejected');
  }

  protected async deferDuplicate(dup: DuplicateCandidate): Promise<void> {
    await this.sendDecision(dup.id, 'pending');
  }

  protected formatDate(isoDate: string | undefined): string {
    if (!isoDate) return '';
    try {
      return new Date(isoDate).toLocaleString('es-AR');
    } catch {
      return isoDate;
    }
  }

  private async sendDecision(
    id: number,
    decision: 'confirmed' | 'rejected' | 'pending',
  ): Promise<void> {
    try {
      await firstValueFrom(this.curationService.decideDuplicate(id, decision));
      const label =
        decision === 'confirmed'
          ? 'Duplicado confirmado'
          : decision === 'rejected'
            ? 'Duplicado descartado'
            : 'Decisión diferida';
      this.snackBar.open(label, 'Cerrar', { duration: 2000 });
      this.decisionMade.emit();
      // TODO: When confirming a duplicate, update node.flags.isConfirmedDuplicate
      // on the current node and trigger a refresh of the other node's flags via SelectionService
    } catch {
      this.snackBar.open('Error al guardar decisión', 'Cerrar', {
        duration: 3000,
      });
    }
  }
}
