import { Component, inject, computed } from '@angular/core';
import { Router } from '@angular/router';
import { ActivatedRoute } from '@angular/router';
import { PropertyGraphService } from '../../graph/property-graph.service';
import { SparqlViewerComponent } from './sparql-viewer/sparql-viewer.component';
import { QueryHandoffService } from '../../core/query-handoff.service';
import { SettingsService } from '../../core/settings.service';
import { WorkspacePersistenceService } from '../../core/workspace-persistence.service';
import type { Query, RDFResource } from '../../graph/domain';
import { Node } from '../../graph/domain';
import { Property } from '../../graph/domain';

@Component({
  selector: 'app-sparql-panel',
  templateUrl: './sparql-panel.component.html',
  styleUrl: './sparql-panel.component.scss',
  standalone: true,
  imports: [SparqlViewerComponent],
})
export class SparqlPanelComponent {
  private readonly graph = inject(PropertyGraphService);
  private readonly queryHandoff = inject(QueryHandoffService);
  private readonly settings = inject(SettingsService);
  private readonly workspace = inject(WorkspacePersistenceService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  private readonly queriesResult = computed(() => {
    void this.graph.revision();
    return this.graph.getQueriesForGraph();
  });

  readonly queries = computed(() => this.queriesResult().queries);
  readonly emptyVars = computed(() => this.queriesResult().emptyVars);
  queryShow: boolean[] = [];

  toggleQuery(index: number): void {
    this.queryShow[index] = !(this.queryShow[index] ?? true);
    this.queryShow = [...this.queryShow];
  }

  isQueryShown(index: number): boolean {
    return this.queryShow[index] ?? true;
  }

  getSparql(query: Query): string {
    return query.toSparql() ?? '';
  }

  getColor(resource: RDFResource): string {
    if (resource instanceof Node) return resource.getColor();
    if (resource instanceof Property) return resource.getColor();
    return resource.isVariable() ? '#2ca02c' : '#1f77b4';
  }

  onClickResource(resource: RDFResource): void {
    this.graph.setSelected(resource);
  }

  handoffQuery(query: Query): void {
    const sparql = query.toSparql();
    if (!sparql?.trim()) return;

    const backend = this.settings.app().endpoint.label || 'generic';

    this.queryHandoff.publish({
      query: sparql,
      backend,
      source: {
        workspaceId: this.route.snapshot.queryParamMap.get('workspaceId') ?? undefined,
        panelId: this.workspace.activePanel()?.id,
      },
    });

    this.router.navigate(['/gis'], { queryParams: { handoff: '1' } });
  }
}
