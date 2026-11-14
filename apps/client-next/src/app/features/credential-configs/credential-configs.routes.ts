import type { Routes } from '@angular/router';

const pendingPage = () => import('../../shared/pages/pending-page').then((m) => m.PendingPage);

/**
 * The credential type pages, under `/credential-config` and behind `issuance:manage`
 * (app.routes.ts). The list is rebuilt; creating, showing and editing one still stand in for the
 * current Web Client.
 */
export const CREDENTIAL_CONFIG_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/credential-config-list').then((m) => m.CredentialConfigList),
  },
  { path: 'create', title: 'New credential type', loadComponent: pendingPage },
  { path: ':id', title: 'Credential type', loadComponent: pendingPage },
  { path: ':id/edit', title: 'Edit credential type', loadComponent: pendingPage },
];
