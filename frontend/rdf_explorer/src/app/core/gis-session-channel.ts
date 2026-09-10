/**
 * Lectura del canal compartido que publica el GIS con lo que tiene abierto.
 *
 * Espejo de `gis-session-channel.ts` del remote GIS (que es quien escribe):
 * los servicios no se pueden compartir entre remotes, así que el contrato se
 * duplica, igual que QueryHandoffService. Acá solo se lee.
 *
 * El estado vive en `window` y no en sessionStorage a propósito: el GIS lo
 * mantiene en memoria y muere con la página, así que después de un F5 no queda
 * un aviso fantasma de un tablero que ya no está abierto.
 */

const CHANNEL_KEY = '__rdfgisGisSession_v1';

export interface GisSessionState {
  dashboardId: string | null;
  dashboardName: string | null;
  /**
   * Hay trabajo en riesgo en el GIS: un tablero guardado abierto, o una
   * consulta que no es la que dejó la última exportación.
   */
  hasWorkAtRisk: boolean;
  updatedAt: string;
}

/** Estado publicado por el GIS; null si nunca se abrió en esta página. */
export function readGisSessionState(): GisSessionState | null {
  if (typeof window === 'undefined') return null;
  const raw = (window as unknown as Record<string, unknown>)[CHANNEL_KEY];
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
