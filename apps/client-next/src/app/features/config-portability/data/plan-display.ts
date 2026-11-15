import type { ConfigResourceKind } from '../../../shared/config-ownership/config-ownership';
import type { ImportMode, ImportPlan, PlanChange, PlanItem, Resource } from './portability-queries';

export const MODES: { value: ImportMode; label: string; hint: string }[] = [
  {
    value: 'upsert',
    label: 'Create and update',
    hint: 'Adds new resources and updates existing ones. Nothing is deleted.',
  },
  {
    value: 'create',
    label: 'Create only',
    hint: 'Adds new resources; existing ones are left as they are.',
  },
  {
    value: 'replace',
    label: 'Replace managed resources',
    hint: 'Also deletes resources this bundle source manages that the bundle leaves out.',
  },
];

/** A change whose `after` is missing removes the stored value; `null` is a value. */
const removesValue = (change: PlanChange) => change.after === undefined;

const fieldCount = (count: number) => `${count} ${count === 1 ? 'field' : 'fields'}`;

/** The field changes of an item at a glance: "3 fields, 1 removed". */
export function changeSummary(item: PlanItem): string {
  const changes = item.changes ?? [];
  const removed = changes.filter(removesValue).length;
  return removed ? `${fieldCount(changes.length)}, ${removed} removed` : fieldCount(changes.length);
}

/** How one side of a change reads: a value, a word for what is not shown, or the removal. */
export function changeSide(
  change: PlanChange,
  side: 'before' | 'after'
): { text: string; kind: 'value' | 'described' | 'removed' } {
  const value = change[side];
  if (side === 'after' && removesValue(change)) return { text: 'removed', kind: 'removed' };
  if (value === undefined) return { text: 'not set', kind: 'described' };
  // The markers of configChanges in packages/eudiplo-config-format/src/config-values.ts.
  if (change.redacted && value === '[redacted]') return { text: 'secret', kind: 'described' };
  if (change.redacted && value === '[changed]') return { text: 'changed', kind: 'described' };
  return { text: JSON.stringify(value), kind: 'value' };
}

export function hasRedactedChanges(plan: ImportPlan): boolean {
  return plan.items.some((item) => item.changes?.some((change) => change.redacted));
}

/** Whether applying the plan replaces the secret of an existing client. */
export function regeneratesClientSecret(plan: ImportPlan): boolean {
  return plan.items.some(
    (item) =>
      item.kind === 'Client' &&
      item.action === 'update' &&
      !!item.changes?.some((change) => change.path === '/spec/secret')
  );
}

/**
 * What to confirm before an import is applied: the resources replace mode deletes and the stored
 * values the bundle leaves out. Empty when it needs no confirmation.
 */
export function applyWarnings(plan: ImportPlan, mode: ImportMode): string[] {
  const parts: string[] = [];
  const deletions = plan.items
    .filter((item) => item.action === 'delete')
    .map((item) => `${item.kind}/${item.id}`);
  if (mode === 'replace') {
    parts.push(
      deletions.length
        ? `Replace mode deletes the resources of this bundle source that the bundle leaves out: ${deletions.join(', ')}.`
        : 'This replace import deletes no resource.'
    );
  }
  const removals = plan.items.flatMap((item) => {
    const count = item.changes?.filter(removesValue).length ?? 0;
    return count ? [`${item.kind}/${item.id} (${fieldCount(count)})`] : [];
  });
  if (removals.length) {
    parts.push(
      `The import removes stored values the bundle leaves out, marked as removed in the plan: ${removals.join(', ')}.`
    );
  }
  if (deletions.length || removals.length) parts.push('This cannot be undone.');
  return parts;
}

const PAGE_BY_KIND: Partial<Record<ConfigResourceKind, string>> = {
  Tenant: '/tenants',
  Client: '/clients',
  KeyChain: '/keys',
  CredentialConfig: '/credential-config',
  PresentationConfig: '/presentation-config',
  AttributeProvider: '/attribute-providers',
  WebhookEndpoint: '/webhook-endpoints',
  TrustList: '/trust-list',
  FederationTrustAnchor: '/federation-trust-anchor',
  StatusList: '/status-lists',
};

const SINGLETON_PAGES: Partial<Record<ConfigResourceKind, string>> = {
  IssuanceConfig: '/issuance-config',
  RegistrarConfig: '/registrar',
  KmsConfig: '/kms',
  KeyChainDefaults: '/keys',
};

/** The page of a resource, or null for a kind without one. */
export function resourceLink(resource: Pick<Resource, 'kind' | 'resourceId'>): string[] | null {
  const base = PAGE_BY_KIND[resource.kind];
  if (base) return [base, resource.resourceId];
  const singleton = SINGLETON_PAGES[resource.kind];
  return singleton ? [singleton] : null;
}

export const resourceKey = (resource: Pick<Resource, 'kind' | 'resourceId'>) =>
  `${resource.kind}/${resource.resourceId}`;

/** Where a resource comes from: its file or bundle, else the API or the Web Client. */
export const sourceLabel = (resource: Pick<Resource, 'source'>) =>
  resource.source || 'API or Web Client';

export const OWNERSHIP_LABELS: Record<Resource['ownership'], string> = {
  'file-managed': 'File-managed',
  detached: 'Detached',
  unmanaged: 'Unmanaged',
};
