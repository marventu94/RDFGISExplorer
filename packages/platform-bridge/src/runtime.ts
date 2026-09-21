export type ExplorerKind = 'rdf' | 'gis';
const API_BASES_KEY = '__rdfgisExplorerApiBases_v1';
type RuntimeWindow = Window & { [API_BASES_KEY]?: Partial<Record<ExplorerKind, string>> };

export function configureExplorerApiBases(bases: Partial<Record<ExplorerKind, string>>): void {
  if (typeof window !== 'undefined') (window as RuntimeWindow)[API_BASES_KEY] = { ...bases };
}

export function explorerApiBase(kind: ExplorerKind): string {
  if (typeof window === 'undefined') return '/api';
  return (window as RuntimeWindow)[API_BASES_KEY]?.[kind] ?? '/api';
}
