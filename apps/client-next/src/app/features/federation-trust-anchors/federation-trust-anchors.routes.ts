import type { Routes } from '@angular/router';
import { requireRole } from '../../core/auth/guards';

const anchorRoles = [requireRole('issuance:manage', 'presentation:manage')];
const form = () =>
  import('./pages/federation-trust-anchor-form').then((m) => m.FederationTrustAnchorFormPage);

/** Management pages for the tenant's OpenID Federation trust anchors. */
export const FEDERATION_TRUST_ANCHOR_ROUTES: Routes = [
  {
    path: '',
    pathMatch: 'full',
    title: 'Federation trust anchors',
    canActivate: anchorRoles,
    loadComponent: () =>
      import('./pages/federation-trust-anchor-list').then((m) => m.FederationTrustAnchorList),
  },
  {
    path: 'create',
    title: 'Register federation trust anchor',
    canActivate: anchorRoles,
    loadComponent: form,
  },
  {
    path: ':id',
    title: 'Federation trust anchor',
    canActivate: anchorRoles,
    loadComponent: () =>
      import('./pages/federation-trust-anchor-detail').then((m) => m.FederationTrustAnchorDetail),
  },
  {
    path: ':id/edit',
    title: 'Edit federation trust anchor',
    canActivate: anchorRoles,
    loadComponent: form,
  },
];
