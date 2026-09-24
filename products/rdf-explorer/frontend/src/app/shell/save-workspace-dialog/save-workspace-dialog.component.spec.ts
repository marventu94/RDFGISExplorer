import { TestBed } from '@angular/core/testing';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { describe, expect, it, vi } from 'vitest';

import { SaveWorkspaceDialogComponent } from './save-workspace-dialog.component';
import type { SaveWorkspaceDialogData } from './save-workspace-dialog.model';

async function createDialog(data: SaveWorkspaceDialogData): Promise<{
  component: SaveWorkspaceDialogComponent;
  close: ReturnType<typeof vi.fn>;
}> {
  const close = vi.fn();
  await TestBed.configureTestingModule({
    imports: [SaveWorkspaceDialogComponent],
    providers: [
      { provide: DIALOG_DATA, useValue: data },
      { provide: DialogRef, useValue: { close } },
    ],
  }).compileComponents();

  return {
    component: TestBed.createComponent(SaveWorkspaceDialogComponent).componentInstance,
    close,
  };
}

describe('SaveWorkspaceDialogComponent', () => {
  it('allows overwriting the workspace that owns the active panel', async () => {
    const { component, close } = await createDialog({
      currentId: 'c2',
      currentName: 'DRAFT · C2',
      existingNames: ['DRAFT · C1', 'DRAFT · C2', 'C5'],
    });

    expect(component.mode).toBe('overwrite');
    expect(component.hasNameConflict).toBe(false);
    expect(component.canSave).toBe(true);

    component.save();
    expect(close).toHaveBeenCalledWith({ name: 'DRAFT · C2', overwriteId: 'c2' });
  });

  it('proposes an available name ending in copy when saving a copy', async () => {
    const { component, close } = await createDialog({
      currentId: 'c2',
      currentName: 'DRAFT · C2',
      existingNames: ['DRAFT · C2', 'DRAFT · C2 copy'],
    });

    component.setMode('copy');

    expect(component.name).toBe('DRAFT · C2 2 copy');
    expect(component.hasNameConflict).toBe(false);
    component.save();
    expect(close).toHaveBeenCalledWith({ name: 'DRAFT · C2 2 copy', overwriteId: undefined });
  });

  it('still blocks overwriting with the name of another workspace', async () => {
    const { component, close } = await createDialog({
      currentId: 'c2',
      currentName: 'DRAFT · C2',
      existingNames: ['DRAFT · C1', 'DRAFT · C2'],
    });

    component.name = 'DRAFT · C1';

    expect(component.hasNameConflict).toBe(true);
    expect(component.canSave).toBe(false);
    component.save();
    expect(close).not.toHaveBeenCalled();
  });
});
