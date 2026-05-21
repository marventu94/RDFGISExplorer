import { Component, inject, signal, ViewChild } from '@angular/core';
import { MatSidenavModule, MatSidenav } from '@angular/material/sidenav';
import { DashboardComponent } from '@features/dashboard/dashboard.component';
import { NavbarComponent } from '@features/dashboard/navbar/navbar.component';
import { CurationPanelComponent } from '@features/curation-panel/curation-panel.component';
import { SelectionService } from '@core/services/selection.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [MatSidenavModule, DashboardComponent, NavbarComponent, CurationPanelComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly selectionService = inject(SelectionService);
  protected readonly sidenavOpen = signal(false);
  protected readonly editorCollapsed = signal(false);

  @ViewChild('sidenav') sidenav!: MatSidenav;

  constructor() {
    this.selectionService.selectedNode$.subscribe((sel) => {
      if (sel.node) {
        this.sidenavOpen.set(true);
      }
    });
  }

  protected toggleEditor(): void {
    this.editorCollapsed.update((v) => !v);
  }

  protected onSidenavClosed(): void {
    this.sidenavOpen.set(false);
  }
}
