import {
  type AbstractControl,
  FormArray,
  FormControl,
  FormGroup,
  type ValidationErrors,
  Validators,
} from '@angular/forms';
import type {
  PresentationConfig,
  PresentationConfigCreateDto,
  PresentationConfigUpdateDto,
  RegistrationCertificateRequest,
} from '@eudiplo/sdk-core';
import { wholeNumber } from '../../../shared/forms/setting-controls';
import type { StatusCheckMode } from './presentation-config-display';

/** The backend's default lifetime of a request, in seconds. */
export const DEFAULT_LIFETIME = 300;

export type RegistrationMode = 'none' | 'jwt' | 'id' | 'body';

/** Origins entered one per line; commas also separate them. */
export function parseOrigins(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/** The backend's rule: an http(s) origin in serialized form, lower-case, without a default port. */
const SERIALIZED_ORIGIN =
  /^(?:https:\/\/(?:[a-z0-9.-]+|\[[0-9a-f:.]+\])(?::(?:[1-9]|[1-9][0-9]|[1-35-9][0-9]{2}|4[0-35-9][0-9]|44[0-24-9]|[1-9][0-9]{3,4}))?|http:\/\/(?:[a-z0-9.-]+|\[[0-9a-f:.]+\])(?::(?:[1-9]|[1-79][0-9]|8[1-9]|[1-9][0-9]{2,4}))?)$/;
const MAX_ORIGINS = 100;

function isOrigin(value: string): boolean {
  if (!SERIALIZED_ORIGIN.test(value)) return false;
  try {
    return new URL(value).origin === value;
  } catch {
    return false;
  }
}

function originsValidator(control: AbstractControl): ValidationErrors | null {
  const origins = parseOrigins(control.value as string);
  if (origins.length > MAX_ORIGINS) return { tooMany: MAX_ORIGINS };
  const invalid = origins.filter((origin) => !isOrigin(origin));
  if (!invalid.length) return null;
  const shown = invalid.slice(0, 2).join(', ');
  return { origins: invalid.length > 2 ? `${shown} and ${invalid.length - 2} more` : shown };
}

function optionalUrl(control: AbstractControl): ValidationErrors | null {
  const value = (control.value as string).trim();
  if (!value) return null;
  try {
    new URL(value);
    return null;
  } catch {
    return { url: true };
  }
}

/** JSON text that is empty, or a list whose entries `entry` accepts; else why not. */
function jsonList(entry: (item: Record<string, unknown>, index: number) => string | null) {
  return (control: AbstractControl): ValidationErrors | null => {
    const text = (control.value as string).trim();
    if (!text) return null;
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch (error) {
      return { json: `This is not valid JSON: ${(error as Error).message}` };
    }
    if (!Array.isArray(value)) return { json: 'Enter a JSON array.' };
    for (const [index, item] of value.entries()) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return { json: `Entry ${index + 1} is not an object.` };
      }
      const problem = entry(item as Record<string, unknown>, index);
      if (problem) return { json: problem };
    }
    return null;
  };
}

const transactionData = jsonList((item, index) =>
  typeof item['type'] !== 'string' || !item['type']
    ? `Entry ${index + 1} needs a "type".`
    : !Array.isArray(item['credential_ids']) || !item['credential_ids'].length
      ? `Entry ${index + 1} needs "credential_ids", a list of credential query IDs.`
      : !item['credential_ids'].every((id) => typeof id === 'string')
        ? `Entry ${index + 1} needs string credential query IDs.`
        : null
);

const attachments = jsonList((item, index) =>
  typeof item['format'] !== 'string' || !item['format']
    ? `Entry ${index + 1} needs a "format".`
    : !item['data'] || typeof item['data'] !== 'object'
      ? `Entry ${index + 1} needs "data", an object.`
      : item['credential_ids'] !== undefined &&
          (!Array.isArray(item['credential_ids']) ||
            !item['credential_ids'].every((id) => typeof id === 'string'))
        ? `Entry ${index + 1} needs "credential_ids" to be a list of strings.`
        : null
);

/** Required while the registration certificate is obtained this way. */
function requiredFor(mode: RegistrationMode) {
  return (control: AbstractControl): ValidationErrors | null =>
    control.parent?.get('registrationMode')?.value !== mode || (control.value as string).trim()
      ? null
      : { required: true };
}

export function purposeGroup(lang = 'en-US', content = '') {
  return new FormGroup({
    lang: new FormControl(lang, { nonNullable: true }),
    content: new FormControl(content, { nonNullable: true }),
  });
}

