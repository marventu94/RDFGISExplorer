import type { Query } from '../graph/domain';

/** The root variable distinguishes queries from the same active panel. */
export function queryExportLabel(queryIndex: number, query: Query): string {
  const rootVariable = query.root.isVariable() ? String(query.root.variable).trim() : '';
  return rootVariable || `Query ${queryIndex + 1}`;
}
