/** Shared execution/config ceiling. Callers may request a shorter timeout. */
export const QUERY_TIMEOUT_MS = 180_000;

export function queryTimeout(configured?: string, requested?: number): number {
  const parsed = Number(configured);
  const budget = Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, QUERY_TIMEOUT_MS) : QUERY_TIMEOUT_MS;
  return requested && requested > 0 ? Math.min(requested, budget) : budget;
}
