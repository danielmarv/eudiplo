import type { Routes } from '@angular/router';

/** The registrar configuration, under `/registrar` and behind `registrar:manage` (app.routes.ts). */
export const REGISTRAR_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/registrar-settings').then((m) => m.RegistrarSettings),
  },
];
