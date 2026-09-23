import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { signal } from '@angular/core';
import { afterEach, describe, expect, it } from 'vitest';
import { setLanguage } from '@rdfgis/platform-bridge';

import { I18nService } from '@core/services/i18n.service';
import { OverwriteDashboardDialogComponent } from './overwrite-dashboard-dialog.component';
import { ExportCapDialogComponent } from './export-cap-dialog.component';
import { ExportProgressDialogComponent } from './export-progress-dialog.component';
import { ErrorDialogComponent } from '@features/sparql-input/error-dialog.component';
import { ConfirmReplaceDialogComponent } from '@features/sparql-input/confirm-replace-dialog.component';

const dialogRef = { close: () => undefined };

async function render(component: Parameters<typeof TestBed.createComponent>[0], data: unknown): Promise<HTMLElement> {
  await TestBed.configureTestingModule({
    imports: [component, NoopAnimationsModule],
    providers: [
      { provide: MAT_DIALOG_DATA, useValue: data },
      { provide: MatDialogRef, useValue: dialogRef },
    ],
  }).compileComponents();
  TestBed.inject(I18nService).set('en');
  const fixture = TestBed.createComponent(component);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('GIS popup internationalization', () => {
  afterEach(() => {
    setLanguage('es');
    TestBed.resetTestingModule();
  });

  it('renders the overwrite warning in English and preserves the dashboard name', async () => {
    const el = await render(OverwriteDashboardDialogComponent, { dashboardName: 'Ciudades españolas' });
    const text = el.textContent ?? '';
    expect(text).toContain('Replace "Ciudades españolas"?');
    expect(text).toContain('The query imported from RDF Explorer replaces the query, layout, and filters');
    expect(text).toContain('Cancel');
    expect(text).toContain('Replace without saving');
    expect(text).toContain('Save and replace');
    expect(text).not.toContain('Reemplazar');
    expect(el.querySelector('.dialog-container')).toBeTruthy();
    expect(el.querySelectorAll('.actions button')).toHaveLength(3);
    expect(el.querySelector('.actions .btn-primary')?.textContent).toContain('Save and replace');
  });

  it('renders query replacement and error actions in English while preserving raw errors', async () => {
    let el = await render(ConfirmReplaceDialogComponent, null);
    expect(el.textContent).toContain('Replace current query?');
    expect(el.textContent).toContain('Loading another query will discard what you wrote.');
    expect(el.textContent).toContain('Cancel');

    TestBed.resetTestingModule();
    el = await render(ErrorDialogComponent, {
      title: 'Endpoint title',
      message: 'Endpoint message',
      detail: 'Error crudo: valor del usuario',
    });
    expect(el.textContent).toContain('Close');
    expect(el.textContent).toContain('Error crudo: valor del usuario');
  });

  it('renders export dialogs with English interpolations and buttons', async () => {
    let el = await render(ExportCapDialogComponent, { rows: 50_000, maxRows: 50_000 });
    expect(el.textContent).toContain('Export limit reached');
    expect(el.textContent).toContain('limit of 50000 exportable rows');
    expect(el.textContent).toContain('Copy query');
    expect(el.textContent).toContain('Export partial');

    TestBed.resetTestingModule();
    el = await render(ExportProgressDialogComponent, {
      progress: signal({ rowsFetched: 1250, page: 2, pageSize: 1000 }),
      totalRows: 5000,
    });
    expect(el.textContent).toContain('Exporting full result');
    expect(el.textContent).toContain('1250 of ~5000 rows');
    expect(el.textContent).toContain('Cancel');
  });
});
