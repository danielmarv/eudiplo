import type { Role } from './role-grants';

/**
 * What each role allows, in a line, for the role choices of a form. Shortened from the backend's
 * role descriptions (`apps/backend/src/auth/roles/role.enum.ts`), which the documentation lists in
 * full. A record, so the build fails when the SDK knows a role that is missing here.
 */
export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  'issuance:offer': 'Create credential offers and follow their sessions',
  'issuance:manage': 'Configure credentials, issuance and status lists, revoke credentials',
  'credentials:status': 'Revoke, suspend or reinstate issued credentials',
  'presentation:request': 'Create presentation requests and follow their sessions',
  'presentation:manage': 'Configure presentations, trust lists and webhooks',
  'sessions:read': 'Read sessions, their logs and statistics without changing them',
  'audit:read': "Read the tenant's audit log",
  'keys:manage': 'Create, import, rotate and delete key chains',
  'registrar:manage': 'Configure the registrar and enroll access certificates',
  'clients:manage': "Manage the tenant's API clients and read its audit log",
  'users:manage': "Manage the tenant's people",
  'tenant:admin': "Manage the tenant's whole configuration, key export and KMS settings",
  'tenants:manage': 'Operate the instance: create, change and delete every tenant',
};

/** The roles by what they are for, the most powerful last; every role is in one group. */
export const ROLE_GROUPS: readonly { readonly label: string; readonly roles: readonly Role[] }[] = [
  { label: 'Issuance', roles: ['issuance:offer', 'issuance:manage', 'credentials:status'] },
  { label: 'Verification', roles: ['presentation:request', 'presentation:manage'] },
  {
    label: 'Operations',
    roles: ['sessions:read', 'audit:read', 'keys:manage', 'registrar:manage'],
  },
  {
    label: 'Administration',
    roles: ['clients:manage', 'users:manage', 'tenant:admin', 'tenants:manage'],
  },
];

/** The roles in the order a form or list shows them: by group. */
export const ROLE_ORDER: readonly Role[] = ROLE_GROUPS.flatMap((group) => group.roles);
