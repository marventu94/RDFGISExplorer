import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from './api.service';
import { AppConfigService } from './app-config.service';
import {
  exportAllPages,
  type ExportProgress,
  type PaginatedExportResult,
} from '@shared/export/result-exporter';
import { buildCsv, type CsvProvenance } from '@shared/export/csv';
import type { ResultBinding } from '@shared/models';

/**
 * Export completo del resultado a CSV: recorre TODAS las filas de la query
 * paginando del lado del endpoint (ver shared/export/result-exporter) y las
 * descarga como archivo con encabezado de proveniencia. Es la semántica del
 * summary (resultado completo), no la de los lotes ni la de los filtros de
 * las vistas.
 */
@Injectable({ providedIn: 'root' })
export class ResultExportService {
  private readonly api = inject(ApiService);
  private readonly appConfig = inject(AppConfigService);

  /** Recorre el resultado completo página a página (solo para resultados truncados). */
  exportAll(params: {
    query: string;
    onProgress?: (p: ExportProgress) => void;
    isCancelled?: () => boolean;
  }): Promise<PaginatedExportResult> {
    return firstValueFrom(this.appConfig.load()).then((cfg) =>
      exportAllPages({
        query: params.query,
        pageSize: cfg.maxLimit,
        maxRows: cfg.limits.exportMaxRows,
        minPageSize: cfg.limits.exportMinPageSize,
        fetchPage: (sparql, limit) =>
          firstValueFrom(this.api.executeQuery({ sparql, limit, raw: true })),
        onProgress: params.onProgress,
        isCancelled: params.isCancelled,
      }),
    );
  }

  /** Genera el CSV (con proveniencia) y dispara la descarga del archivo. */
  downloadCsv(params: {
    rows: ResultBinding[];
    variables: string[];
    backend: string;
    query: string;
    partial: boolean;
  }): void {
    const provenance: CsvProvenance = {
      backend: params.backend,
      query: params.query,
      exportedAt: new Date().toISOString(),
      rowCount: params.rows.length,
      partial: params.partial,
    };
    const csv = buildCsv(params.variables, params.rows, provenance);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `query-export-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }
}
