import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createExplorationState,
  enterEntityMode,
  type ExplorationContext,
  type ExplorationState,
} from './entity-exploration';
import { buildEntitySubgraph } from './entity-subgraph';
import { EntitySummaryClipboardService } from './entity-summary-clipboard.service';
import {
  EX,
  realEstateFixture,
  sharedTargetFixture,
} from './testing/entity-subgraph-fixtures';

/**
 * Stage 6: this service is the only platform-dependent piece. It is manually
 * instantiated and tests async API, fallback, unsupported environment, and error paths.
 */

const SHARED_ROOT = `${EX}shared/root`;

function contextOf(visibleResult: ExplorationContext['visibleResult']): ExplorationContext {
  return { visibleResult, fullResult: null };
}

function entityState(rootUri: string): ExplorationState {
  return enterEntityMode(createExplorationState(), { rootUri, trigger: 'table-selection' });
}

function stubClipboard(writeText: ((text: string) => Promise<void>) | null): void {
  Object.defineProperty(navigator, 'clipboard', {
    value: writeText ? { writeText } : undefined,
    configurable: true,
  });
}

function stubExecCommand(impl: (() => boolean) | null): void {
  // `lib.dom` declara `execCommand` como obligatorio, pero jsdom no lo
  // The cast allows deleting it to test an unsupported environment.
  const target = document as unknown as { execCommand?: (command: string) => boolean };
  if (impl) target.execCommand = impl;
  else delete target.execCommand;
}

