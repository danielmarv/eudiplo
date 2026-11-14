import type { Routes } from '@angular/router';
import { requireRole } from '../../core/auth/guards';

/** KMS providers, visible to callers who can administer key chains. */
export const KMS_ROUTES: Routes = [
  {
    path: '',
    title: 'KMS providers',
    canActivate: [requireRole('issuance:manage', 'presentation:manage', 'keys:manage')],
    loadComponent: () => import('./pages/kms-providers').then((m) => m.KmsProviders),
  },
];
