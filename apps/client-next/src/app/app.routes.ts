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
      {
        path: 'presentation-config',
        title: 'Presentation configurations',
        canActivate: [requireRole('presentation:manage')],
        loadChildren: () =>
          import('./features/presentation-configs/presentation-configs.routes').then(
            (m) => m.PRESENTATION_CONFIG_ROUTES
          ),
      },

      {
        path: 'session-management',
        loadChildren: () =>
          import('./features/session-management/session-management.routes').then(
            (m) => m.SESSION_MANAGEMENT_ROUTES
          ),
      },

      // Trust and keys
      {
        path: 'keys',
        title: 'Keys',
        canActivate: [requireRole(...KEY_CHAIN_ROLES)],
        loadChildren: () => import('./features/keys/keys.routes').then((m) => m.KEYS_ROUTES),
      },
      {
        path: 'kms',
        title: 'KMS providers',
        canActivate: [requireRole(...KEY_CHAIN_ROLES)],
        loadChildren: () => import('./features/kms/kms.routes').then((m) => m.KMS_ROUTES),
      },
      {
        path: 'trust-list',
        title: 'Trust lists',
        canActivate: [requireRole(...ISSUES_OR_VERIFIES)],
        loadChildren: () =>
          import('./features/trust-lists/trust-lists.routes').then((m) => m.TRUST_LIST_ROUTES),
      },
      {
        path: 'federation-trust-anchor',
        title: 'Federation trust anchors',
        canActivate: [requireRole(...ISSUES_OR_VERIFIES)],
        loadChildren: () =>
          import('./features/federation-trust-anchors/federation-trust-anchors.routes').then(
            (m) => m.FEDERATION_TRUST_ANCHOR_ROUTES
          ),
      },

      // Integrations
      {
        path: 'webhook-endpoints',
        title: 'Webhook endpoints',
        canActivate: [requireRole(...ISSUES_OR_VERIFIES)],
        loadChildren: () =>
          import('./features/webhook-endpoints/webhook-endpoints.routes').then(
            (m) => m.WEBHOOK_ENDPOINT_ROUTES
          ),
      },
      {
        path: 'registrar',
        title: 'Registrar',
        canActivate: [requireRole('registrar:manage')],
        loadChildren: () =>
          import('./features/registrar/registrar.routes').then((m) => m.REGISTRAR_ROUTES),
      },
      {
        path: 'schema',
        title: 'Schemas',
        canActivate: [requireRole('registrar:manage')],
        loadChildren: () =>
          import('./features/schemas/schemas.routes').then((m) => m.SCHEMA_ROUTES),
      },

      // Administration
      {
        path: 'tenants',
        canActivate: [requireRole('tenants:manage')],
        loadChildren: () =>
          import('./features/tenants/tenants.routes').then((m) => m.TENANT_ROUTES),
      },
      {
        path: 'clients',
        title: 'API clients',
        canActivate: [requireRole('clients:manage')],
        loadChildren: () =>
          import('./features/clients/clients.routes').then((m) => m.CLIENT_ROUTES),
      },
      pending('users', 'Users', ['users:manage']),
      {
        path: 'admin/activity-logs',
        title: 'Activity log',
        canActivate: [requireRole('clients:manage', 'audit:read')],
        loadChildren: () =>
          import('./features/activity-logs/activity-logs.routes').then(
            (m) => m.ACTIVITY_LOG_ROUTES
          ),
      },

      // Settings
      {
        path: 'settings/connection',
        title: 'Connection settings',
        loadComponent: () =>
          import('./features/settings/connection/connection-settings').then(
            (m) => m.ConnectionSettings
          ),
      },
      {
        path: 'settings/config-portability',
        title: 'Config portability',
        canActivate: [requireRole(...TENANT_ADMIN_ROLES)],
        loadChildren: () =>
          import('./features/config-portability/config-portability.routes').then(
            (m) => m.CONFIG_PORTABILITY_ROUTES
          ),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
