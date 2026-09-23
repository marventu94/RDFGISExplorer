import { Injectable, inject } from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { firstValueFrom } from 'rxjs';

import { readGisSessionState } from './gis-session-channel';
import { MessageDialogComponent } from '../shell/message-dialog.component';
import type { MessageDialogData } from '../shell/message-dialog.component';

export type OpenDecision =
  /** No había nada que perder: abrir directo. */
  | 'proceed'
  /** Había trabajo abierto en GIS y el usuario aceptó reemplazarlo. */
  | 'proceed-confirmed'
  /** El usuario quiere volver a GIS a guardar antes de abrir otra cosa. */
  | 'go-save'
  | 'cancel';

/**
 * Aviso previo a abrir un tablero GIS desde el shell: cargarlo reemplaza la
 * consulta, el layout y los filtros de lo que haya abierto en GIS, igual que
 * hace una importación del Explorer.
 *
 * Es el mismo criterio (y el mismo canal `window`) que usa el aviso de
 * "Explorar en GIS" del Explorer: si el GIS no se abrió en esta página, o no
 * tiene nada en riesgo, no se pregunta nada.
 */
@Injectable({ providedIn: 'root' })
export class GisOpenGuardService {
  private readonly dialog = inject(Dialog);

  /**
   * @param targetName nombre del tablero que se quiere abrir, para el mensaje.
   */
  async askBeforeOpen(targetId: string, targetName: string): Promise<OpenDecision> {
    const gis = readGisSessionState();
    if (!gis?.hasWorkAtRisk) return 'proceed';

    const openName = gis.dashboardName;
    const reopeningSame = gis.dashboardId !== null && gis.dashboardId === targetId;

    const data: MessageDialogData = {
      title: reopeningSame
        ? `Vas a volver a cargar "${targetName}"`
        : openName
          ? `Vas a reemplazar "${openName}" en GIS`
          : 'Vas a reemplazar la vista de GIS',
      message: reopeningSame
        ? 'Se vuelve a cargar el tablero como está guardado: los cambios que hayas ' +
          'hecho y no guardaste se pierden.'
        : openName
          ? `En GIS tenés abierto el tablero "${openName}". Al abrir "${targetName}" se ` +
            'reemplaza su consulta, su layout y sus filtros: lo que no hayas guardado se pierde.'
          : `En GIS hay una vista sin guardar. Al abrir "${targetName}" se reemplaza su ` +
            'consulta, su layout y sus filtros: si no la guardás, se pierde.',
      actions: [
        { label: 'Cancelar', value: 'cancel' },
        { label: 'Ir a GIS a guardar', value: 'go-save' },
        { label: 'Abrir igual', value: 'open', primary: true },
      ],
    };

    const choice = await firstValueFrom(
      this.dialog.open<string>(MessageDialogComponent, { data }).closed,
    );

    if (choice === 'open') return 'proceed-confirmed';
    if (choice === 'go-save') return 'go-save';
    return 'cancel';
  }

  async askBeforeHandoff(): Promise<OpenDecision> {
    const gis = readGisSessionState();
    if (!gis?.hasWorkAtRisk) return 'proceed';

    const data: MessageDialogData = {
      title: gis.dashboardName
        ? `Vas a reemplazar "${gis.dashboardName}" en GIS`
        : 'Vas a reemplazar la vista de GIS',
      message: gis.dashboardName
        ? `En GIS tenés abierto el tablero "${gis.dashboardName}". Al explorar esta consulta se reemplazan su consulta, layout y filtros: lo que no hayas guardado se pierde.`
        : 'En GIS hay una vista sin guardar. Al explorar esta consulta se reemplazan su consulta, layout y filtros.',
      actions: [
        { label: 'Cancelar', value: 'cancel' },
        { label: 'Ir a GIS a guardar', value: 'go-save' },
        { label: 'Explorar igual', value: 'open', primary: true },
      ],
    };
    const choice = await firstValueFrom(this.dialog.open<string>(MessageDialogComponent, { data }).closed);
    if (choice === 'open') return 'proceed-confirmed';
    if (choice === 'go-save') return 'go-save';
    return 'cancel';
  }
}
