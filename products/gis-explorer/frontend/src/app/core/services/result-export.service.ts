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
import { I18nService } from './i18n.service';

/**
 * Export the complete query result as an XLSX workbook with result and provenance
 * sheets, fetching every page through shared/export/result-exporter.
 * The navbar adds active spatial and temporal filters to the query before export;
 * the traversal includes all matching rows across batches.
 */
@Injectable({ providedIn: 'root' })
export class ResultExportService {
  private readonly api = inject(ApiService);
  private readonly appConfig = inject(AppConfigService);
  private readonly i18n = inject(I18nService);

  /** Fetch every page of a server-paged or filtered query result. */
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

  /** Build the XLSX workbook with provenance and trigger its download. */
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
    const blob = await buildXlsx(params.variables, params.rows, provenance, this.i18n.language());
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `query-export-${new Date().toISOString().slice(0, 10)}.xlsx`;
    anchor.click();
    URL.revokeObjectURL(url);
  }
}
