import type { Routes } from '@angular/router';
import { provideSchemaForms } from '../../shared/forms/schema-form/schema-form';

/**
 * The issuance pages that are rebuilt, under `/offer/issuance` and behind `issuance:offer`
 * (app.routes.ts). Loaded lazily, so formly, which builds the claims forms, comes with them.
 */
export const ISSUANCE_OFFER_ROUTES: Routes = [
  {
    path: '',
    providers: [provideSchemaForms()],
    loadComponent: () => import('./pages/issuance-offer').then((m) => m.IssuanceOffer),
  },
  // Links of the current Web Client may carry an ID; the page does not use it.
  { path: ':id', redirectTo: '' },
];