describe('EntitySummaryClipboardService', () => {
  const service = new EntitySummaryClipboardService();

  afterEach(() => {
    stubClipboard(null);
    stubExecCommand(null);
    vi.restoreAllMocks();
  });

  describe('alcances', () => {
    it('copies the current view with its heading and metrics', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      stubClipboard(writeText);

      const result = await service.copyCurrentView({
        context: contextOf(sharedTargetFixture()),
        state: entityState(SHARED_ROOT),
        lot: { currentLot: 2, lotCount: 4, totalRows: 1200, visibleRows: 300 },
      });

      expect(result.status).toBe('copied');
      expect(result.copied).toBe(true);
      expect(result.scope).toBe('view');
      expect(writeText).toHaveBeenCalledTimes(1);
      const copied = writeText.mock.calls[0][0] as string;
      expect(copied).toBe(result.text);
      expect(copied).toContain('Alcance: vista explorada');
      expect(copied).toContain('Lote: 2 de 4 (300 filas en el lote de 1200 filas filtradas)');
      expect(result.metrics?.nodes).toBeGreaterThan(0);
      expect(result.message).toContain('Se copió la vista explorada al portapapeles');
      expect(result.message).toContain(`${result.metrics?.triples} tripleta(s)`);
    });

    it('includes content left unexpanded by the view in complete structure', async () => {
      stubClipboard(vi.fn().mockResolvedValue(undefined));
      const request = {
        context: contextOf(sharedTargetFixture()),
        state: entityState(SHARED_ROOT),
      };

      const view = await service.copyCurrentView(request);
      const structure = await service.copyFullStructure(request);

      expect(view.text).not.toContain(`${EX}shared/target`);
      expect(structure.text).toContain(`${EX}shared/target`);
      expect(structure.scope).toBe('structure');
      expect(structure.text).toContain('Alcance: estructura disponible');
      expect(structure.metrics!.nodes).toBeGreaterThan(view.metrics!.nodes);
    });

    it('does not traverse shared resources in complete structure', async () => {
      stubClipboard(vi.fn().mockResolvedValue(undefined));
      const fixture = realEstateFixture();

      const structure = await service.copyFullStructure({
        context: contextOf(fixture.result),
        state: entityState(fixture.root),
      });

      expect(structure.text).toContain(fixture.estate);
      expect(structure.text).not.toContain(fixture.otherEstate);
      expect(structure.status).toBe('copied');
    });

    it('reuses the subgraph already computed by the view', async () => {
      stubClipboard(vi.fn().mockResolvedValue(undefined));
      const fixture = realEstateFixture();
      const subgraph = buildEntitySubgraph({
        visibleResult: fixture.result,
        rootUri: fixture.root,
        activeUri: fixture.estate,
      });

      const result = await service.copyCurrentView({
        context: contextOf(fixture.result),
        state: entityState(fixture.root),
        subgraph,
      });

      expect(result.text).toContain(`Nodo activo: Inmueble 0 — ${fixture.estate}`);
    });

    it('returns no-entity without touching the clipboard when exploration is inactive', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      stubClipboard(writeText);
      const request = {
        context: contextOf(sharedTargetFixture()),
        state: createExplorationState(),
      };

      const view = await service.copyCurrentView(request);
      const structure = await service.copyFullStructure(request);

      expect(view.status).toBe('no-entity');
      expect(structure.status).toBe('no-entity');
      expect(view.copied).toBe(false);
      expect(view.text).toBe('');
      expect(view.message).toContain('No hay una entidad en exploración');
      expect(writeText).not.toHaveBeenCalled();
      expect(service.buildCurrentViewDocument(request)).toBeNull();
      expect(service.buildFullStructureDocument(request)).toBeNull();
    });

    it('returns empty without copying when the root is absent from the result', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      stubClipboard(writeText);

      const result = await service.copyCurrentView({
        context: contextOf(sharedTargetFixture()),
        state: entityState(`${EX}ausente`),
      });

      expect(result.status).toBe('empty');
      expect(result.copied).toBe(false);
      expect(result.text).toContain('Sin estructura disponible');
      expect(result.message).toContain('no se copió nada');
      expect(writeText).not.toHaveBeenCalled();
    });
  });

  describe('portapapeles', () => {
    it('uses the fallback when navigator.clipboard is unavailable', async () => {
      stubClipboard(null);
      const captured: string[] = [];
      stubExecCommand(() => {
        const textarea = document.querySelector<HTMLTextAreaElement>('textarea[aria-hidden="true"]');
        if (textarea) captured.push(textarea.value);
        return true;
      });

      const result = await service.copyCurrentView({
        context: contextOf(sharedTargetFixture()),
        state: entityState(SHARED_ROOT),
      });

      expect(result.status).toBe('copied-fallback');
      expect(result.copied).toBe(true);
      expect(captured).toEqual([result.text]);
      expect(result.message).toContain('método alternativo');
      expect(document.querySelector('textarea[aria-hidden="true"]')).toBeNull();
    });

    it('uses the fallback when navigator.clipboard rejects', async () => {
      stubClipboard(vi.fn().mockRejectedValue(new Error('NotAllowedError')));
      stubExecCommand(() => true);

      const result = await service.copyCurrentView({
        context: contextOf(sharedTargetFixture()),
        state: entityState(SHARED_ROOT),
      });

      expect(result.status).toBe('copied-fallback');
      expect(result.copied).toBe(true);
    });

    it('returns unsupported and retains text when no mechanism exists', async () => {
      stubClipboard(null);
      stubExecCommand(null);

      const result = await service.copyCurrentView({
        context: contextOf(sharedTargetFixture()),
        state: entityState(SHARED_ROOT),
      });

      expect(result.status).toBe('unsupported');
      expect(result.copied).toBe(false);
      expect(result.text).toContain('Entidad raíz:');
      expect(result.message).toContain('copiarlo a mano');
    });

    it('reports an error when an available mechanism fails', async () => {
      stubClipboard(vi.fn().mockRejectedValue(new Error('NotAllowedError')));
      stubExecCommand(() => false);

      const result = await service.copyCurrentView({
        context: contextOf(sharedTargetFixture()),
        state: entityState(SHARED_ROOT),
      });

      expect(result.status).toBe('failed');
      expect(result.copied).toBe(false);
      expect(result.error).toBe('NotAllowedError');
      expect(result.message).toContain('No se pudo copiar la vista explorada');
      expect(result.text).toContain('Entidad raíz:');
    });

    it('makes copyText reject empty text', async () => {
      stubClipboard(vi.fn().mockResolvedValue(undefined));

      const result = await service.copyText('', 'structure');

      expect(result.status).toBe('empty');
      expect(result.copied).toBe(false);
      expect(result.message).toContain('estructura disponible');
    });

    it('copies arbitrary text through the same copyText contract', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      stubClipboard(writeText);

      const result = await service.copyText('hola', 'view');

      expect(writeText).toHaveBeenCalledWith('hola');
      expect(result.status).toBe('copied');
      expect(result.metrics).toBeNull();
      expect(result.message).toBe('Se copió la vista explorada al portapapeles.');
    });
  });

  describe('determinismo', () => {
    it('produces the same text for two consecutive copies', async () => {
      stubClipboard(vi.fn().mockResolvedValue(undefined));
      const request = {
        context: contextOf(realEstateFixture().result),
        state: entityState(`${EX}listing/0`),
      };

      const first = await service.copyFullStructure(request);
      const second = await service.copyFullStructure(request);

      expect(second.text).toBe(first.text);
      expect(second.metrics).toEqual(first.metrics);
    });
  });
});
