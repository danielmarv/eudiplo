import type { Routes } from '@angular/router';

const page = () => import('./pages/verification-request').then((m) => m.VerificationRequest);

/**
 * The verification request page, under `/offer/presentation` and behind `presentation:request`
 * (app.routes.ts). `/offer/presentation/<id>` requests that configuration at once.
 */
export const VERIFICATION_ROUTES: Routes = [
  { path: '', loadComponent: page },
  { path: ':id', loadComponent: page },
];
