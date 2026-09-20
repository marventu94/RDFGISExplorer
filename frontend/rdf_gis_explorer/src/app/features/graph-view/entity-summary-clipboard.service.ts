import { Injectable } from '@angular/core';
import type { EntitySubgraph, SubgraphBudget } from './entity-subgraph';
import { explorationSubgraph, isExplorationActive, type ExplorationContext, type ExplorationState } from './entity-exploration';
import { buildAvailableStructure } from './entity-structure';
import {
  buildEntitySummary,
  summaryScopeLabel,
  type EntitySummaryDocument,
  type EntitySummaryMetrics,
  type SummaryLotInfo,
  type SummaryScope,
} from './entity-summary-text';

/**
 * Etapa 6 del plan de mejoras del graph-view: única pieza con dependencias de
 * plataforma. Arma el texto con los módulos puros (`entity-structure`,
 * `entity-summary-text`) y lo escribe en el portapapeles.
 *
 * Contrato pensado para que la etapa 5 conecte dos botones sin lógica propia:
 *
 * ```ts
 * const result = await this.summaryClipboard.copyCurrentView({
 *   context: { visibleResult, fullResult },
 *   state: this.explorationState(),
 *   lot: { currentLot, lotCount, totalRows, visibleRows, truncated },
 *   subgraph: this.subgraph(),   // opcional: evita recalcular
 * });
 * this.announce(result.message, result.status);   // snackbar + aria-live
 * ```
 *
 * Todo resultado es **tipado**: la UI nunca tiene que interpretar excepciones
 * ni adivinar si hubo copia. Si `navigator.clipboard` no existe o rechaza, se
 * intenta el fallback histórico (`document.execCommand('copy')`) y, si tampoco
 * está, se devuelve `unsupported` con el texto completo para que la vista lo
 * ofrezca a mano. El texto se devuelve **siempre**, en todos los estados.
 */

export type SummaryCopyStatus =
  /** Copiado con `navigator.clipboard`. */
  | 'copied'
  /** Copiado con el fallback `document.execCommand('copy')`. */
  | 'copied-fallback'
  /** No hay exploración de entidad activa: no hay alcance que copiar. */
  | 'no-entity'
  /** La raíz no tiene estructura en el resultado: no se copia nada. */
  | 'empty'
  /** El entorno no ofrece ningún mecanismo de copia. */
  | 'unsupported'
  /** Había mecanismo y falló. */
  | 'failed';

export interface SummaryCopyResult {
  status: SummaryCopyStatus;
  scope: SummaryScope;
  /** `true` sólo en `copied` y `copied-fallback`. */
  copied: boolean;
  /** Texto generado; disponible incluso cuando la copia falló. */
  text: string;
  /** Mensaje en español listo para snackbar y para una región `aria-live`. */
  message: string;
  /** Conteos exactos del texto copiado. `null` si no se generó documento. */
  metrics: EntitySummaryMetrics | null;
  /** Detalle del fallo, sólo en `failed`. */
  error?: string;
}

export interface EntitySummaryRequest {
  /** Resultado visible y, si existe, el completo (mismo de la etapa 3). */
  context: ExplorationContext;
  /** Estado de exploración de la etapa 4. */
  state: ExplorationState;
  /** Contexto de lote para el encabezado. */
  lot?: SummaryLotInfo | null;
  /**
   * Subgrafo ya calculado por la vista para el alcance `view`. Si se omite se
   * recalcula con `explorationSubgraph` (mismo resultado, más trabajo).
   */
  subgraph?: EntitySubgraph | null;
  /** Qué atributos listar. `'root'` por defecto. */
  attributes?: 'root' | 'all' | 'none';
  /** Override del presupuesto del alcance `structure`. */
  structureBudget?: Partial<SubgraphBudget>;
}

@Injectable({ providedIn: 'root' })
export class EntitySummaryClipboardService {
  /** Documento de la vista explorada. `null` si no hay exploración activa. */
  buildCurrentViewDocument(request: EntitySummaryRequest): EntitySummaryDocument | null {
    const subgraph = request.subgraph ?? explorationSubgraph(request.context, request.state);
    if (!subgraph) return null;
    return buildEntitySummary(subgraph, {
      scope: 'view',
      lot: request.lot ?? null,
      attributes: request.attributes,
    });
  }

