import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { DashboardApiClient } from './dashboard-api.client';
import { SnackbarService } from './snackbar.service';

export const dashboardRedirectGuard: CanActivateFn = (route) => {
  const api = inject(DashboardApiClient);
  const router = inject(Router);
  const snackbar = inject(SnackbarService);
  const id = route.paramMap.get('id')!;

  return api.getById(id).pipe(
    map((dashboard) => {
      if (dashboard.kind === 'gis') {
        return router.createUrlTree(['/gis'], {
          queryParams: { dashboardId: id },
        });
      }
      return router.createUrlTree(['/explorer'], {
        queryParams: { workspaceId: id },
      });
    }),
    catchError(() => {
      snackbar.show('Dashboard no encontrado');
      return of(router.createUrlTree(['/']));
    }),
  );
};
