import { Component, inject } from '@angular/core';
import { ToolService } from '../../tool/tool.service';
import { DescribePanelComponent } from '../../tools/describe-panel/describe-panel.component';
import { EditPanelComponent } from '../../tools/edit-panel/edit-panel.component';
import { SparqlPanelComponent } from '../../tools/sparql-panel/sparql-panel.component';
import { LogPanelComponent } from '../../tools/log-panel/log-panel.component';
import { DiscoveryPanelComponent } from '../../tools/discovery/discovery-panel.component';
import { DiscoveryStateService } from '../../tools/discovery/discovery-state.service';
import { TranslatePipe } from '../../core/translate.pipe';

@Component({
  selector: 'app-tools-panel',
  templateUrl: './tools-panel.component.html',
  styleUrl: './tools-panel.component.scss',
  imports: [
    DescribePanelComponent,
    EditPanelComponent,
    SparqlPanelComponent,
    LogPanelComponent,
    DiscoveryPanelComponent,
    TranslatePipe,
  ],
})
export class ToolsPanelComponent {
  readonly toolService = inject(ToolService);
  readonly discovery = inject(DiscoveryStateService);
}
