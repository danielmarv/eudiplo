import { FormArray, FormControl, FormGroup, Validators } from '@angular/forms';
import type {
  ClaimFieldDefinitionDto,
  CredentialConfigCreate,
  FieldDisplayDto,
  IaeActionOpenid4VpPresentation,
  IaeActionRedirectToWeb,
} from '@eudiplo/sdk-core';
import embeddedDisclosurePolicySchema from '../../../../../../../schemas/EmbeddedDisclosurePolicy.schema.json';
import vctSchema from '../../../../../../../schemas/VCT.schema.json';
import {
  displayColorValidator,
  uniqueDisplayLocaleValidator,
} from '../../../shared/display/display-entries';
import { jsonObject, jsonSchemaValidator } from '../../../shared/forms/json-schema-validator';
import { constraintsValidator } from './claim-schema-check';

/**
 * The form of a credential type and its conversions: a stored credential type fills it, and it
 * builds the body the API takes. Claims are edited flat, one row per path; nested claims are
 * nested again on save.
 */

export type ClaimType = ClaimFieldDefinitionDto['type'];
export type ProofType = 'attestation' | 'jwt';
type Path = (string | number | null)[];
type IaeAction = IaeActionOpenid4VpPresentation | IaeActionRedirectToWeb;

export const CLAIM_TYPES: ClaimType[] = [
  'string',
  'number',
  'integer',
  'boolean',
  'object',
  'array',
];
const DEFAULT_PROOF_TYPES: ProofType[] = ['attestation', 'jwt'];

export const LOCALES = [
  { value: 'en-US', label: 'English (United States)' },
  { value: 'en-GB', label: 'English (United Kingdom)' },
  { value: 'de-DE', label: 'German (Germany)' },
  { value: 'fr-FR', label: 'French (France)' },
  { value: 'it-IT', label: 'Italian (Italy)' },
  { value: 'es-ES', label: 'Spanish (Spain)' },
];

export const LIFETIME_PRESETS: { label: string; value: number }[] = [
  { label: '1 hour', value: 3600 },
  { label: '8 hours', value: 28800 },
  { label: '1 day', value: 86400 },
  { label: '7 days', value: 604800 },
  { label: '30 days', value: 2592000 },
  { label: '1 year', value: 31536000 },
];

export const DOC_TYPE_PRESETS = [
  { label: 'Mobile driving licence (ISO 18013-5)', value: 'org.iso.18013.5.1.mDL' },
  { label: 'EU PID', value: 'eu.europa.ec.eudi.pid.1' },
];

export const KEY_ATTESTATION_LEVELS = [
  { label: 'ISO 18045 High', value: 'iso_18045_high' },
  { label: 'ISO 18045 Moderate', value: 'iso_18045_moderate' },
];

export const REUSE_METHODS = [
  { value: 'once_only', label: 'Once only' },
  { value: 'limited_time', label: 'Limited time' },
  { value: 'rotating-batch', label: 'Rotating batch' },
  { value: 'per-relying-party', label: 'Per relying party' },
];

const vctValidator = jsonSchemaValidator(vctSchema);
const policyValidator = jsonSchemaValidator(embeddedDisclosurePolicySchema);

// ---- Groups ----

export function createDisplayGroup(display?: Record<string, unknown>) {
  const image = (value: unknown) =>
    typeof (value as { uri?: unknown } | undefined)?.uri === 'string'
      ? (value as { uri: string }).uri
      : '';
  return new FormGroup({
    name: new FormControl(String(display?.['name'] ?? ''), {
      nonNullable: true,
      validators: Validators.required,
    }),
    description: new FormControl(String(display?.['description'] ?? ''), { nonNullable: true }),
    locale: new FormControl(String(display?.['locale'] ?? 'en-US'), {
      nonNullable: true,
      validators: [Validators.required, uniqueDisplayLocaleValidator],
    }),
    background_color: new FormControl(String(display?.['background_color'] ?? ''), {
      nonNullable: true,
      validators: displayColorValidator,
    }),
    text_color: new FormControl(String(display?.['text_color'] ?? ''), {
      nonNullable: true,
      validators: displayColorValidator,
    }),
    background_image: new FormControl(image(display?.['background_image']), { nonNullable: true }),
    logo: new FormControl(image(display?.['logo']), { nonNullable: true }),
  });
}
export type DisplayGroup = ReturnType<typeof createDisplayGroup>;

