import { Injectable, inject } from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { firstValueFrom } from 'rxjs';

import { I18nService } from './i18n.service';
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
  private readonly i18n = inject(I18nService);

  /**
   * @param targetName nombre del tablero que se quiere abrir, para el mensaje.
   */
  async askBeforeOpen(targetId: string, targetName: string): Promise<OpenDecision> {
    const gis = readGisSessionState();
    if (!gis?.hasWorkAtRisk) return 'proceed';

    const openName = gis.dashboardName;
    const reopeningSame = gis.dashboardId !== null && gis.dashboardId === targetId;

    const t = this.i18n;
    const data: MessageDialogData = {
      title: reopeningSame
        ? t.text('Vas a volver a cargar "{name}"', { name: targetName })
        : openName
          ? t.text('Vas a reemplazar "{name}" en GIS', { name: openName })
          : t.text('Vas a reemplazar la vista de GIS'),
      message: reopeningSame
        ? t.text('Se vuelve a cargar el tablero como está guardado: los cambios que hayas hecho y no guardaste se pierden.')
        : openName
          ? t.text(
              'En GIS tenés abierto el tablero "{open}". Al abrir "{target}" se reemplaza su consulta, su layout y sus filtros: lo que no hayas guardado se pierde.',
              { open: openName, target: targetName },
            )
          : t.text(
              'En GIS hay una vista sin guardar. Al abrir "{target}" se reemplaza su consulta, su layout y sus filtros: si no la guardás, se pierde.',
              { target: targetName },
            ),
      actions: [
        { label: t.text('Cancelar'), value: 'cancel' },
        { label: t.text('Ir a GIS a guardar'), value: 'go-save' },
        { label: t.text('Abrir igual'), value: 'open', primary: true },
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

    const t = this.i18n;
    const data: MessageDialogData = {
      title: gis.dashboardName
        ? t.text('Vas a reemplazar "{name}" en GIS', { name: gis.dashboardName })
        : t.text('Vas a reemplazar la vista de GIS'),
      message: gis.dashboardName
        ? t.text(
            'En GIS tenés abierto el tablero "{name}". Al explorar esta consulta se reemplazan su consulta, layout y filtros: lo que no hayas guardado se pierde.',
            { name: gis.dashboardName },
          )
        : t.text('En GIS hay una vista sin guardar. Al explorar esta consulta se reemplazan su consulta, layout y filtros.'),
      actions: [
        { label: t.text('Cancelar'), value: 'cancel' },
        { label: t.text('Ir a GIS a guardar'), value: 'go-save' },
        { label: t.text('Explorar igual'), value: 'open', primary: true },
      ],
    };
    const choice = await firstValueFrom(this.dialog.open<string>(MessageDialogComponent, { data }).closed);
    if (choice === 'open') return 'proceed-confirmed';
    if (choice === 'go-save') return 'go-save';
    return 'cancel';
  }
}
