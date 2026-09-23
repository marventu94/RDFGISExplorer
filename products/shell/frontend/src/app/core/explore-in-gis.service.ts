import { Injectable, inject } from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import {
  queryExportProvider,
  writePendingHandoff,
  type QueryExportCandidate,
} from '@rdfgis/platform-bridge';
import { GisOpenGuardService } from './gis-open-guard.service';
import { MessageDialogComponent, type MessageDialogData } from '../shell/message-dialog.component';
import {
  QuerySelectionDialogComponent,
  type QuerySelectionDialogData,
} from '../shell/query-selection-dialog.component';

@Injectable({ providedIn: 'root' })
export class ExploreInGisService {
  private readonly dialog = inject(Dialog);
  private readonly router = inject(Router);
  private readonly gisGuard = inject(GisOpenGuardService);

  async explore(): Promise<void> {
    const candidates = queryExportProvider()?.listCandidates() ?? [];
    if (candidates.length === 0) {
      this.dialog.open(MessageDialogComponent, {
        data: {
          title: 'No hay consulta para explorar',
          message: 'El panel activo no tiene un patrón completo. Agregá al menos un nodo con una propiedad y su valor.',
        } satisfies MessageDialogData,
      });
      return;
    }

    const selected = candidates.length === 1
      ? candidates[0]
      : await firstValueFrom(
          this.dialog.open<QueryExportCandidate>(QuerySelectionDialogComponent, {
            data: { candidates } satisfies QuerySelectionDialogData,
          }).closed,
        );
    if (!selected) return;

    const decision = await this.gisGuard.askBeforeHandoff();
    if (decision === 'cancel') return;
    if (decision === 'go-save') {
      await this.router.navigate(['/gis']);
      return;
    }

    writePendingHandoff({
      query: selected.query,
      backend: selected.backend,
      source: selected.source,
      overwriteConfirmed: decision === 'proceed-confirmed',
    });
    await this.router.navigate(['/gis'], { queryParams: { handoff: '1' } });
  }
}
