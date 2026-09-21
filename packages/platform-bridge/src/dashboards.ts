import type { Dashboard } from '@rdfgis/contracts';

export type DashboardKind = Dashboard['kind'];
export type DashboardImportMode = 'replace' | 'tabs';

/** State boundary implemented by a remote. It knows no persistence API. */
export interface DashboardStateAdapter {
  readonly kind: DashboardKind;
  exportPayload(): object | Promise<object>;
  importPayload(payload: object, context: {
    id: string;
    name: string;
    mode: DashboardImportMode;
  }): void | Promise<void>;
  reset?(): void;
}

export interface DashboardSaveCommand {
  kind: DashboardKind;
  name: string;
  mode: 'overwrite' | 'copy';
  currentId?: string | null;
}

/** High-level persistence commands owned and implemented by the Shell. */
export interface DashboardHost {
  list(kind?: DashboardKind): Promise<Dashboard[]>;
  load(id: string, mode?: DashboardImportMode): Promise<Dashboard>;
  save(command: DashboardSaveCommand): Promise<Dashboard>;
  delete(id: string): Promise<void>;
  nameExists(kind: DashboardKind, name: string, excludeId?: string | null): Promise<boolean>;
}

const DASHBOARD_HOST_KEY = '__rdfgisDashboardHost_v2';
const STATE_ADAPTERS_KEY = '__rdfgisDashboardStateAdapters_v1';
type BridgeWindow = Window & {
  [DASHBOARD_HOST_KEY]?: DashboardHost;
  [STATE_ADAPTERS_KEY]?: Partial<Record<DashboardKind, DashboardStateAdapter>>;
};

function browserWindow(): BridgeWindow | null {
  return typeof window === 'undefined' ? null : (window as BridgeWindow);
}

export function registerDashboardHost(host: DashboardHost): () => void {
  const target = browserWindow();
  if (!target) return () => undefined;
  target[DASHBOARD_HOST_KEY] = host;
  return () => {
    if (target[DASHBOARD_HOST_KEY] === host) delete target[DASHBOARD_HOST_KEY];
  };
}

export function isDashboardHostAvailable(): boolean {
  return !!browserWindow()?.[DASHBOARD_HOST_KEY];
}

export function dashboardHost(): DashboardHost {
  const host = browserWindow()?.[DASHBOARD_HOST_KEY];
  if (!host) throw new Error('La persistencia de tableros solo está disponible dentro del Shell.');
  return host;
}

export function registerDashboardStateAdapter(adapter: DashboardStateAdapter): () => void {
  const target = browserWindow();
  if (!target) return () => undefined;
  const adapters = target[STATE_ADAPTERS_KEY] ??= {};
  adapters[adapter.kind] = adapter;
  return () => {
    if (adapters[adapter.kind] === adapter) delete adapters[adapter.kind];
  };
}

export function dashboardStateAdapter(kind: DashboardKind): DashboardStateAdapter {
  const adapter = browserWindow()?.[STATE_ADAPTERS_KEY]?.[kind];
  if (!adapter) throw new Error(`El remote ${kind} todavía no registró su adaptador de estado.`);
  return adapter;
}
