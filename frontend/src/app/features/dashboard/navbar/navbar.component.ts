import { Component, input, output } from '@angular/core';
import { FilterBadgesComponent } from '../filter-badges/filter-badges.component';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [FilterBadgesComponent],
  templateUrl: './navbar.component.html',
})
export class NavbarComponent {
  readonly editorCollapsed = input(false);
  readonly toggleEditor = output<void>();
}
