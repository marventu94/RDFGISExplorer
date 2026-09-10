/**
 * Contrato del handoff de consultas Explorer -> GIS.
 *
 * Los dos remotes son bundles independientes: no comparten instancias de
 * servicios de Angular, así que el traspaso viaja por `sessionStorage` más un
 * evento de `window`. Eso hace que la clave de storage, el TTL y el nombre del
 * evento SEAN el contrato: si un lado los cambia y el otro no, el handoff falla
 * en runtime y no lo detecta ni el compilador ni un test.
 *
 * Por eso viven acá, en un paquete del workspace que ambos remotes compilan
 * dentro de su propio bundle. Cada remote sigue teniendo su propio
 * `QueryHandoffService` (la instancia no se comparte); lo único compartido es
 * este contrato y la lógica de lectura/escritura.
 */

export interface HandoffPayload {
  query: string;
  backend: string;
  source: { workspaceId?: string; panelId?: string };
  /**
   * El Explorer ya avisó que la importación reemplaza el tablero abierto en el
   * GIS y el usuario aceptó: el GIS no vuelve a preguntar.
   */
  overwriteConfirmed?: boolean;
  publishedAt: string;
}

export interface HandoffPayloadInput {
  query: string;
  backend: string;
  source: { workspaceId?: string; panelId?: string };
  overwriteConfirmed?: boolean;
}

/** Clave en sessionStorage donde espera el handoff pendiente. */
export const HANDOFF_STORAGE_KEY = 'platform.handoff.pending';

/** Un handoff más viejo que esto se descarta: quedó de una navegación anterior. */
export const HANDOFF_TTL_MS = 5 * 60 * 1000;

/** Evento de `window` que avisa del handoff dentro de la MISMA pestaña. */
export const HANDOFF_EVENT = 'query-handoff';

/** Preferencia del usuario: ejecutar la consulta importada automáticamente. */
export const HANDOFF_AUTO_RUN_KEY = 'platform.handoff.autoRun';

export function isHandoffExpired(publishedAt: string): boolean {
  return Date.now() - new Date(publishedAt).getTime() > HANDOFF_TTL_MS;
}

/**
 * Handoff pendiente, o null si no hay. Uno vencido o corrupto se descarta Y se
 * limpia, así no queda basura esperando en el storage.
 */
export function readPendingHandoff(): HandoffPayload | null {
  const raw = sessionStorage.getItem(HANDOFF_STORAGE_KEY);
  if (!raw) return null;
  try {
    const payload = JSON.parse(raw) as HandoffPayload;
    if (isHandoffExpired(payload.publishedAt)) {
      clearPendingHandoff();
      return null;
    }
    return payload;
  } catch {
    clearPendingHandoff();
    return null;
  }
}

/** Publica el handoff y avisa a la pestaña actual. Devuelve el payload sellado. */
export function writePendingHandoff(input: HandoffPayloadInput): HandoffPayload {
  const payload: HandoffPayload = {
    ...input,
    publishedAt: new Date().toISOString(),
  };
  sessionStorage.setItem(HANDOFF_STORAGE_KEY, JSON.stringify(payload));
  window.dispatchEvent(new CustomEvent(HANDOFF_EVENT, { detail: payload }));
  return payload;
}

export function clearPendingHandoff(): void {
  sessionStorage.removeItem(HANDOFF_STORAGE_KEY);
}

/**
 * Avisa cuando cambia el handoff: por el evento propio (misma pestaña, que es
 * el caso real del shell) y por `storage` (otras pestañas). Devuelve la función
 * para desuscribirse.
 */
export function subscribeHandoffChanges(onChange: () => void): () => void {
  const onCustomEvent = (): void => onChange();
  const onStorageEvent = (e: StorageEvent): void => {
    if (e.key === HANDOFF_STORAGE_KEY) onChange();
  };

  window.addEventListener(HANDOFF_EVENT, onCustomEvent);
  window.addEventListener('storage', onStorageEvent);

  return () => {
    window.removeEventListener(HANDOFF_EVENT, onCustomEvent);
    window.removeEventListener('storage', onStorageEvent);
  };
}

/** Por defecto true: al importar una consulta se ejecuta sin pedir confirmación. */
export function getAutoRunHandoff(): boolean {
  const value = localStorage.getItem(HANDOFF_AUTO_RUN_KEY);
  return value === null ? true : value === 'true';
}

export function setAutoRunHandoff(value: boolean): void {
  localStorage.setItem(HANDOFF_AUTO_RUN_KEY, String(value));
}
