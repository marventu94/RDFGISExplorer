import { TestBed } from '@angular/core/testing';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { describe, expect, it, vi } from 'vitest';

import { MessageDialogComponent, type MessageDialogData } from './message-dialog.component';

describe('MessageDialogComponent', () => {
  it('keeps close-panel actions and uses the same dialog/button structure as save', async () => {
    const close = vi.fn();
    const data: MessageDialogData = {
      kind: 'info',
      title: '¿Cerrar el panel con cambios sin guardar?',
      message: 'Los cambios se perderán.',
      actions: [
        { label: 'Cancelar', value: 'cancel' },
        { label: 'Descartar y cerrar', value: 'discard', primary: true },
      ],
    };
    await TestBed.configureTestingModule({
      imports: [MessageDialogComponent],
      providers: [
        { provide: DIALOG_DATA, useValue: data },
        { provide: DialogRef, useValue: { close } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(MessageDialogComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const buttons = [...element.querySelectorAll<HTMLButtonElement>('.actions button')];

    expect(element.querySelector('.dialog-container')).toBeTruthy();
    expect(buttons.map(button => button.textContent?.trim())).toEqual([
      'Cancelar',
      'Descartar y cerrar',
    ]);
    expect(buttons[1].classList).toContain('btn-primary');
    buttons[1].click();
    expect(close).toHaveBeenCalledWith('discard');
  });
});