  /**
   * Documento de la estructura disponible para la raíz: expande todas las
   * ramas que no nacen de un recurso compartido. `null` si no hay exploración.
   */
  buildFullStructureDocument(request: EntitySummaryRequest): EntitySummaryDocument | null {
    if (!isExplorationActive(request.state) || !request.state.rootUri) return null;
    const structure = buildAvailableStructure({
      visibleResult: request.context.visibleResult,
      fullResult: request.context.fullResult ?? null,
      rootUri: request.state.rootUri,
      activeUri: request.state.activeUri,
      pinnedUris: request.state.pinnedUris,
      budget: request.structureBudget,
    });
    return buildEntitySummary(structure.subgraph, {
      scope: 'structure',
      lot: request.lot ?? null,
      attributes: request.attributes,
      structureComplete: structure.complete,
    });
  }

  /** `Copiar vista actual`. */
  copyCurrentView(request: EntitySummaryRequest): Promise<SummaryCopyResult> {
    return this.copyDocument('view', this.buildCurrentViewDocument(request));
  }

  /** `Copiar estructura completa`. */
  copyFullStructure(request: EntitySummaryRequest): Promise<SummaryCopyResult> {
    return this.copyDocument('structure', this.buildFullStructureDocument(request));
  }

  /** Copia un texto arbitrario con la misma semántica de resultado. */
  async copyText(
    text: string,
    scope: SummaryScope,
    metrics: EntitySummaryMetrics | null = null,
  ): Promise<SummaryCopyResult> {
    const base = { scope, text, metrics };
    if (text.length === 0) {
      return {
        ...base,
        status: 'empty',
        copied: false,
        message: `No hay nada que copiar en la ${summaryScopeLabel(scope)}.`,
      };
    }

    const asyncError = await this.writeWithClipboardApi(text);
    if (asyncError === null) {
      return { ...base, status: 'copied', copied: true, message: this.successMessage(scope, metrics) };
    }

    if (this.writeWithExecCommand(text)) {
      return {
        ...base,
        status: 'copied-fallback',
        copied: true,
        message: `${this.successMessage(scope, metrics)} (copiado con el método alternativo del navegador)`,
      };
    }

    if (asyncError === 'unavailable') {
      return {
        ...base,
        status: 'unsupported',
        copied: false,
        message:
          `El navegador no permite copiar automáticamente: el texto de la ${summaryScopeLabel(scope)} ` +
          'quedó disponible para copiarlo a mano.',
      };
    }

    return {
      ...base,
      status: 'failed',
      copied: false,
      message: `No se pudo copiar la ${summaryScopeLabel(scope)}: ${asyncError}`,
      error: asyncError,
    };
  }

  private async copyDocument(
    scope: SummaryScope,
    document: EntitySummaryDocument | null,
  ): Promise<SummaryCopyResult> {
    if (!document) {
      return {
        status: 'no-entity',
        scope,
        copied: false,
        text: '',
        metrics: null,
        message: 'No hay una entidad en exploración: seleccioná una y abrí su estructura.',
      };
    }
    if (document.empty) {
      return {
        status: 'empty',
        scope,
        copied: false,
        text: document.text,
        metrics: document.metrics,
        message: 'La entidad no tiene estructura disponible en el resultado: no se copió nada.',
      };
    }
    return this.copyText(document.text, scope, document.metrics);
  }

  private successMessage(scope: SummaryScope, metrics: EntitySummaryMetrics | null): string {
    const label = summaryScopeLabel(scope);
    if (!metrics) return `Se copió la ${label} al portapapeles.`;
    return (
      `Se copió la ${label} al portapapeles: ${metrics.nodes} nodo(s), ` +
      `${metrics.drawnEdges} arista(s) y ${metrics.triples} tripleta(s).`
    );
  }

  /**
   * Devuelve `null` si escribió, `'unavailable'` si la API no existe, o el
   * mensaje de error si existía y rechazó.
   */
  private async writeWithClipboardApi(text: string): Promise<null | 'unavailable' | string> {
    const clipboard =
      typeof navigator !== 'undefined' ? (navigator.clipboard as Clipboard | undefined) : undefined;
    if (!clipboard || typeof clipboard.writeText !== 'function') return 'unavailable';
    try {
      await clipboard.writeText(text);
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  }

  /** Fallback histórico: textarea fuera de pantalla + `execCommand('copy')`. */
  private writeWithExecCommand(text: string): boolean {
    if (typeof document === 'undefined') return false;
    const exec = (document as Document & { execCommand?: (command: string) => boolean }).execCommand;
    if (typeof exec !== 'function') return false;

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.setAttribute('aria-hidden', 'true');
    textarea.style.position = 'fixed';
    textarea.style.top = '-1000px';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    try {
      textarea.select();
      return exec.call(document, 'copy') === true;
    } catch {
      return false;
    } finally {
      textarea.remove();
    }
  }
}
