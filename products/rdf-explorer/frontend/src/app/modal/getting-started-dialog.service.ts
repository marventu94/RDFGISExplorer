import { Injectable, inject, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Dialog } from '@angular/cdk/dialog';
import { GettingStartedDialogComponent } from './getting-started-dialog.component';

@Injectable({ providedIn: 'root' })
export class GettingStartedDialogService {
  private readonly dialog = inject(Dialog);
  private readonly destroyRef = inject(DestroyRef);

  open(): void {
    this.dialog.open(GettingStartedDialogComponent, {
      width: '90vw',
      maxWidth: '920px',
      hasBackdrop: true,
      backdropClass: 'cdk-overlay-dark-backdrop',
      panelClass: 'getting-started-panel',
    });
  }
}