export function createLabelGroup(display?: FieldDisplayDto) {
  return new FormGroup({
    locale: new FormControl(display?.locale || 'en-US', {
      nonNullable: true,
      validators: Validators.required,
    }),
    name: new FormControl(display?.name || '', {
      nonNullable: true,
      validators: Validators.required,
    }),
    description: new FormControl(display?.description || '', { nonNullable: true }),
  });
}
export type LabelGroup = ReturnType<typeof createLabelGroup>;

/** The text a default value shows in its field: plain for strings, JSON for the rest. */
function defaultText(field: ClaimFieldDefinitionDto | undefined): string {
  if (field?.defaultValue === undefined) return '';
  return typeof field.defaultValue === 'string' && field.type === 'string'
    ? field.defaultValue
    : JSON.stringify(field.defaultValue, null, 2);
}

export function createClaimGroup(field?: ClaimFieldDefinitionDto) {
  const group = new FormGroup({
    path: new FormControl(pathText(field?.path ?? []), {
      nonNullable: true,
      validators: Validators.required,
    }),
    namespace: new FormControl(field?.namespace?.trim() ?? '', { nonNullable: true }),
    type: new FormControl<ClaimType>(field?.type ?? 'string', { nonNullable: true }),
    defaultValue: new FormControl(defaultText(field), { nonNullable: true }),
    mandatory: new FormControl(!!field?.mandatory, { nonNullable: true }),
    disclosable: new FormControl(field?.disclosable ?? true, { nonNullable: true }),
    constraints: new FormControl(
      field?.constraints ? JSON.stringify(field.constraints, null, 2) : '',
      { nonNullable: true, validators: constraintsValidator }
    ),
    display: new FormArray<LabelGroup>((field?.display ?? []).map(createLabelGroup)),
  });
  group.controls.defaultValue.addValidators((control) => {
    try {
      parseDefault(control.value, group.controls.type.value);
      return null;
    } catch (error) {
      return { defaultValueType: (error as Error).message };
    }
  });
  group.controls.type.valueChanges.subscribe(() =>
    group.controls.defaultValue.updateValueAndValidity()
  );
  group.controls.defaultValue.updateValueAndValidity();
  return group;
}
export type ClaimGroup = ReturnType<typeof createClaimGroup>;

export function createActionGroup(action?: Partial<IaeAction>) {
  const redirect = action?.type === 'redirect_to_web';
  return new FormGroup({
    type: new FormControl<IaeAction['type']>(
      redirect ? 'redirect_to_web' : 'openid4vp_presentation',
      {
        nonNullable: true,
      }
    ),
    label: new FormControl(action?.label ?? '', { nonNullable: true }),
    presentationConfigId: new FormControl(
      (action as IaeActionOpenid4VpPresentation | undefined)?.presentationConfigId ?? '',
      { nonNullable: true, validators: redirect ? [] : Validators.required }
    ),
    url: new FormControl((action as IaeActionRedirectToWeb | undefined)?.url ?? '', {
      nonNullable: true,
      validators: redirect ? Validators.required : [],
    }),
    callbackUrl: new FormControl(
      (action as IaeActionRedirectToWeb | undefined)?.callbackUrl ?? '',
      {
        nonNullable: true,
      }
    ),
    description: new FormControl(
      (action as IaeActionRedirectToWeb | undefined)?.description ?? '',
      { nonNullable: true }
    ),
  });
}
export type ActionGroup = ReturnType<typeof createActionGroup>;

