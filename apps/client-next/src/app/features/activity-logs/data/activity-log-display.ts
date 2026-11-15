import type { ActivityEntry } from './activity-log-queries';

/** What an entry changed, named as the Web Client names it. */
const OBJECT_LABELS: Record<string, string> = {
  tenant: 'Tenant',
  presentation_config: 'Presentation configuration',
  issuance_config: 'Issuer settings',
  credential_config: 'Credential type',
  attribute_provider: 'Attribute provider',
  status_list_config: 'Status list settings',
  webhook_endpoint: 'Webhook endpoint',
  federation_trust_anchor: 'Federation trust anchor',
  config_bundle: 'Configuration bundle',
  config_client_secret: 'Client secret',
  config_resource: 'Configuration resource',
  session: 'Session',
};

const VERBS = [
  'created',
  'updated',
  'deleted',
  'reset',
  'cancelled',
  'exported',
  'imported',
  'generated',
  'detached',
  'reattached',
] as const;
type Verb = (typeof VERBS)[number];

/** How an action changed its object, for the colour of its badge. */
export type ActionTone = 'create' | 'change' | 'remove' | 'neutral';

const TONES: Record<Verb, ActionTone> = {
  created: 'create',
  imported: 'create',
  generated: 'create',
  reattached: 'create',
  updated: 'change',
  reset: 'change',
  detached: 'change',
  deleted: 'remove',
  cancelled: 'remove',
  exported: 'neutral',
};

/** An action type split into its object and verb: `credential_config_updated`. */
export function parseAction(actionType: string): { object: string; verb: Verb | null } {
  const verb = VERBS.find((candidate) => actionType.endsWith(`_${candidate}`));
  return verb
    ? { object: actionType.slice(0, -(verb.length + 1)), verb }
    : { object: actionType, verb: null };
}

function objectLabel(object: string): string {
  return OBJECT_LABELS[object] ?? object.replace(/_/g, ' ');
}

/** The action in words: "Credential type updated". */
export function actionLabel(actionType: string | undefined): string {
  if (!actionType) return 'Unknown action';
  const { object, verb } = parseAction(actionType);
  return verb ? `${objectLabel(object)} ${verb}` : objectLabel(object);
}

export function actionTone(actionType: string | undefined): ActionTone {
  const verb = actionType ? parseAction(actionType).verb : null;
  return verb ? TONES[verb] : 'neutral';
}

/** The kinds of object the entries changed, for the filter, by label. */
export function objectTypes(entries: readonly ActivityEntry[]): { value: string; label: string }[] {
  const objects = new Set(entries.map((entry) => parseAction(entry.actionType).object));
  return [...objects]
    .map((value) => ({ value, label: objectLabel(value) }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

const ACTOR_TYPES: Record<ActivityEntry['actorType'], string> = {
  user: 'Person',
  client: 'API client',
  system: 'EUDIPLO',
};

/** Who did it: their name or ID, and whether a person, a client or EUDIPLO itself. */
export function actorOf(entry: ActivityEntry): { name: string; kind: string } {
  return {
    name:
      entry.actorDisplay || entry.actorId || (entry.actorType === 'system' ? 'System' : 'Unknown'),
    kind: ACTOR_TYPES[entry.actorType] ?? entry.actorType,
  };
}

/** A value of `before` or `after`, short enough for a table cell; undefined when absent. */
function formatValue(value: unknown): string {
  if (value === undefined) return '—';
  if (value === null) return 'null';
  if (typeof value === 'string') return value === '' ? '""' : value;
  return JSON.stringify(value, null, 2);
}

/** The changed fields with their values before and after, as far as the entry recorded them. */
export function changesOf(
  entry: ActivityEntry
): { field: string; before: string; after: string }[] {
  const fields = entry.changedFields?.length
    ? entry.changedFields
    : [...new Set([...Object.keys(entry.before ?? {}), ...Object.keys(entry.after ?? {})])];
  return fields.map((field) => ({
    field,
    before: formatValue(entry.before?.[field]),
    after: formatValue(entry.after?.[field]),
  }));
}
