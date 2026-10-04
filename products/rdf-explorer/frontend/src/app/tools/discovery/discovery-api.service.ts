import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { explorerApiBase } from '@rdfgis/platform-bridge';
import type { DiscoveryCatalog, DiscoveryConnections, DiscoveryFocus, DiscoveryKind, DiscoveryPaths } from '@rdfgis/contracts';

@Injectable({ providedIn: 'root' })
export class DiscoveryApiService {
  private readonly http = inject(HttpClient);
  catalog(kind: DiscoveryKind, q = '', offset = 0) {
    return this.http.get<DiscoveryCatalog>(`${explorerApiBase('rdf')}/discovery/catalog`, { params: { kind, q, offset } });
  }
  connections(focus: DiscoveryFocus) {
    return this.http.post<DiscoveryConnections>(`${explorerApiBase('rdf')}/discovery/connections`, focus);
  }
  paths(focus: DiscoveryFocus, targetUri: string, targetKind: 'class' | 'property') {
    return this.http.post<DiscoveryPaths>(`${explorerApiBase('rdf')}/discovery/paths`, { focus, targetUri, targetKind });
  }
}