export function createCredentialConfigForm() {
  const form = new FormGroup({
    id: new FormControl('', { nonNullable: true, validators: Validators.required }),
    description: new FormControl('', { nonNullable: true }),
    format: new FormControl<'dc+sd-jwt' | 'mso_mdoc'>('dc+sd-jwt', { nonNullable: true }),
    /** Whether EUDIPLO hosts the type metadata (`vct` object) or the type is a URI of its own. */
    vctMode: new FormControl<'string' | 'object'>('string', { nonNullable: true }),
    vctString: new FormControl('', {
      nonNullable: true,
      validators: (control) =>
        control.parent?.get('format')?.value === 'dc+sd-jwt' &&
        control.parent?.get('vctMode')?.value === 'string' &&
        !String(control.value ?? '').trim()
          ? { required: true }
          : null,
    }),
    vct: new FormControl('', {
      nonNullable: true,
      validators: (control) =>
        control.parent?.get('format')?.value === 'mso_mdoc' ||
        control.parent?.get('vctMode')?.value !== 'object'
          ? null
          : vctValidator(control),
    }),
    docType: new FormControl('', {
      nonNullable: true,
      validators: (control) =>
        control.parent?.get('format')?.value === 'mso_mdoc' && !String(control.value ?? '').trim()
          ? { required: true }
          : null,
    }),
    sdJwtTrustFormat: new FormControl<'x5c' | 'federation'>('x5c', { nonNullable: true }),
    fields: new FormArray<ClaimGroup>([]),
    displays: new FormArray<DisplayGroup>([createDisplayGroup()]),
    keyChainId: new FormControl('', { nonNullable: true }),
    scope: new FormControl('', { nonNullable: true }),
    lifeTime: new FormControl(3600, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(1)],
    }),
    keyBinding: new FormControl(true, { nonNullable: true }),
    statusManagement: new FormControl(true, { nonNullable: true }),
    activeCredentials: new FormControl(false, { nonNullable: true }),
    revokeWithWalletUnit: new FormControl(false, { nonNullable: true }),
    keyAttestation: new FormControl(false, { nonNullable: true }),
    keyStorage: new FormControl<string[]>([], { nonNullable: true }),
    userAuthentication: new FormControl<string[]>([], { nonNullable: true }),
    proofTypes: new FormControl<ProofType[]>([...DEFAULT_PROOF_TYPES], {
      nonNullable: true,
      validators: Validators.required,
    }),
    reuse: new FormControl(false, { nonNullable: true }),
    reuseMethods: new FormControl<string[]>(['once_only'], { nonNullable: true }),
    reuseBatchSize: new FormControl(10, { nonNullable: true, validators: Validators.min(2) }),
    reuseTriggerUnused: new FormControl(2, { nonNullable: true, validators: Validators.min(0) }),
    reuseTriggerLifetime: new FormControl(86400, {
      nonNullable: true,
      validators: Validators.min(0),
    }),
    embeddedDisclosurePolicy: new FormControl('', {
      nonNullable: true,
      validators: policyValidator,
    }),
    actions: new FormArray<ActionGroup>([]),
    attributeProviderId: new FormControl('', { nonNullable: true }),
    webhookEndpointId: new FormControl('', { nonNullable: true }),
  });
  // These validators read the other fields, which they cannot while the form is being built.
  for (const control of [form.controls.vctString, form.controls.vct, form.controls.docType]) {
    control.updateValueAndValidity({ emitEvent: false });
  }
  form.updateValueAndValidity({ emitEvent: false });
  return form;
}
export type CredentialConfigForm = ReturnType<typeof createCredentialConfigForm>;

/**
 * Status management is required while Single Active Credential or Revoke with Wallet Unit is on,
 * and key attestation while Revoke with Wallet Unit is: both revoke through the status list and
 * the latter follows the proof's key attestation. Locks them on then.
 */
