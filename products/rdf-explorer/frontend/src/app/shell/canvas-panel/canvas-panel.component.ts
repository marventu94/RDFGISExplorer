import { Component } from '@angular/core';
import { CanvasGraphComponent } from '../../graph/canvas-graph/canvas-graph.component';

@Component({
  selector: 'app-canvas-panel',
  imports: [CanvasGraphComponent],
  templateUrl: './canvas-panel.component.html',
  styleUrl: './canvas-panel.component.scss'
})
export class CanvasPanelComponent {}
