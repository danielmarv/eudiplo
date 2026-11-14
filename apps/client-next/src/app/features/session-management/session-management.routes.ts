import type { Routes } from '@angular/router';
import { requireRole } from '../../core/auth/guards';

/** The session list and tenant's retention settings, each behind its own legacy role rules. */
export const SESSION_MANAGEMENT_ROUTES: Routes = [
  {
    path: '',
    pathMatch: 'full',
    title: 'Sessions',
    canActivate: [requireRole('issuance:offer', 'presentation:request', 'sessions:read')],
    loadComponent: () => import('./pages/session-list').then((m) => m.SessionList),
  },
  {
    path: 'config',
    title: 'Session settings',
    canActivate: [requireRole('issuance:manage', 'presentation:manage')],
    loadComponent: () => import('./pages/session-settings').then((m) => m.SessionSettings),
  },
];
