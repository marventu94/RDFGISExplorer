import { TestBed } from '@angular/core/testing';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { describe, expect, it, vi } from 'vitest';
import type { QueryExportCandidate } from '@rdfgis/platform-bridge';
import { QuerySelectionDialogComponent, type QuerySelectionDialogData } from './query-selection-dialog.component';

describe('QuerySelectionDialogComponent', () => {
  it('shows the dashboard name once and only variables in the selectable options', () => {
    const candidates: QueryExportCandidate[] = [
      { id: 'panel:0', panelName: 'D2 · Casas de La Plata', label: '?listing', query: 'SELECT ?listing WHERE {}', backend: 'test', source: {} },
      { id: 'panel:1', panelName: 'D2 · Casas de La Plata', label: '?realEstate', query: 'SELECT ?realEstate WHERE {}', backend: 'test', source: {} },
    ];
    const close = vi.fn();
    TestBed.configureTestingModule({
      imports: [QuerySelectionDialogComponent],
      providers: [
        { provide: DIALOG_DATA, useValue: { panelName: candidates[0].panelName, candidates } satisfies QuerySelectionDialogData },
        { provide: DialogRef, useValue: { close } },
      ],
    });
    const fixture = TestBed.createComponent(QuerySelectionDialogComponent);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('h3')?.textContent).toBe('D2 · Casas de La Plata');
    expect([...element.querySelectorAll('.option-label')].map(option => option.textContent)).toEqual(['?listing', '?realEstate']);
    expect(element.querySelectorAll('.option')).toHaveLength(2);

    (element.querySelectorAll<HTMLButtonElement>('.option')[1]).click();
    fixture.componentInstance.confirm();
    expect(close).toHaveBeenCalledWith(candidates[1]);
  });
});
