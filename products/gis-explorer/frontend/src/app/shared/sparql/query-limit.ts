import { Parser } from 'sparqljs';

/** Explicit result boundaries in the user's query, independent of lot size. */
export interface QueryLimitNotice {
  limit: number | null;
  offset: number | null;
}

export function buildQueryLimitNotice(sparql: string): QueryLimitNotice | null {
  if (!sparql.trim()) return null;
  try {
    const ast = new Parser().parse(sparql) as { limit?: number; offset?: number };
    const limit = typeof ast.limit === 'number' ? ast.limit : null;
    const offset = typeof ast.offset === 'number' ? ast.offset : null;
    return limit !== null || offset !== null ? { limit, offset } : null;
  } catch {
    return null;
  }
}

export function detectTopLevelLimit(sparql: string): number | null {
  return buildQueryLimitNotice(sparql)?.limit ?? null;
}
