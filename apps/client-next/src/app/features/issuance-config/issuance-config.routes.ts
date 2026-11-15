import type { Routes } from '@angular/router';

/**
 * The issuer settings pages, under `/issuance-config` and behind `issuance:manage`
 * (app.routes.ts): the settings, and the form that edits them, step by step with `?setup=true`.
 */
export const ISSUANCE_CONFIG_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/issuer-settings').then((m) => m.IssuerSettings),
  },
  {
    path: 'edit',
    title: 'Edit issuer settings',
    loadComponent: () => import('./pages/issuer-settings-form').then((m) => m.IssuerSettingsForm),
  },
];
