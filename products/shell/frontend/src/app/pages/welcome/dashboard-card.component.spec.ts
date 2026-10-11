import { TestBed } from '@angular/core/testing';
import { Dialog } from '@angular/cdk/dialog';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { setLanguage } from '@rdfgis/platform-bridge';

import { DashboardCardComponent } from './dashboard-card.component';
import { DashboardStoreService } from '../../core/dashboard-store.service';
import { SnackbarService } from '../../core/snackbar.service';
import { MessageDialogComponent, type MessageDialogData } from '../../shell/message-dialog.component';
import { RenameDashboardDialogComponent } from '../../shell/rename-dashboard-dialog.component';
import type { Dashboard } from '../../core/dashboard.model';

describe('DashboardCardComponent', () => {
  const dashboard: Dashboard = {
    id: 'd1', kind: 'gis', name: 'Casas en Berisso', payload: {}, createdAt: '', updatedAt: '2026-01-01T00:00:00Z',
  };
  let opened: { component: unknown; data: unknown } | null;
  let dialogResult: unknown;
  let store: { rename: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn>; duplicate: ReturnType<typeof vi.fn> };
  let promptSpy: ReturnType<typeof vi.spyOn>;
  let confirmSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    localStorage.clear();
    opened = null;
    dialogResult = undefined;
    store = {
      rename: vi.fn().mockReturnValue(of(dashboard)),
      delete: vi.fn().mockReturnValue(of(undefined)),
      duplicate: vi.fn().mockReturnValue(of(dashboard)),
    };
    promptSpy = vi.spyOn(window, 'prompt');
    confirmSpy = vi.spyOn(window, 'confirm');
    TestBed.configureTestingModule({
      imports: [DashboardCardComponent],
      providers: [
        provideRouter([]),
        { provide: DashboardStoreService, useValue: store },
        { provide: SnackbarService, useValue: { show: vi.fn() } },
        {
          provide: Dialog,
          useValue: {
            open: (component: unknown, config: { data: unknown }) => {
              opened = { component, data: config.data };
              return { closed: of(dialogResult) };
            },
          },
        },
      ],
    });
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  function create(): DashboardCardComponent {
    const fixture = TestBed.createComponent(DashboardCardComponent);
    fixture.componentRef.setInput('dashboard', dashboard);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  it('renames through the app dialog instead of window.prompt', async () => {
    dialogResult = 'Casas en Ensenada';
    await create().rename();

    expect(promptSpy).not.toHaveBeenCalled();
    expect(opened?.component).toBe(RenameDashboardDialogComponent);
    expect(opened?.data).toEqual({ currentName: 'Casas en Berisso' });
    expect(store.rename).toHaveBeenCalledWith('d1', 'Casas en Ensenada');
  });

  it('does not rename when the dialog is cancelled', async () => {
    dialogResult = undefined;
    await create().rename();
    expect(store.rename).not.toHaveBeenCalled();
  });

  it('confirms deletion with a translated danger dialog instead of window.confirm', async () => {
    setLanguage('en');
    dialogResult = 'delete';
    await create().deleteDashboard();

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(opened?.component).toBe(MessageDialogComponent);
    const data = opened?.data as MessageDialogData;
    expect(data.title).toBe('Delete "Casas en Berisso"?');
    expect(data.actions?.find((action) => action.value === 'delete')).toMatchObject({ label: 'Delete', danger: true });
    expect(store.delete).toHaveBeenCalledWith('d1');
  });

  it('keeps the dashboard when deletion is cancelled', async () => {
    dialogResult = 'cancel';
    await create().deleteDashboard();
    expect(store.delete).not.toHaveBeenCalled();
  });
});