export function syncRequiredSettings(form: CredentialConfigForm): void {
  const { statusManagement, keyAttestation, activeCredentials, revokeWithWalletUnit } =
    form.controls;
  if (activeCredentials.value || revokeWithWalletUnit.value) {
    statusManagement.setValue(true, { emitEvent: false });
    statusManagement.disable({ emitEvent: false });
  } else {
    statusManagement.enable({ emitEvent: false });
  }
  if (revokeWithWalletUnit.value) {
    keyAttestation.setValue(true, { emitEvent: false });
    keyAttestation.disable({ emitEvent: false });
  } else {
    keyAttestation.enable({ emitEvent: false });
  }
}

/** Why status management is locked on, or empty while it can be changed. */
export function statusRequiredBy(form: CredentialConfigForm): string {
  return [
    form.controls.activeCredentials.value && 'Single active credential',
    form.controls.revokeWithWalletUnit.value && 'Revoke with wallet unit',
  ]
    .filter(Boolean)
    .join(' and ');
}

// ---- Load ----

type ConfigOptions = CredentialConfigCreate['config'] & {
  keyAttestationsRequired?: { key_storage?: string[]; user_authentication?: string[] };
  proofTypesSupported?: ProofType[];
  credentialReusePolicy?: {
    options?: {
      details?: string[];
      batch_size?: number;
      reissue_trigger_unused?: number;
      reissue_trigger_lifetime_left?: number;
    }[];
  };
};

/** Fills the form with a stored or loaded credential type. */
export function fillCredentialConfigForm(
  form: CredentialConfigForm,
  config: CredentialConfigCreate
): void {
  const options = (config.config ?? {}) as ConfigOptions;
  const reuse = options.credentialReusePolicy?.options?.[0];
  form.patchValue({
    id: config.id ?? '',
    description: config.description ?? '',
    format: options.format ?? 'dc+sd-jwt',
    vctMode: config.vct && typeof config.vct === 'object' ? 'object' : 'string',
    vctString: typeof config.vct === 'string' ? config.vct : '',
    vct: config.vct && typeof config.vct === 'object' ? JSON.stringify(config.vct, null, 2) : '',
    docType: options.docType ?? '',
    sdJwtTrustFormat:
      (config as { sdJwtTrustFormat?: 'x5c' | 'federation' }).sdJwtTrustFormat ?? 'x5c',
    keyChainId: config.keyChainId ?? '',
    scope: options.scope ?? '',
    lifeTime: config.lifeTime || 3600,
    keyBinding: config.keyBinding ?? true,
    statusManagement: config.statusManagement ?? true,
    activeCredentials: config.activeCredentials?.enabled ?? false,
    revokeWithWalletUnit: config.revokeWithWalletUnit ?? false,
    keyAttestation: !!options.keyAttestationsRequired,
    keyStorage: options.keyAttestationsRequired?.key_storage ?? [],
    userAuthentication: options.keyAttestationsRequired?.user_authentication ?? [],
    proofTypes: options.proofTypesSupported?.length
      ? options.proofTypesSupported
      : [...DEFAULT_PROOF_TYPES],
    reuse: !!options.credentialReusePolicy,
    reuseMethods: reuse?.details ?? ['once_only'],
    reuseBatchSize: reuse?.batch_size ?? 10,
    reuseTriggerUnused: reuse?.reissue_trigger_unused ?? 2,
    reuseTriggerLifetime: reuse?.reissue_trigger_lifetime_left ?? 86400,
    embeddedDisclosurePolicy: config.embeddedDisclosurePolicy
      ? JSON.stringify(config.embeddedDisclosurePolicy, null, 2)
      : '',
    attributeProviderId: config.attributeProviderId ?? '',
    webhookEndpointId: config.webhookEndpointId ?? '',
  });

  const displays = form.controls.displays;
  displays.clear({ emitEvent: false });
  const stored = (options.display ?? []) as unknown as Record<string, unknown>[];
  for (const display of stored.length ? stored : [undefined]) {
    displays.push(createDisplayGroup(display), { emitEvent: false });
  }
  for (const group of displays.controls) group.controls.locale.updateValueAndValidity();

  form.controls.fields.clear({ emitEvent: false });
  for (const field of flattenForForm(config.fields ?? [])) {
    form.controls.fields.push(createClaimGroup(field), { emitEvent: false });
  }

  form.controls.actions.clear({ emitEvent: false });
  for (const action of (config.iaeActions ?? []) as IaeAction[]) {
    form.controls.actions.push(createActionGroup(action), { emitEvent: false });
  }

  syncRequiredSettings(form);
  form.updateValueAndValidity();
}

