import { Component, inject } from '@angular/core';
import { ToolService } from '../../tool/tool.service';
import { EditPanelComponent } from '../../tools/edit-panel/edit-panel.component';
import { SparqlPanelComponent } from '../../tools/sparql-panel/sparql-panel.component';
import { DiscoveryPanelComponent } from '../../tools/discovery/discovery-panel.component';
import { DiscoveryStateService } from '../../tools/discovery/discovery-state.service';
import { TranslatePipe } from '../../core/translate.pipe';

@Component({
  selector: 'app-tools-panel',
  templateUrl: './tools-panel.component.html',
  styleUrl: './tools-panel.component.scss',
  imports: [
    EditPanelComponent,
    SparqlPanelComponent,
    DiscoveryPanelComponent,
    TranslatePipe,
  ],
})
export class ToolsPanelComponent {
  readonly toolService = inject(ToolService);
  readonly discovery = inject(DiscoveryStateService);
  openExplorer(): void {
    if (this.toolService.active() === 'discovery') this.toolService.toggle('discovery');
    else this.discovery.openSelected();
  }
}
