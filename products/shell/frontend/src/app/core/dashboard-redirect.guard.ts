import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { catchError, from, of, switchMap } from 'rxjs';
import { DashboardApiClient } from './dashboard-api.client';
import { SnackbarService } from './snackbar.service';
import { GisOpenGuardService } from './gis-open-guard.service';

export const dashboardRedirectGuard: CanActivateFn = (route) => {
  const api = inject(DashboardApiClient);
  const router = inject(Router);
  const snackbar = inject(SnackbarService);
  const gisGuard = inject(GisOpenGuardService);
  const id = route.paramMap.get('id')!;

  return api.getById(id).pipe(
    // El catch va pegado al fetch: un error del diálogo no debe disfrazarse de
    // "tablero no encontrado".
    catchError(() => {
      snackbar.show('Dashboard no encontrado');
      return of(null);
    }),
    switchMap((dashboard) => {
      if (dashboard === null) {
        return of(router.createUrlTree(['/']));
      }

      if (dashboard.kind !== 'gis') {
        return of(
          router.createUrlTree(['/explorer'], {
            queryParams: { workspaceId: id },
          }),
        );
      }

      // Abrir un tablero GIS pisa lo que haya abierto en GIS, igual que una
      // importación del Explorer: se avisa con el mismo criterio.
      return from(gisGuard.askBeforeOpen(id, dashboard.name)).pipe(
        switchMap((decision) => {
          if (decision === 'cancel') {
            // Falso: la navegación se cancela y el usuario se queda donde está.
            return of(false);
          }
          if (decision === 'go-save') {
            // A GIS tal cual está (sin dashboardId no se rehidrata nada), para
            // que pueda guardar antes de perder el trabajo.
            return of(router.createUrlTree(['/gis']));
          }
          return of(
            router.createUrlTree(['/gis'], {
              queryParams: { dashboardId: id },
            }),
          );
        }),
      );
    }),
  );
};
