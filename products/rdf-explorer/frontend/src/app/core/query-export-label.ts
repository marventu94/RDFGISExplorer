import type { Query } from '../graph/domain';

/** Matches the structured root-variable label shown by the SPARQL queries panel. */
export function queryExportLabel(panelName: string, queryIndex: number, query: Query): string {
  const rootVariable = query.root.isVariable() ? String(query.root.variable).trim() : '';
  const queryName = rootVariable
    ? `Query ${queryIndex + 1} (${rootVariable})`
    : `Query ${queryIndex + 1}`;
  return `${panelName} · ${queryName}`;
}
