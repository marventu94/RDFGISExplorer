import { Component, Input } from '@angular/core';

/**
 * Indicador de cobertura compartido por mapa, grafo y timeline: avisa cuántos
 * nodos del resultado está mostrando la vista y cuántos quedan fuera (sin
 * coordenada, sin fecha o por encima del máximo del grafo).
 *
 * El componente solo aporta el estilo del chip; el posicionamiento (overlay
 * flotante o dentro del toolbar) lo define la vista que lo hospeda.
 */
@Component({
  selector: 'app-coverage-chip',
  standalone: true,
  template: `<span class="coverage-chip">{{ text }}</span>`,
  styles: [
    `
      :host {
        display: inline-block;
      }
      .coverage-chip {
        display: inline-block;
         padding: 5px 11px;
        background: rgba(236, 239, 241, 0.95);
        border: 1px solid #b0bec5;
        border-radius: 16px;
         font-size: 12px;
        color: #546e7a;
        white-space: nowrap;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
      }
    `,
  ],
})
export class CoverageChipComponent {
  @Input() text = '';
}
