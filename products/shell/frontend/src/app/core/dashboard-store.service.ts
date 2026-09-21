import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable, switchMap, tap, shareReplay, map } from 'rxjs';
import { DashboardApiClient } from './dashboard-api.client';
import type { Dashboard } from './dashboard.model';

@Injectable({ providedIn: 'root' })
export class DashboardStoreService {
  private readonly api = inject(DashboardApiClient);
  private readonly refreshTrigger = new BehaviorSubject<void>(undefined);

  readonly recent$: Observable<Dashboard[]> = this.refreshTrigger.pipe(
    switchMap(() => this.api.getRecent()),
    shareReplay(1),
  );

  refresh(): void {
    this.refreshTrigger.next();
  }

  delete(id: string): Observable<void> {
    return this.api.delete(id).pipe(tap(() => this.refresh()));
  }

  rename(id: string, name: string): Observable<Dashboard> {
    return this.api.rename(id, name).pipe(tap(() => this.refresh()));
  }

  duplicate(id: string): Observable<Dashboard> {
    return this.api.getById(id).pipe(
      map((original) => ({
        kind: original.kind,
        name: `${original.name} (copia)`,
        payload: original.payload,
      })),
      switchMap((dto) => this.api.create(dto)),
      tap(() => this.refresh()),
      shareReplay(1),
    );
  }
}
