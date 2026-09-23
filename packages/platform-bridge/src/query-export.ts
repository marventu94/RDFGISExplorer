export interface QueryExportCandidate {
  id: string;
  label: string;
  query: string;
  backend: string;
  source: { workspaceId?: string; panelId?: string };
}

export interface QueryExportProvider {
  listCandidates(): readonly QueryExportCandidate[];
}

const QUERY_EXPORT_PROVIDER_KEY = '__rdfgisQueryExportProvider_v1';
const QUERY_EXPORT_REQUEST_EVENT = 'rdfgis:query-export-request';

type BridgeWindow = Window & {
  [QUERY_EXPORT_PROVIDER_KEY]?: QueryExportProvider;
};

function browserWindow(): BridgeWindow | null {
  return typeof window === 'undefined' ? null : (window as BridgeWindow);
}

export function registerQueryExportProvider(provider: QueryExportProvider): () => void {
  const target = browserWindow();
  if (!target) return () => undefined;
  target[QUERY_EXPORT_PROVIDER_KEY] = provider;
  return () => {
    if (target[QUERY_EXPORT_PROVIDER_KEY] === provider) {
      delete target[QUERY_EXPORT_PROVIDER_KEY];
    }
  };
}

export function queryExportProvider(): QueryExportProvider | null {
  return browserWindow()?.[QUERY_EXPORT_PROVIDER_KEY] ?? null;
}

/** Requests the host to run its centralized Explorer -> GIS handoff flow. */
export function requestQueryExport(): boolean {
  const target = browserWindow();
  if (!target) return false;
  return target.dispatchEvent(new CustomEvent(QUERY_EXPORT_REQUEST_EVENT));
}

/** Registers the Shell-side orchestration without coupling a remote to Angular services. */
export function onQueryExportRequest(listener: () => void): () => void {
  const target = browserWindow();
  if (!target) return () => undefined;
  target.addEventListener(QUERY_EXPORT_REQUEST_EVENT, listener);
  return () => target.removeEventListener(QUERY_EXPORT_REQUEST_EVENT, listener);
}
