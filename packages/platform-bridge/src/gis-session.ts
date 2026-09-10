/**
 * Canal compartido con el RDF Explorer: qué hay abierto ahora mismo en el GIS.
 *
 * El Explorer necesita saberlo ANTES de exportar, para avisar que el tablero
 * abierto va a ser reemplazado. Los remotes no comparten instancias de
 * servicios (misma razón que el handoff), así que el estado viaja por una
 * propiedad de `window`. El GIS escribe; el Explorer solo lee.
 *
 * Va en `window` y NO en sessionStorage a propósito: el estado del GIS vive en
 * memoria (signals de servicios root del shell) y muere con la página. Si se
 * guardara en sessionStorage sobreviviría a un F5 y el Explorer avisaría de un
 * tablero abierto que ya no existe.
 */

/** Propiedad de `window` que hace de canal. Versionada: cambiarla rompe el canal. */
export const GIS_SESSION_CHANNEL_KEY = '__rdfgisGisSession_v1';

export interface GisSessionState {
  /** id del tablero guardado que está abierto (null = vista sin guardar). */
  dashboardId: string | null;
  /** Nombre del tablero abierto, para nombrarlo en el aviso. */
  dashboardName: string | null;
  /**
   * Hay trabajo en riesgo: un tablero guardado abierto, o una consulta en
   * pantalla que NO es la que dejó la última importación. Una vista que es
   * exactamente el último handoff no cuenta: se regenera exportando de nuevo.
   */
  hasWorkAtRisk: boolean;
  updatedAt: string;
}

type ChannelHost = Record<string, unknown>;

function host(): ChannelHost | null {
  return typeof window === 'undefined' ? null : (window as unknown as ChannelHost);
}

export function publishGisSessionState(state: GisSessionState): void {
  const w = host();
  if (!w) return;
  w[GIS_SESSION_CHANNEL_KEY] = state;
}

export function clearGisSessionState(): void {
  const w = host();
  if (!w) return;
  delete w[GIS_SESSION_CHANNEL_KEY];
}

/** Lee el estado publicado; null si el GIS nunca arrancó en esta página. */
export function readGisSessionState(): GisSessionState | null {
  const w = host();
  if (!w) return null;
  const raw = w[GIS_SESSION_CHANNEL_KEY];
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as Partial<GisSessionState>;
  if (typeof candidate.hasWorkAtRisk !== 'boolean') return null;
  return {
    dashboardId: candidate.dashboardId ?? null,
    dashboardName: candidate.dashboardName ?? null,
    hasWorkAtRisk: candidate.hasWorkAtRisk,
    updatedAt: candidate.updatedAt ?? '',
  };
}
