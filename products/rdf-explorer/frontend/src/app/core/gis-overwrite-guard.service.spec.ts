import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Dialog } from '@angular/cdk/dialog';
import { of } from 'rxjs';

import { GisOverwriteGuardService } from './gis-overwrite-guard.service';
import { MessageDialogComponent } from '../shell/message-dialog/message-dialog.component';
import type { GisSessionState } from './gis-session-channel';

// Same key published by the GIS remote; the contract is deliberately duplicated.
const CHANNEL_KEY = '__rdfgisGisSession_v1';

function publishGisState(state: Partial<GisSessionState>): void {
  (window as unknown as Record<string, unknown>)[CHANNEL_KEY] = {
    dashboardId: null,
    dashboardName: null,
    hasWorkAtRisk: false,
    updatedAt: new Date().toISOString(),
    ...state,
  };
}

function clearGisState(): void {
  delete (window as unknown as Record<string, unknown>)[CHANNEL_KEY];
}

describe('GisOverwriteGuardService', () => {
  let service: GisOverwriteGuardService;
  let dialogMock: { open: ReturnType<typeof vi.fn> };
  let choice: string | undefined;

  beforeEach(() => {
    clearGisState();
    choice = undefined;
    dialogMock = { open: vi.fn(() => ({ closed: of(choice) })) };

    TestBed.configureTestingModule({
      providers: [
        GisOverwriteGuardService,
        { provide: Dialog, useValue: dialogMock },
      ],
    });
    service = TestBed.inject(GisOverwriteGuardService);
  });

  afterEach(() => {
    clearGisState();
    vi.clearAllMocks();
  });

  it('does not ask when GIS was never opened on this page', async () => {
    await expect(service.askBeforeHandoff()).resolves.toBe('proceed');
    expect(dialogMock.open).not.toHaveBeenCalled();
  });

  it('does not ask when GIS is empty', async () => {
    publishGisState({ hasWorkAtRisk: false });
    await expect(service.askBeforeHandoff()).resolves.toBe('proceed');
    expect(dialogMock.open).not.toHaveBeenCalled();
  });

  it('warns with the open dashboard name and returns confirmation', async () => {
    publishGisState({ hasWorkAtRisk: true, dashboardId: 'esc-e01', dashboardName: 'E01 · Berisso' });
    choice = 'export';

    await expect(service.askBeforeHandoff()).resolves.toBe('proceed-confirmed');
    expect(dialogMock.open).toHaveBeenCalledWith(
      MessageDialogComponent,
      expect.objectContaining({
        data: expect.objectContaining({
          title: expect.stringContaining('E01 · Berisso'),
        }),
      }),
    );
  });

  it('also warns for an unsaved view', async () => {
    publishGisState({ hasWorkAtRisk: true });
    choice = 'export';

    await expect(service.askBeforeHandoff()).resolves.toBe('proceed-confirmed');
    const data = dialogMock.open.mock.calls[0][1].data as { message: string };
    expect(data.message).toContain('sin guardar');
  });

  it('returns go-save when the user chooses to save', async () => {
    publishGisState({ hasWorkAtRisk: true, dashboardName: 'E01' });
    choice = 'go-save';
    await expect(service.askBeforeHandoff()).resolves.toBe('go-save');
  });

  it('cancels when the dialog closes without a choice', async () => {
    publishGisState({ hasWorkAtRisk: true, dashboardName: 'E01' });
    choice = undefined;
    await expect(service.askBeforeHandoff()).resolves.toBe('cancel');
  });
});
