import type { Routes } from '@angular/router';

/** Config portability, under `/settings/config-portability`, behind the tenant-admin roles. */
export const CONFIG_PORTABILITY_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/config-portability').then((m) => m.ConfigPortability),
  },
];
