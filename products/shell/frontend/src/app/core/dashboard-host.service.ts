import { Injectable, OnDestroy, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { dashboardStateAdapter, registerDashboardHost } from '@rdfgis/platform-bridge';
import { DashboardApiClient } from './dashboard-api.client';

@Injectable({ providedIn: 'root' })
export class DashboardHostService implements OnDestroy {
  private readonly api = inject(DashboardApiClient);
  private readonly unregister = registerDashboardHost({
    list: async (kind) => {
      const dashboards = await firstValueFrom(this.api.list());
      return kind ? dashboards.filter((dashboard) => dashboard.kind === kind) : dashboards;
    },
    load: async (id, mode = 'replace') => {
      const dashboard = await firstValueFrom(this.api.get(id));
      await dashboardStateAdapter(dashboard.kind).importPayload(dashboard.payload, {
        id: dashboard.id, name: dashboard.name, mode,
      });
      return dashboard;
    },
    save: async ({ kind, name, mode, currentId }) => {
      const payload = await dashboardStateAdapter(kind).exportPayload();
      if (mode === 'overwrite' && currentId) {
        return firstValueFrom(this.api.update(currentId, { name, payload }));
      }
      return firstValueFrom(this.api.create({ kind, name, payload }));
    },
    delete: (id) => firstValueFrom(this.api.delete(id)),
    nameExists: async (kind, name, excludeId) => {
      const dashboards = await firstValueFrom(this.api.list());
      const normalized = name.trim().toLocaleLowerCase();
      return dashboards.some((dashboard) => dashboard.kind === kind &&
        dashboard.id !== (excludeId ?? '') &&
        dashboard.name.trim().toLocaleLowerCase() === normalized);
    },
  });

  ngOnDestroy(): void { this.unregister(); }
}
