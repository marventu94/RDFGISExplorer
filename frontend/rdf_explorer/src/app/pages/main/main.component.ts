import { Component, inject } from '@angular/core';
import { SearchPanelComponent } from '../../shell/search-panel/search-panel.component';
import { CanvasPanelComponent } from '../../shell/canvas-panel/canvas-panel.component';
import { ToolsPanelComponent } from '../../shell/tools-panel/tools-panel.component';
import { PropertyGraphService } from '../../graph/property-graph.service';
import { TutorialService } from '../../tutorial/tutorial.service';
import { GettingStartedDialogService } from '../../modal/getting-started-dialog.service';

@Component({
  selector: 'app-main',
  imports: [SearchPanelComponent, CanvasPanelComponent, ToolsPanelComponent],
  templateUrl: './main.component.html',
  styleUrl: './main.component.scss',
})
export class MainComponent {
  readonly graph = inject(PropertyGraphService);
  readonly tutorialService = inject(TutorialService);
  readonly dialogService = inject(GettingStartedDialogService);

  openGettingStarted(): void {
    this.dialogService.open();
  }

  startTutorial(): void {
    this.tutorialService.start();
  }
}
