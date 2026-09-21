import { Injectable, inject } from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { firstValueFrom } from 'rxjs';

import { readGisSessionState } from './gis-session-channel';
import { MessageDialogComponent } from '../shell/message-dialog/message-dialog.component';
import type { MessageDialogData } from '../shell/message-dialog/message-dialog.component';

export type HandoffDecision =
  /** No había nada que pisar: exportar directo. */
  | 'proceed'
  /** Había un tablero abierto y el usuario aceptó reemplazarlo. */
  | 'proceed-confirmed'
  /** El usuario quiere ir al GIS a guardar antes de exportar. */
  | 'go-save'
  | 'cancel';

/**
 * Aviso previo al handoff: una query exportada reemplaza en el GIS la
 * consulta, el layout y los filtros del tablero abierto. Antes de publicarla
 * se pregunta, con la opción de ir a guardar primero.
 *
 * El estado del GIS llega por el canal compartido (`gis-session-channel`); si
 * el GIS no se abrió en esta página no hay nada que perder y no se pregunta.
 */
@Injectable({ providedIn: 'root' })
export class GisOverwriteGuardService {
  private readonly dialog = inject(Dialog);

  async askBeforeHandoff(): Promise<HandoffDecision> {
    const gis = readGisSessionState();
    if (!gis?.hasWorkAtRisk) return 'proceed';

    const name = gis.dashboardName;
    const data: MessageDialogData = {
      kind: 'info',
      title: name ? `Vas a reemplazar "${name}" en GIS` : 'Vas a reemplazar la vista de GIS',
      message: name
        ? `En GIS tenés abierto el tablero "${name}". Al exportar se reemplaza su ` +
          'consulta, su layout y sus filtros: lo que no hayas guardado se pierde.'
        : 'En GIS hay una vista sin guardar. Al exportar se reemplaza su consulta, ' +
          'su layout y sus filtros: si no la guardás, se pierde.',
      actions: [
        { label: 'Cancelar', value: 'cancel' },
        { label: 'Ir a GIS a guardar', value: 'go-save' },
        { label: 'Exportar igual', value: 'export', primary: true },
      ],
    };

    const choice = await firstValueFrom(
      this.dialog.open<string>(MessageDialogComponent, { data }).closed,
    );

    if (choice === 'export') return 'proceed-confirmed';
    if (choice === 'go-save') return 'go-save';
    return 'cancel';
  }
}
