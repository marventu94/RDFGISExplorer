import { Component, output } from '@angular/core';

@Component({
  selector: 'app-curation-panel',
  standalone: true,
  template: `
    <div class="placeholder-m06">
      <header>
        <h3>M06 Curation Panel</h3>
        <button (click)="close.emit()">x</button>
      </header>
    </div>
  `,
})
export class CurationPanelComponent {
  readonly close = output<void>();
}
