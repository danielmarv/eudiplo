import type { Routes } from '@angular/router';

/**
 * The issuer settings pages, under `/issuance-config` and behind `issuance:manage`
 * (app.routes.ts). The settings page is rebuilt; editing them, also step by step with
 * `?setup=true`, still stands in for the current Web Client.
 */
export const ISSUANCE_CONFIG_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/issuer-settings').then((m) => m.IssuerSettings),
  },
  {
    path: 'edit',
    title: 'Edit issuer settings',
    loadComponent: () => import('../../shared/pages/pending-page').then((m) => m.PendingPage),
  },
];
