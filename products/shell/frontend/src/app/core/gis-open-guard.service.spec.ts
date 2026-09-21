import { TestBed } from '@angular/core/testing';
import { Dialog } from '@angular/cdk/dialog';
import { of } from 'rxjs';

import { GisOpenGuardService } from './gis-open-guard.service';
import { GIS_SESSION_CHANNEL_KEY, type GisSessionState } from './gis-session-channel';
import type { MessageDialogData } from '../shell/message-dialog.component';

describe('GisOpenGuardService', () => {
  let service: GisOpenGuardService;
  let opened: MessageDialogData | null;
  let choice: string;

  function publishSession(state: Partial<GisSessionState>): void {
    (window as unknown as Record<string, unknown>)[GIS_SESSION_CHANNEL_KEY] = {
      dashboardId: null,
      dashboardName: null,
      hasWorkAtRisk: true,
      updatedAt: new Date().toISOString(),
      ...state,
    } satisfies GisSessionState;
  }

  beforeEach(() => {
    opened = null;
    choice = 'open';
    delete (window as unknown as Record<string, unknown>)[GIS_SESSION_CHANNEL_KEY];

    TestBed.configureTestingModule({
      providers: [
        {
          provide: Dialog,
          useValue: {
            open: (_component: unknown, config: { data: MessageDialogData }) => {
              opened = config.data;
              return { closed: of(choice) };
            },
          },
        },
      ],
    });
    service = TestBed.inject(GisOpenGuardService);
  });

  afterEach(() => {
    delete (window as unknown as Record<string, unknown>)[GIS_SESSION_CHANNEL_KEY];
  });

  it('does not ask when GIS was never opened in this page', async () => {
    expect(await service.askBeforeOpen('dash-2', 'Otro')).toBe('proceed');
    expect(opened).toBeNull();
  });

  it('does not ask when GIS has nothing at risk', async () => {
    publishSession({ hasWorkAtRisk: false });
    expect(await service.askBeforeOpen('dash-2', 'Otro')).toBe('proceed');
    expect(opened).toBeNull();
  });

  it('names the open dashboard and the one being opened', async () => {
    publishSession({ dashboardId: 'dash-1', dashboardName: 'Casas en Berisso' });

    await service.askBeforeOpen('dash-2', 'Departamentos');

    expect(opened!.title).toContain('Casas en Berisso');
    expect(opened!.message).toContain('Departamentos');
  });

  it('warns about losing unsaved changes when reopening the same dashboard', async () => {
    publishSession({ dashboardId: 'dash-1', dashboardName: 'Casas en Berisso' });

    await service.askBeforeOpen('dash-1', 'Casas en Berisso');

    expect(opened!.title).toContain('volver a cargar');
    expect(opened!.message).toContain('se pierden');
  });

  it('describes an unsaved view with no dashboard behind it', async () => {
    publishSession({ dashboardId: null, dashboardName: null });

    await service.askBeforeOpen('dash-2', 'Departamentos');

    expect(opened!.title).toContain('reemplazar la vista de GIS');
  });

  it.each([
    ['open', 'proceed-confirmed'],
    ['go-save', 'go-save'],
    ['cancel', 'cancel'],
  ])('maps the "%s" button to the "%s" decision', async (button, expected) => {
    publishSession({ dashboardId: 'dash-1', dashboardName: 'Casas' });
    choice = button;

    expect(await service.askBeforeOpen('dash-2', 'Otro')).toBe(expected);
  });

  it('treats closing the dialog without choosing as a cancel', async () => {
    publishSession({ dashboardId: 'dash-1', dashboardName: 'Casas' });
    choice = undefined as unknown as string;

    expect(await service.askBeforeOpen('dash-2', 'Otro')).toBe('cancel');
  });
});
