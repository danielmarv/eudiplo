import type { Routes } from '@angular/router';

/**
 * The credential type pages, under `/credential-config` and behind `issuance:manage`
 * (app.routes.ts): the list, a credential type's details, and the form that adds or edits one.
 */
export const CREDENTIAL_CONFIG_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/credential-config-list').then((m) => m.CredentialConfigList),
  },
  {
    path: 'create',
    title: 'New credential type',
    loadComponent: () =>
      import('./pages/credential-config-form').then((m) => m.CredentialConfigForm),
  },
  {
    path: ':id',
    title: 'Credential type',
    loadComponent: () =>
      import('./pages/credential-config-detail').then((m) => m.CredentialConfigDetail),
  },
  {
    path: ':id/edit',
    title: 'Edit credential type',
    loadComponent: () =>
      import('./pages/credential-config-form').then((m) => m.CredentialConfigForm),
  },
];
