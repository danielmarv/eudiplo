import type { Routes } from '@angular/router';

const form = () => import('./pages/attribute-provider-form').then((m) => m.AttributeProviderForm);

/**
 * The attribute provider pages, under `/attribute-providers` and behind `issuance:manage`
 * (app.routes.ts): the list, adding one, one provider, and editing it.
 */
export const ATTRIBUTE_PROVIDER_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/attribute-provider-list').then((m) => m.AttributeProviderList),
  },
  { path: 'create', title: 'New attribute provider', loadComponent: form },
  {
    path: ':id',
    title: 'Attribute provider',
    loadComponent: () =>
      import('./pages/attribute-provider-detail').then((m) => m.AttributeProviderDetail),
  },
  { path: ':id/edit', title: 'Edit attribute provider', loadComponent: form },
];
