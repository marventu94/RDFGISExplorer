import { Component, inject } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { SelectionService } from '@core/services/selection.service';

@Component({
  selector: 'app-filter-badges',
  standalone: true,
  imports: [AsyncPipe],
  templateUrl: './filter-badges.component.html',
})
export class FilterBadgesComponent {
  private readonly selectionService = inject(SelectionService);
  readonly filters$ = this.selectionService.activeFilters$;

  removeFilter(id: string): void {
    this.selectionService.removeFilter(id);
  }
}
