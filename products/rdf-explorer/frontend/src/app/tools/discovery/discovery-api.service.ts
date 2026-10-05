import { inject, Injectable } from '@angular/core';
import { catchError, concatMap, defer, from, map, of, throwError } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { explorerApiBase } from '@rdfgis/platform-bridge';
import type { DiscoveryCatalog, DiscoveryConnections, DiscoveryFocus, DiscoveryKind, DiscoveryPaths, DiscoveryDirection } from '@rdfgis/contracts';

@Injectable({ providedIn: 'root' })
export class DiscoveryApiService {
  private readonly http = inject(HttpClient);
  catalog(kind: DiscoveryKind, q = '', offset = 0) {
    return this.http.get<DiscoveryCatalog>(`${explorerApiBase('rdf')}/discovery/catalog`, { params: { kind, q, offset } });
  }
  connections(focus: DiscoveryFocus, directions: DiscoveryDirection[] = ['out', 'in'], previous?: DiscoveryConnections | null) {
    return defer(() => {
      let latest = previous ?? null;
      return from(directions).pipe(concatMap((direction, index) =>
        this.http.post<DiscoveryConnections>(`${explorerApiBase('rdf')}/discovery/connections`, { ...focus, direction }).pipe(
          catchError((error: unknown) => {
            if (!latest) return throwError(() => error);
            const failure = error as { error?: { retryAfterSeconds?: number } };
            return of({ ...latest, connections: [], failedDirections: [direction],
              retryAfterSeconds: failure?.error?.retryAfterSeconds } as DiscoveryConnections);
          }),
          map(data => {
            latest = {
              ...data,
              connections: [...(latest?.connections.filter(c => c.direction !== direction) ?? []), ...data.connections],
              truncated: !!latest?.truncated || data.truncated,
              failedDirections: [...(latest?.failedDirections.filter(d => d !== direction) ?? []), ...data.failedDirections],
              pendingDirections: directions.slice(index + 1),
            };
            return latest;
          }),
        ),
      ));
    });
  }
  paths(focus: DiscoveryFocus, targetUri: string, targetKind: 'class' | 'property') {
    return this.http.post<DiscoveryPaths>(`${explorerApiBase('rdf')}/discovery/paths`, { focus, targetUri, targetKind });
  }
}
