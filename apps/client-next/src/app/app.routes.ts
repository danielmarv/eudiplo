import type { Route, Routes } from '@angular/router';
import { authGuard, requireRole } from './core/auth/guards';
import { type Role, TENANT_ADMIN_ROLES } from './core/auth/role-grants';
import { KEY_CHAIN_ROLES } from './layout/navigation';
import { Shell } from './layout/shell/shell';

/**
 * A page of the current Web Client that is not rebuilt yet: the placeholder for it and every
 * page below it, behind the same roles. Replace it with the feature's own routes when the
 * feature moves (see README.md).
 */
function pending(path: string, title: string, roles: Role[] = []): Route {
  return {
    path,
    title,
    canActivate: roles.length ? [requireRole(...roles)] : [],
    children: [
      {
        path: '**',
        loadComponent: () => import('./shared/pages/pending-page').then((m) => m.PendingPage),
      },
    ],
  };
}

const ISSUES_OR_VERIFIES: Role[] = ['issuance:manage', 'presentation:manage'];

export const routes: Routes = [
  {
    path: 'login',
    title: 'Sign in',
    loadComponent: () => import('./features/auth/login/login').then((m) => m.Login),
  },
  {
    path: '',
    component: Shell,
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        title: 'Dashboard',
        loadComponent: () => import('./features/dashboard/dashboard').then((m) => m.Dashboard),
      },

      // Issuance
      {
        path: 'offer/issuance',
        title: 'New issuance',
        canActivate: [requireRole('issuance:offer')],
        loadChildren: () =>
          import('./features/issuance/issuance.routes').then((m) => m.ISSUANCE_OFFER_ROUTES),
      },
      {
        path: 'credential-config',
        title: 'Credential types',
        canActivate: [requireRole('issuance:manage')],
        loadChildren: () =>
          import('./features/credential-configs/credential-configs.routes').then(
            (m) => m.CREDENTIAL_CONFIG_ROUTES
          ),
      },
      {
        path: 'issuance-config',
        title: 'Issuer settings',
        canActivate: [requireRole('issuance:manage')],
        loadChildren: () =>
          import('./features/issuance-config/issuance-config.routes').then(
            (m) => m.ISSUANCE_CONFIG_ROUTES
          ),
      },
      {
        path: 'status-lists',
        title: 'Status lists',
        canActivate: [requireRole('issuance:manage')],
        loadChildren: () =>
          import('./features/status-lists/status-lists.routes').then((m) => m.STATUS_LIST_ROUTES),
      },
      // The current Web Client has the settings at both addresses.
      { path: 'status-list-config', pathMatch: 'full', redirectTo: 'status-lists/config' },
      {
        path: 'attribute-providers',
        title: 'Attribute providers',
        canActivate: [requireRole('issuance:manage')],
        loadChildren: () =>
          import('./features/attribute-providers/attribute-providers.routes').then(
            (m) => m.ATTRIBUTE_PROVIDER_ROUTES
          ),
      },

      // Verification
      {
        path: 'offer/presentation',
        title: 'New verification',
        canActivate: [requireRole('presentation:request')],
        loadChildren: () =>
          import('./features/verification/verification.routes').then((m) => m.VERIFICATION_ROUTES),
      },
      pending('presentation-config', 'Verification configs', ['presentation:manage']),

      // Sessions: the list checks its roles itself, the settings need a manage role.
      pending('session-management/config', 'Session settings', ISSUES_OR_VERIFIES),
      pending('session-management', 'Sessions'),

      // Trust and keys
      pending('keys', 'Keys', KEY_CHAIN_ROLES),
      pending('kms', 'KMS providers', KEY_CHAIN_ROLES),
      pending('trust-list', 'Trust lists', ISSUES_OR_VERIFIES),
      pending('federation-trust-anchor', 'Federation trust anchors', ISSUES_OR_VERIFIES),

      // Integrations
      pending('webhook-endpoints', 'Webhook endpoints', ISSUES_OR_VERIFIES),
      pending('registrar', 'Registrar', ['registrar:manage']),
      pending('schema', 'Schemas', ['registrar:manage']),

      // Administration
      {
        path: 'tenants',
        canActivate: [requireRole('tenants:manage')],
        loadChildren: () =>
          import('./features/tenants/tenants.routes').then((m) => m.TENANT_ROUTES),
      },
      pending('clients', 'API clients', ['clients:manage']),
      pending('users', 'Users', ['users:manage']),
      pending('admin/activity-logs', 'Activity log', ['clients:manage', 'audit:read']),

      // Settings
      {
        path: 'settings/connection',
        title: 'Connection settings',
        loadComponent: () =>
          import('./features/settings/connection/connection-settings').then(
            (m) => m.ConnectionSettings
          ),
      },
      pending('settings/config-portability', 'Config portability', TENANT_ADMIN_ROLES),
    ],
  },
  { path: '**', redirectTo: '' },
];
