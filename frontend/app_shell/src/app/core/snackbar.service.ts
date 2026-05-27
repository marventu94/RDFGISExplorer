import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class SnackbarService {
  private messageSubject = new BehaviorSubject<string | null>(null);
  private timer: ReturnType<typeof setTimeout> | null = null;

  readonly message$: Observable<string | null> = this.messageSubject.asObservable();

  show(message: string): void {
    if (this.timer) clearTimeout(this.timer);
    this.messageSubject.next(message);
    this.timer = setTimeout(() => this.messageSubject.next(null), 4000);
  }
}
