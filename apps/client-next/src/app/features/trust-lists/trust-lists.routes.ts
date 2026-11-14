import type { Routes } from '@angular/router';
import { requireRole } from '../../core/auth/guards';

/** Trust lists are managed by issuers and referenced by verifiers. */
export const TRUST_LIST_ROUTES: Routes = [
  {
    path: '',
    canActivate: [requireRole('issuance:manage', 'presentation:manage')],
    children: [
      {
        path: '',
        title: 'Trust lists',
        loadComponent: () => import('./pages/trust-list-list').then((m) => m.TrustListList),
      },
      {
        path: 'create',
        title: 'Create trust list',
        loadComponent: () => import('./pages/trust-list-form').then((m) => m.TrustListForm),
      },
      {
        path: ':id/edit',
        title: 'Edit trust list',
        loadComponent: () => import('./pages/trust-list-form').then((m) => m.TrustListForm),
      },
      {
        path: ':id',
        title: 'Trust list',
        loadComponent: () => import('./pages/trust-list-detail').then((m) => m.TrustListDetail),
      },
    ],
  },
];
