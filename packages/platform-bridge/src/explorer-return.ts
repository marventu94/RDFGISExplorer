/** Transient navigation back to the query panel that exported to GIS. */
const key = '__rdfgisExplorerReturn_v1';
type Target = Window & { [key]?: string };
export function requestExplorerReturn(panelId: string): void {
  (window as Target)[key] = panelId;
}
export function consumeExplorerReturn(): string | null {
  const target = window as Target;
  const panelId = target[key] ?? null;
  delete target[key];
  return panelId;
}
