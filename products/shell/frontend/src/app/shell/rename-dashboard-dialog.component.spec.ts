import { TestBed } from '@angular/core/testing';
import { DialogRef, DIALOG_DATA } from '@angular/cdk/dialog';
import { RenameDashboardDialogComponent } from './rename-dashboard-dialog.component';

describe('RenameDashboardDialogComponent', () => {
  let close: ReturnType<typeof vi.fn>;

  function render(): HTMLElement {
    close = vi.fn();
    TestBed.configureTestingModule({
      imports: [RenameDashboardDialogComponent],
      providers: [
        { provide: DIALOG_DATA, useValue: { currentName: 'Casas' } },
        { provide: DialogRef, useValue: { close } },
      ],
    });
    const fixture = TestBed.createComponent(RenameDashboardDialogComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function type(el: HTMLElement, value: string): void {
    const input = el.querySelector('input') as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  it('prefills the current name and keeps Save disabled until it changes', () => {
    const el = render();
    expect((el.querySelector('input') as HTMLInputElement).value).toBe('Casas');
    expect((el.querySelector('.btn-primary') as HTMLButtonElement).disabled).toBe(true);
  });

  it('closes with the trimmed new name on submit', () => {
    const el = render();
    type(el, '  Departamentos  ');
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    expect(close).toHaveBeenCalledWith('Departamentos');
  });

  it('does not accept an empty name', () => {
    const el = render();
    type(el, '   ');
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    expect(close).not.toHaveBeenCalled();
  });
});