// ---- Save ----

/**
 * The body of the form for the API. Optional values left empty are left out, or sent as null
 * where null clears a stored value. Throws when a JSON field or a claim default does not parse;
 * the form's validators show that first.
 */
export function credentialConfigBody(form: CredentialConfigForm): CredentialConfigCreate {
  const raw = form.getRawValue();
  const mdoc = raw.format === 'mso_mdoc';
  const reuseNeedsBatch = raw.reuseMethods.some((method) =>
    ['once_only', 'rotating-batch', 'per-relying-party'].includes(method)
  );
  const reuseNeedsLifetime = raw.reuseMethods.some((method) =>
    ['limited_time', 'rotating-batch', 'per-relying-party'].includes(method)
  );
  const config = {
    format: raw.format,
    display: displayBody(raw.displays),
    ...(raw.scope.trim() ? { scope: raw.scope.trim() } : {}),
    proofTypesSupported: raw.proofTypes.length ? raw.proofTypes : DEFAULT_PROOF_TYPES,
    ...(raw.reuse
      ? {
          credentialReusePolicy: {
            id: 'arf_annex_ii',
            options: [
              {
                details: raw.reuseMethods,
                ...(reuseNeedsBatch ? { batch_size: Number(raw.reuseBatchSize) } : {}),
                ...(raw.reuseMethods.includes('once_only')
                  ? { reissue_trigger_unused: Number(raw.reuseTriggerUnused) }
                  : {}),
                ...(reuseNeedsLifetime
                  ? { reissue_trigger_lifetime_left: Number(raw.reuseTriggerLifetime) }
                  : {}),
              },
            ],
          },
        }
      : {}),
    ...(raw.keyAttestation
      ? {
          keyAttestationsRequired: {
            ...(raw.keyStorage.length ? { key_storage: raw.keyStorage } : {}),
            ...(raw.userAuthentication.length
              ? { user_authentication: raw.userAuthentication }
              : {}),
          },
        }
      : {}),
    ...(mdoc && raw.docType.trim() ? { docType: raw.docType.trim() } : {}),
  };

  const vct = mdoc
    ? null
    : raw.vctMode === 'string'
      ? raw.vctString.trim() || null
      : jsonObject(raw.vct);

  return {
    id: raw.id.trim(),
    description: raw.description.trim() || null,
    config,
    ...(raw.keyChainId.trim() ? { keyChainId: raw.keyChainId.trim() } : {}),
    lifeTime: Number(raw.lifeTime),
    keyBinding: raw.keyBinding,
    statusManagement: raw.statusManagement,
    activeCredentials: { enabled: raw.activeCredentials, tracking: 'internal' },
    revokeWithWalletUnit: raw.revokeWithWalletUnit,
    vct,
    sdJwtTrustFormat: mdoc ? null : raw.sdJwtTrustFormat,
    embeddedDisclosurePolicy: jsonObject(raw.embeddedDisclosurePolicy),
    attributeProviderId: raw.attributeProviderId.trim() || null,
    webhookEndpointId: raw.webhookEndpointId.trim() || null,
    iaeActions: raw.actions.length ? raw.actions.map(actionBody) : null,
    fields: fieldsBody(raw.fields),
  } as unknown as CredentialConfigCreate;
}

