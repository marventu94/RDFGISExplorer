import type { QueryResult, ResultBinding } from '@shared/models';
import { buildPagedQuery, wrapUserQuery } from './export-query';

/**
 * Paginador del export completo: recorre el resultado entero de la query con
 * OFFSET/LIMIT sobre la query envuelta (ver export-query.ts), acumulando las
 * filas hasta la página vacía (o corta). No sabe de Angular: la página se pide
 * con la función `fetchPage` inyectada, así el loop es testeable puro.
 *
 * - Reintento adaptativo: si una página agota el tiempo de espera, se reintenta
 *   la MISMA página con tamaño mitad (2000→1000→500); por debajo de
 *   MIN_PAGE_SIZE se aborta con error claro.
 * - Tope: al llegar a `maxRows` corta y devuelve status 'max-rows' (la UI
 *   decide si exporta el parcial).
 * - Cancelación cooperativa: se chequea `isCancelled()` antes de cada página.
 */

export const DEFAULT_MAX_EXPORT_ROWS = 50_000;
export const DEFAULT_MIN_PAGE_SIZE = 250;

export interface ExportProgress {
  rowsFetched: number;
  page: number;
  pageSize: number;
}

export type ExportStatus = 'complete' | 'max-rows' | 'cancelled' | 'error';

export interface PaginatedExportResult {
  status: ExportStatus;
  rows: ResultBinding[];
  variables: string[];
  /** Tope aplicado (relevante cuando status es 'max-rows'). */
  maxRows: number;
  error?: string;
}

export interface PaginatedExportOptions {
  query: string;
  /** Tamaño de página inicial (típicamente el maxLimit del /api/config). */
  pageSize: number;
  maxRows?: number;
  /** Piso del reintento adaptativo de página (default DEFAULT_MIN_PAGE_SIZE). */
  minPageSize?: number;
  fetchPage: (sparql: string, limit: number) => Promise<QueryResult>;
  isTimeout?: (err: unknown) => boolean;
  isCancelled?: () => boolean;
  onProgress?: (p: ExportProgress) => void;
}

/** Timeout: 408 del backend (TimeoutError → REQUEST_TIMEOUT) o error de red por aborto. */
export function defaultIsTimeout(err: unknown): boolean {
  const status = (err as { status?: number } | null)?.status;
  const name = (err as { name?: string } | null)?.name;
  return status === 408 || name === 'TimeoutError';
}

export async function exportAllPages(
  opts: PaginatedExportOptions,
): Promise<PaginatedExportResult> {
  const maxRows = opts.maxRows ?? DEFAULT_MAX_EXPORT_ROWS;
  const minPageSize = Math.max(1, Math.floor(opts.minPageSize ?? DEFAULT_MIN_PAGE_SIZE));
  const isTimeout = opts.isTimeout ?? defaultIsTimeout;
  const wrapped = wrapUserQuery(opts.query);

  const rows: ResultBinding[] = [];
  let variables: string[] = [];
  let offset = 0;
  let page = 0;
  let pageSize = Math.max(minPageSize, Math.floor(opts.pageSize));

  for (;;) {
    if (opts.isCancelled?.()) {
      return { status: 'cancelled', rows, variables, maxRows };
    }

    const sparql = buildPagedQuery(wrapped, offset, pageSize);
    let result: QueryResult;
    try {
      result = await opts.fetchPage(sparql, pageSize);
    } catch (e) {
      if (isTimeout(e)) {
        const reduced = Math.floor(pageSize / 2);
        if (reduced < minPageSize) {
          return {
            status: 'error',
            error: `El endpoint agotó el tiempo de espera incluso con páginas de ${pageSize} filas`,
            rows,
            variables,
            maxRows,
          };
        }
        pageSize = reduced;
        continue;
      }
      return {
        status: 'error',
        error: e instanceof Error ? e.message : String(e),
        rows,
        variables,
        maxRows,
      };
    }

    page++;
    if (result.variables.length > 0) variables = result.variables;
    rows.push(...result.bindings);
    opts.onProgress?.({ rowsFetched: rows.length, page, pageSize });

    // Página corta (o vacía): no hay más filas.
    if (result.bindings.length < pageSize) {
      return { status: 'complete', rows, variables, maxRows };
    }
    offset += result.bindings.length;
    if (rows.length >= maxRows) {
      return { status: 'max-rows', rows: rows.slice(0, maxRows), variables, maxRows };
    }
  }
}
