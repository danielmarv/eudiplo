import type { Routes } from '@angular/router';

const form = () => import('./pages/webhook-endpoint-form').then((m) => m.WebhookEndpointForm);

/**
 * The webhook endpoint pages, under `/webhook-endpoints` and behind `issuance:manage` or `presentation:manage`
 * (app.routes.ts): the list, adding one, one provider, and editing it.
 */
export const WEBHOOK_ENDPOINT_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/webhook-endpoint-list').then((m) => m.WebhookEndpointList),
  },
  { path: 'create', title: 'New webhook endpoint', loadComponent: form },
  {
    path: ':id',
    title: 'Webhook endpoint',
    loadComponent: () =>
      import('./pages/webhook-endpoint-detail').then((m) => m.WebhookEndpointDetail),
  },
  { path: ':id/edit', title: 'Edit webhook endpoint', loadComponent: form },
];