/** Trims the display entries and leaves out what is empty, so wallets use their own defaults. */
function displayBody(displays: ReturnType<DisplayGroup['getRawValue']>[]) {
  return displays.map((display) => ({
    name: display.name.trim(),
    locale: display.locale,
    ...(display.description.trim() ? { description: display.description.trim() } : {}),
    ...(display.background_color.trim()
      ? { background_color: display.background_color.trim() }
      : {}),
    ...(display.text_color.trim() ? { text_color: display.text_color.trim() } : {}),
    ...(display.background_image.trim()
      ? { background_image: { uri: display.background_image.trim() } }
      : {}),
    ...(display.logo.trim() ? { logo: { uri: display.logo.trim() } } : {}),
  }));
}

function actionBody(action: ReturnType<ActionGroup['getRawValue']>): IaeAction {
  if (action.type === 'redirect_to_web') {
    return {
      type: 'redirect_to_web',
      url: action.url.trim(),
      ...(action.label.trim() ? { label: action.label.trim() } : {}),
      ...(action.callbackUrl.trim() ? { callbackUrl: action.callbackUrl.trim() } : {}),
      ...(action.description.trim() ? { description: action.description.trim() } : {}),
    } as IaeActionRedirectToWeb;
  }
  return {
    type: 'openid4vp_presentation',
    presentationConfigId: action.presentationConfigId,
    ...(action.label.trim() ? { label: action.label.trim() } : {}),
  } as IaeActionOpenid4VpPresentation;
}

function fieldsBody(rows: ReturnType<ClaimGroup['getRawValue']>[]): ClaimFieldDefinitionDto[] {
  const flat = rows
    .map((row) => {
      const defaultValue = parseDefault(row.defaultValue, row.type);
      const namespace = row.namespace.trim();
      const constraints = row.constraints.trim();
      const display = row.display
        .map((label) => ({
          locale: label.locale.trim(),
          name: label.name.trim(),
          ...(label.description.trim() ? { description: label.description.trim() } : {}),
        }))
        .filter((label) => label.locale && label.name);
      return {
        path: parsePath(row.path),
        type: row.type,
        mandatory: row.mandatory,
        disclosable: row.disclosable,
        ...(namespace ? { namespace } : {}),
        ...(defaultValue !== undefined ? { defaultValue } : {}),
        ...(constraints ? { constraints: JSON.parse(constraints) } : {}),
        ...(display.length ? { display } : {}),
      } as ClaimFieldDefinitionDto;
    })
    .filter((field) => field.path.length > 0);
  return nestFields(flat);
}

// ---- Claims ----

/** A path as typed: dot-separated, `*` for any array item, digits for an index. */
export function parsePath(text: string): Path {
  return text
    .split('.')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => (segment === '*' ? null : /^\d+$/.test(segment) ? Number(segment) : segment));
}

function pathText(path: Path): string {
  return path.map((segment) => (segment === null ? '*' : String(segment))).join('.');
}

const DEFAULT_MESSAGES: Record<string, string> = {
  boolean: 'Enter true or false.',
  number: 'Enter a finite number, e.g. 42 or 3.14.',
  integer: 'Enter a whole number, e.g. 42.',
  object: 'Enter a valid JSON object, e.g. {"city":"Berlin"}.',
  array: 'Enter a valid JSON array, e.g. ["one", "two"].',
};

