import type { Routes } from '@angular/router';
import { requireRole } from '../../core/auth/guards';

/** Key-chain administration, available to callers who can manage issuance, presentations or keys. */
export const KEYS_ROUTES: Routes = [
  {
    path: '',
    canActivate: [requireRole('issuance:manage', 'presentation:manage', 'keys:manage')],
    children: [
      {
        path: '',
        pathMatch: 'full',
        title: 'Keys',
        loadComponent: () => import('./pages/key-list').then((m) => m.KeyList),
      },
      {
        path: 'create',
        title: 'Create key',
        loadComponent: () => import('./pages/key-create').then((m) => m.KeyCreate),
      },
      {
        path: ':keyId/edit',
        title: 'Edit key',
        loadComponent: () => import('./pages/key-edit').then((m) => m.KeyEdit),
      },
      {
        path: ':keyId',
        title: 'Key details',
        loadComponent: () => import('./pages/key-detail').then((m) => m.KeyDetail),
      },
    ],
  },
];