/** Everything of a presentation configuration except its DCQL query, which has its own editor. */
export function createConfigForm() {
  const form = new FormGroup({
    id: new FormControl('', {
      nonNullable: true,
      validators: (control) => ((control.value as string).trim() ? null : { required: true }),
    }),
    description: new FormControl('', {
      nonNullable: true,
      validators: (control) => ((control.value as string).trim() ? null : { required: true }),
    }),
    lifeTime: new FormControl<number | null>(DEFAULT_LIFETIME, [
      Validators.required,
      Validators.min(1),
      wholeNumber,
    ]),
    statusCheckMode: new FormControl<StatusCheckMode>('strict', { nonNullable: true }),
    redirectUri: new FormControl('', { nonNullable: true, validators: optionalUrl }),
    allowedOrigins: new FormControl('', { nonNullable: true, validators: originsValidator }),
    accessKeyChainId: new FormControl('', { nonNullable: true }),
    webhookEndpointId: new FormControl('', { nonNullable: true }),
    registrationMode: new FormControl<RegistrationMode>('none', { nonNullable: true }),
    registrationJwt: new FormControl('', { nonNullable: true, validators: requiredFor('jwt') }),
    registrationId: new FormControl('', { nonNullable: true, validators: requiredFor('id') }),
    privacyPolicy: new FormControl('', { nonNullable: true, validators: optionalUrl }),
    supportUri: new FormControl('', { nonNullable: true, validators: optionalUrl }),
    intermediary: new FormControl('', { nonNullable: true }),
    purposes: new FormArray<ReturnType<typeof purposeGroup>>([], {
      validators: (array) =>
        array.parent?.get('registrationMode')?.value === 'body' &&
        !(array.value as { content: string }[]).some((entry) => entry.content.trim())
          ? { required: true }
          : null,
    }),
    transactionData: new FormControl('', { nonNullable: true, validators: transactionData }),
    attached: new FormControl('', { nonNullable: true, validators: attachments }),
  });
  form.controls.registrationMode.valueChanges.subscribe(() => {
    for (const name of ['registrationJwt', 'registrationId', 'purposes'] as const) {
      form.controls[name].updateValueAndValidity({ emitEvent: false });
    }
  });
  return form;
}

export type ConfigForm = ReturnType<typeof createConfigForm>;

const json = (value: unknown) =>
  value === undefined || value === null || (Array.isArray(value) && !value.length)
    ? ''
    : JSON.stringify(value, null, 2);
const text = (value: unknown) => (typeof value === 'string' ? value : '');

/** Fills the form with `config`; a copy gets the ID `<id>-copy`. */
export function fillConfigForm(
  form: ConfigForm,
  config: Partial<PresentationConfig> | Partial<PresentationConfigCreateDto>,
  copy = false
): void {
  const cert = config.registration_cert ?? undefined;
  const mode: RegistrationMode = cert?.jwt ? 'jwt' : cert?.id ? 'id' : cert?.body ? 'body' : 'none';
  const body = cert?.body;
  form.controls.purposes.clear({ emitEvent: false });
  for (const purpose of body?.purpose ?? []) {
    form.controls.purposes.push(purposeGroup(purpose.lang, purpose.content), { emitEvent: false });
  }
  form.patchValue({
    id: copy && config.id ? `${config.id}-copy` : (config.id ?? ''),
    description: config.description ?? '',
    lifeTime: config.lifeTime ?? DEFAULT_LIFETIME,
    statusCheckMode: config.statusCheckMode ?? 'strict',
    redirectUri: text(config.redirectUri),
    allowedOrigins: (config.allowedOrigins ?? []).join('\n'),
    accessKeyChainId: text(config.accessKeyChainId),
    webhookEndpointId: text(config.webhookEndpointId),
    registrationMode: mode,
    registrationJwt: cert?.jwt ?? '',
    registrationId: cert?.id ?? '',
    privacyPolicy: body?.privacy_policy ?? '',
    supportUri: body?.support_uri ?? '',
    intermediary: body?.intermediary ?? '',
    transactionData: json(config.transaction_data),
    attached: json(config.attached),
  });
  form.updateValueAndValidity();
}

/** The registration certificate as the form asks for it, or null for none. */
function registrationCert(form: ConfigForm): RegistrationCertificateRequest | null {
  const value = form.getRawValue();
  switch (value.registrationMode) {
    case 'jwt':
      return { jwt: value.registrationJwt.trim() };
    case 'id':
      return { id: value.registrationId.trim() };
    case 'body': {
      const purpose = value.purposes
        .map((entry) => ({ lang: entry.lang.trim(), content: entry.content.trim() }))
        .filter((entry) => entry.lang && entry.content);
      return {
        body: {
          purpose,
          ...(value.privacyPolicy.trim() ? { privacy_policy: value.privacyPolicy.trim() } : {}),
          ...(value.supportUri.trim() ? { support_uri: value.supportUri.trim() } : {}),
          ...(value.intermediary.trim() ? { intermediary: value.intermediary.trim() } : {}),
        },
      };
    }
    default:
      return null;
  }
}

const parsed = (text: string) => (text.trim() ? JSON.parse(text) : undefined);

/**
 * The configuration as the API takes it, with `dcql` as its query. Creating leaves out what is
 * empty; editing clears it with `null`, as the update only changes the fields it is sent.
 */
export function configBody(
  form: ConfigForm,
  dcql: object,
  editing: boolean
): PresentationConfigCreateDto & PresentationConfigUpdateDto {
  const value = form.getRawValue();
  const empty = editing ? null : undefined;
  const origins = parseOrigins(value.allowedOrigins);
  const body = {
    id: value.id.trim(),
    description: value.description.trim() || empty,
    lifeTime: value.lifeTime ?? DEFAULT_LIFETIME,
    statusCheckMode: value.statusCheckMode,
    dcql_query: dcql,
    redirectUri: value.redirectUri.trim() || empty,
    allowedOrigins: origins.length ? origins : empty,
    accessKeyChainId: value.accessKeyChainId || empty,
    webhookEndpointId: value.webhookEndpointId || empty,
    registration_cert: registrationCert(form) ?? empty,
    transaction_data: parsed(value.transactionData) ?? empty,
    attached: parsed(value.attached) ?? (editing ? [] : undefined),
  };
  return Object.fromEntries(
    Object.entries(body).filter(([, entry]) => entry !== undefined)
  ) as PresentationConfigCreateDto & PresentationConfigUpdateDto;
}
