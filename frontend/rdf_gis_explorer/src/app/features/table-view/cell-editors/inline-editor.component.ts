import { Component, ElementRef, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { ICellEditorAngularComp } from 'ag-grid-angular';
import type { ICellEditorParams } from 'ag-grid-community';

@Component({
  selector: 'app-inline-editor',
  standalone: true,
  imports: [FormsModule],
  template: `
    <input
      #input
      class="inline-editor-input"
      [(ngModel)]="editValue"
      (keydown.enter)="onEnter()"
      (keydown.escape)="onEscape()"
      (blur)="onBlur()"
    />
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
        height: 100%;
      }
      .inline-editor-input {
        width: 100%;
        height: 100%;
        border: 2px solid #1565c0;
        border-radius: 2px;
        padding: 4px 8px;
        font-size: inherit;
        font-family: inherit;
        outline: none;
        box-sizing: border-box;
      }
    `,
  ],
})
export class InlineEditorComponent implements ICellEditorAngularComp {
  @ViewChild('input', { static: true }) inputRef!: ElementRef<HTMLInputElement>;

  editValue = '';
  private params!: ICellEditorParams;

  agInit(params: ICellEditorParams): void {
    this.params = params;
    this.editValue = params.value ?? '';
  }

  getValue(): string {
    return this.editValue;
  }

  isCancelAfterEnd(): boolean {
    return false;
  }

  onEnter(): void {
    this.params.api.stopEditing();
  }

  onEscape(): void {
    this.params.api.stopEditing(true);
  }

  onBlur(): void {
    this.params.api.stopEditing();
  }

  ngAfterViewInit(): void {
    setTimeout(() => {
      this.inputRef.nativeElement?.focus();
      this.inputRef.nativeElement?.select();
    }, 0);
  }
}
