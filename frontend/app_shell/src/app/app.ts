import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AsyncPipe } from '@angular/common';
import { TopBarComponent } from './shell/top-bar.component';
import { SnackbarService } from './core/snackbar.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, AsyncPipe, TopBarComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly snackbar = inject(SnackbarService);
}
