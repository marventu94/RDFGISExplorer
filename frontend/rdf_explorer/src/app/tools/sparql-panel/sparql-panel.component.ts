import { Component, inject, computed } from '@angular/core';
import { PropertyGraphService } from '../../graph/property-graph.service';
import { SparqlViewerComponent } from './sparql-viewer/sparql-viewer.component';
import type { Query, RDFResource } from '../../graph/domain';
import { Node } from '../../graph/domain';
import { Property } from '../../graph/domain';

@Component({
  selector: 'app-sparql-panel',
  templateUrl: './sparql-panel.component.html',
  standalone: true,
  imports: [SparqlViewerComponent],
})
export class SparqlPanelComponent {
  private readonly graph = inject(PropertyGraphService);

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
}
