import {
  lucideActivity,
  lucideArrowRightLeft,
  lucideBraces,
  lucideBuilding2,
  lucideCirclePlus,
  lucideDatabase,
  lucideFileCheck,
  lucideFileCog,
  lucideHistory,
  lucideIdCard,
  lucideKey,
  lucideLayoutDashboard,
  lucideListChecks,
  lucideListOrdered,
  lucideMonitorSmartphone,
  lucideNetwork,
  lucidePlug,
  lucideScanLine,
  lucideServer,
  lucideSlidersHorizontal,
  lucideTimer,
  lucideUsers,
  lucideWebhook,
} from '@ng-icons/lucide';
import type { Role } from '../core/auth/role-grants';

/** The roles that open key chains, which issuance and verification both sign with. */
export const KEY_CHAIN_ROLES: Role[] = ['issuance:manage', 'presentation:manage', 'keys:manage'];

/** What decides whether an entry shows for the signed-in caller. */
export interface NavContext {
  hasRole(roles: Role | Role[]): boolean;
  /** People are managed here only with the built-in server or Keycloak. */
  readonly managesUsers: boolean;
  /** With another identity provider, that provider manages the API clients. */
  readonly managesClients: boolean;
  /** Config Portability needs a tenant and `tenant:admin` or `tenants:manage`. */
  readonly canUseConfigPortability: boolean;
}

interface NavItem {
  readonly label: string;
  readonly path: string;
  /** Name of a lucide icon registered in {@link NAV_ICONS}. */
  readonly icon: keyof typeof NAV_ICONS;
  readonly visible?: (context: NavContext) => boolean;
}

export interface NavGroup {
  readonly label: string;
  readonly items: readonly NavItem[];
}

export const NAV_ICONS = {
  lucideActivity,
  lucideArrowRightLeft,
  lucideBraces,
  lucideBuilding2,
  lucideCirclePlus,
  lucideDatabase,
  lucideFileCheck,
  lucideFileCog,
  lucideHistory,
  lucideIdCard,
  lucideKey,
  lucideLayoutDashboard,
  lucideListChecks,
  lucideListOrdered,
  lucideMonitorSmartphone,
  lucideNetwork,
  lucidePlug,
  lucideScanLine,
  lucideServer,
  lucideSlidersHorizontal,
  lucideTimer,
  lucideUsers,
  lucideWebhook,
};

const issuesOrVerifies = (c: NavContext) => c.hasRole(['issuance:manage', 'presentation:manage']);

/**
 * The navigation, in the order of the work: issue and verify first, then what they rely on,
 * then administration. A group shows when one of its entries does.
 */
const NAVIGATION: readonly NavGroup[] = [
  {
    label: 'Overview',
    items: [{ label: 'Dashboard', path: '/dashboard', icon: 'lucideLayoutDashboard' }],
  },
  {
    label: 'Issuance',
    items: [
      {
        label: 'New issuance',
        path: '/offer/issuance',
        icon: 'lucideCirclePlus',
        visible: (c) => c.hasRole('issuance:offer'),
      },
      {
        label: 'Credential types',
        path: '/credential-config',
        icon: 'lucideIdCard',
        visible: (c) => c.hasRole('issuance:manage'),
      },
      {
        label: 'Issuer settings',
        path: '/issuance-config',
        icon: 'lucideSlidersHorizontal',
        visible: (c) => c.hasRole('issuance:manage'),
      },
      {
        label: 'Status lists',
        path: '/status-lists',
        icon: 'lucideListOrdered',
        visible: (c) => c.hasRole('issuance:manage'),
      },
      {
        label: 'Attribute providers',
        path: '/attribute-providers',
        icon: 'lucideDatabase',
        visible: (c) => c.hasRole('issuance:manage'),
      },
    ],
  },
  {
    label: 'Verification',
    items: [
      {
        label: 'New verification',
        path: '/offer/presentation',
        icon: 'lucideScanLine',
        visible: (c) => c.hasRole('presentation:request'),
      },
      {
        label: 'Verification configs',
        path: '/presentation-config',
        icon: 'lucideFileCheck',
        visible: (c) => c.hasRole('presentation:manage'),
      },
    ],
  },
  {
    label: 'Sessions',
    items: [
      {
        label: 'All sessions',
        path: '/session-management',
        icon: 'lucideActivity',
        visible: (c) => c.hasRole(['presentation:request', 'issuance:offer', 'sessions:read']),
      },
      {
        label: 'Session settings',
        path: '/session-management/config',
        icon: 'lucideTimer',
        visible: issuesOrVerifies,
      },
    ],
  },
  {
    label: 'Trust and keys',
    items: [
      {
        label: 'Keys',
        path: '/keys',
        icon: 'lucideKey',
        visible: (c) => c.hasRole(KEY_CHAIN_ROLES),
      },
      {
        label: 'Trust lists',
        path: '/trust-list',
        icon: 'lucideListChecks',
        visible: issuesOrVerifies,
      },
      {
        label: 'Federation trust anchors',
        path: '/federation-trust-anchor',
        icon: 'lucideNetwork',
        visible: issuesOrVerifies,
      },
      {
        label: 'KMS providers',
        path: '/kms',
        icon: 'lucideServer',
        visible: (c) => c.hasRole(KEY_CHAIN_ROLES),
      },
    ],
  },
  {
    label: 'Integrations',
    items: [
      {
        label: 'Webhook endpoints',
        path: '/webhook-endpoints',
        icon: 'lucideWebhook',
        visible: issuesOrVerifies,
      },
      {
        label: 'Registrar',
        path: '/registrar',
        icon: 'lucideFileCog',
        visible: (c) => c.hasRole('registrar:manage'),
      },
      {
        label: 'Schemas',
        path: '/schema',
        icon: 'lucideBraces',
        visible: (c) => c.hasRole('registrar:manage'),
      },
    ],
  },
  {
    label: 'Administration',
    items: [
      {
        label: 'Tenants',
        path: '/tenants',
        icon: 'lucideBuilding2',
        visible: (c) => c.hasRole('tenants:manage'),
      },
      {
        label: 'API clients',
        path: '/clients',
        icon: 'lucideMonitorSmartphone',
        visible: (c) => c.hasRole('clients:manage') && c.managesClients,
      },
      {
        label: 'Users',
        path: '/users',
        icon: 'lucideUsers',
        visible: (c) => c.hasRole('users:manage') && c.managesUsers,
      },
      {
        label: 'Activity log',
        path: '/admin/activity-logs',
        icon: 'lucideHistory',
        visible: (c) => c.hasRole(['clients:manage', 'audit:read']),
      },
    ],
  },
  {
    label: 'Settings',
    items: [
      { label: 'Connection settings', path: '/settings/connection', icon: 'lucidePlug' },
      {
        label: 'Config portability',
        path: '/settings/config-portability',
        icon: 'lucideArrowRightLeft',
        visible: (c) => c.canUseConfigPortability,
      },
    ],
  },
];

/** The groups and entries the caller sees; groups without a visible entry are left out. */
export function visibleNavigation(context: NavContext): NavGroup[] {
  return NAVIGATION.map((group) => ({
    ...group,
    items: group.items.filter((item) => item.visible?.(context) ?? true),
  })).filter((group) => group.items.length > 0);
}