/** The default value of a claim of `type`, or undefined for none. Throws when it does not fit. */
export function parseDefault(
  value: string,
  type: ClaimType
): ClaimFieldDefinitionDto['defaultValue'] {
  if (value === '') return undefined;
  if (type === 'string') return value;
  const text = value.trim();
  if (!text) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(DEFAULT_MESSAGES[type]);
  }
  const fits =
    type === 'boolean'
      ? typeof parsed === 'boolean'
      : type === 'number'
        ? typeof parsed === 'number' && Number.isFinite(parsed)
        : type === 'integer'
          ? typeof parsed === 'number' && Number.isInteger(parsed)
          : type === 'object'
            ? !!parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            : Array.isArray(parsed);
  if (!fits) throw new Error(DEFAULT_MESSAGES[type]);
  return parsed as ClaimFieldDefinitionDto['defaultValue'];
}

export function defaultHint(type: ClaimType): string {
  switch (type) {
    case 'string':
      return 'Plain text, e.g. Max, without quotes. Leave it empty for none.';
    case 'boolean':
      return 'true or false. Leave it empty for none.';
    case 'number':
      return 'A number, e.g. 42 or 3.14. Leave it empty for none.';
    case 'integer':
      return 'A whole number, e.g. 42. Leave it empty for none.';
    case 'object':
      return 'A JSON object, e.g. {"city":"Berlin"}. Leave it empty for none.';
    default:
      return 'A JSON array, e.g. ["one", "two"]. Leave it empty for none.';
  }
}

type Nested = ClaimFieldDefinitionDto & { children?: Nested[] };

/** A child's full path: its own, or its parent's path followed by it. */
function childPath(parent: Path, parentType: ClaimType, child: Path): Path {
  if (child.length >= parent.length && parent.every((segment, index) => segment === child[index])) {
    return child;
  }
  if (parentType === 'array') {
    if (!child.length) return [...parent, null];
    if (child[0] === null || typeof child[0] === 'number') return [...parent, ...child];
    return [...parent, null, ...child];
  }
  return [...parent, ...child];
}

/** The fields one row per claim, with nested children at their full paths. */
export function flattenForForm(fields: Nested[]): ClaimFieldDefinitionDto[] {
  const result: ClaimFieldDefinitionDto[] = [];
  const visit = (field: Nested): void => {
    const { children, ...own } = field;
    result.push(own);
    for (const child of children ?? []) {
      visit({
        ...child,
        path: childPath(field.path as Path, field.type, child.path as Path),
        namespace: child.namespace ?? field.namespace,
      });
    }
  };
  fields.forEach(visit);
  return result;
}

/** Nests the rows again: a row under the longest object or array row whose path starts it. */
export function nestFields(flat: ClaimFieldDefinitionDto[]): ClaimFieldDefinitionDto[] {
  const byNamespace = new Map<string, Nested[]>();
  for (const field of flat) {
    const key = field.namespace || '';
    byNamespace.set(key, [...(byNamespace.get(key) ?? []), { ...field }]);
  }
  const nested: Nested[] = [];
  for (const list of byNamespace.values()) {
    list.sort((a, b) => a.path.length - b.path.length);
    const placed: { path: Path; node: Nested }[] = [];
    for (const field of list) {
      const path = [...(field.path as Path)];
      let parent: { path: Path; node: Nested } | undefined;
      for (const candidate of placed) {
        if (candidate.path.length >= path.length) continue;
        if (candidate.node.type !== 'object' && candidate.node.type !== 'array') continue;
        if (!candidate.path.every((segment, index) => segment === path[index])) continue;
        if (!parent || candidate.path.length > parent.path.length) parent = candidate;
      }
      if (!parent) {
        nested.push(field);
        placed.push({ path, node: field });
        continue;
      }
      const child: Nested = { ...field, path: path.slice(parent.path.length) };
      parent.node.children = [...(parent.node.children ?? []), child];
      placed.push({ path, node: child });
    }
  }
  return nested;
}

/** Where EUDIPLO hosts the type metadata of a credential type; it becomes its `vct`. */
export function hostedVctUrl(publicUrl: string, tenantId: string, id: string): string {
  return `${publicUrl}/issuers/${tenantId}/credentials-metadata/vct/${id}`;
}
