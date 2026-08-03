import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from './api.service';
import { AppConfigService } from './app-config.service';
import {
  exportAllPages,
  type ExportProgress,
  type PaginatedExportResult,
} from '@shared/export/result-exporter';
import { buildXlsx, type XlsxProvenance } from '@shared/export/xlsx';
import type { ResultBinding } from '@shared/models';

/**
 * Export completo del resultado a XLSX: recorre TODAS las filas de la query
 * paginando del lado del endpoint (ver shared/export/result-exporter) y las
 * descarga como workbook Excel (hoja "Resultado" con formato + hoja
 * "Proveniencia"). Es la semántica del summary (resultado completo), no la
 * de los lotes ni la de los filtros de las vistas.
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

  /** Genera el XLSX (con hoja de proveniencia) y dispara la descarga del archivo. */
  async downloadXlsx(params: {
    rows: ResultBinding[];
    variables: string[];
    backend: string;
    query: string;
    partial: boolean;
  }): Promise<void> {
    const provenance: XlsxProvenance = {
      backend: params.backend,
      query: params.query,
      exportedAt: new Date().toISOString(),
      rowCount: params.rows.length,
      partial: params.partial,
    };
    const blob = await buildXlsx(params.variables, params.rows, provenance);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `query-export-${new Date().toISOString().slice(0, 10)}.xlsx`;
    anchor.click();
    URL.revokeObjectURL(url);
  }
}
