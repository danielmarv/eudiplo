import {
  type AbstractControl,
  FormControl,
  FormGroup,
  type ValidationErrors,
  Validators,
} from '@angular/forms';

/**
 * The form of an endpoint the backend calls, with an optional API key in a header: attribute
 * providers and webhook endpoints. The API never returns a stored key; it answers with
 * {@link REDACTED_SECRET}, and takes it back to keep the key, but only for the same URL.
 */

/** What the API puts in place of a stored key, and takes back to keep it. */
export const REDACTED_SECRET = '<redacted>';

export type EndpointAuth =
  { type: 'none' } | { type: 'apiKey'; config: { headerName: string; value: string } };

/** An endpoint as the API returns it. */
export interface ApiKeyEndpoint {
  id: string;
  name: string;
  description?: string | null;
  url: string;
  auth?: { type: string; config?: { headerName?: string; value?: string } } | null;
}

/** An endpoint as the API takes it. */
export interface EndpointBody {
  id?: string;
  name: string;
  description?: string | null;
  url: string;
  auth: EndpointAuth;
}

/** Where a stored key may be kept: only for the URL it was stored with. */
interface KeyContext {
  storedKeyUrl?: string;
}

/** An http or https URL, as the backend calls nothing else. */
function httpUrl(control: AbstractControl): ValidationErrors | null {
  const value = (control.value as string).trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? null : { url: true };
  } catch {
    return { url: true };
  }
}

function notBlank(control: AbstractControl): ValidationErrors | null {
  return (control.value as string).trim() ? null : { required: true };
}

/** Required while the endpoint sends an API key. */
function requiredWithKey(control: AbstractControl): ValidationErrors | null {
  if (control.parent?.get('authType')?.value !== 'apiKey') return null;
  return (control.value as string).trim() ? null : { required: true };
}

export function createEndpointForm() {
  const context: KeyContext = {};
  /** The key may stay empty to keep the stored one, unless the URL changes. */
  const keyRequired = (control: AbstractControl): ValidationErrors | null => {
    const form = control.parent;
    if (form?.get('authType')?.value !== 'apiKey' || (control.value as string).trim()) return null;
    if (!context.storedKeyUrl) return { required: true };
    return (form.get('url')?.value as string).trim() === context.storedKeyUrl
      ? null
      : { newUrl: true };
  };
  const form = new FormGroup({
    id: new FormControl('', { nonNullable: true, validators: notBlank }),
    name: new FormControl('', { nonNullable: true, validators: notBlank }),
    description: new FormControl('', { nonNullable: true }),
    url: new FormControl('', { nonNullable: true, validators: [Validators.required, httpUrl] }),
    authType: new FormControl<EndpointAuth['type']>('none', { nonNullable: true }),
    headerName: new FormControl('X-API-Key', { nonNullable: true, validators: requiredWithKey }),
    key: new FormControl('', { nonNullable: true, validators: keyRequired }),
  });
  // The key's and header's rules depend on the URL and the authentication type.
  const revalidate = () => {
    form.controls.headerName.updateValueAndValidity({ emitEvent: false });
    form.controls.key.updateValueAndValidity({ emitEvent: false });
  };
  form.controls.authType.valueChanges.subscribe(revalidate);
  form.controls.url.valueChanges.subscribe(revalidate);
  return Object.assign(form, { keyContext: context });
}

export type EndpointForm = ReturnType<typeof createEndpointForm>;

/** Fills the form with `endpoint`; a stored key stays empty and is kept unless replaced. */
export function fillEndpoint(form: EndpointForm, endpoint: Partial<ApiKeyEndpoint>): void {
  const apiKey = endpoint.auth?.type === 'apiKey';
  const value = endpoint.auth?.config?.value ?? '';
  form.keyContext.storedKeyUrl = apiKey && value === REDACTED_SECRET ? endpoint.url : undefined;
  form.setValue({
    id: endpoint.id ?? '',
    name: endpoint.name ?? '',
    description: endpoint.description ?? '',
    url: endpoint.url ?? '',
    authType: apiKey ? 'apiKey' : 'none',
    headerName: (apiKey && endpoint.auth?.config?.headerName) || 'X-API-Key',
    key: apiKey && value !== REDACTED_SECRET ? value : '',
  });
}

/**
 * Fills the form from JSON the user edited, as {@link fillEndpoint} does, except that whether a
 * key is stored stays as it was: the JSON cannot change that. Throws when it is not an object.
 */
export function applyEndpointJson(form: EndpointForm, json: unknown, editing: boolean): void {
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    throw new Error('Enter a JSON object.');
  }
  const stored = form.keyContext.storedKeyUrl;
  const endpoint = json as Partial<ApiKeyEndpoint>;
  fillEndpoint(form, editing ? { ...endpoint, id: form.controls.id.value } : endpoint);
  form.keyContext.storedKeyUrl = stored;
  form.controls.key.updateValueAndValidity();
  form.markAsDirty();
}

/**
 * The endpoint as the API takes it. A key left empty keeps the stored one. Creating leaves out an
 * empty description; editing clears it with `null`.
 */
export function endpointBody(form: EndpointForm, editing: boolean): EndpointBody {
  const value = form.getRawValue();
  const description = value.description.trim();
  return {
    ...(editing ? {} : { id: value.id.trim() }),
    name: value.name.trim(),
    ...(description ? { description } : editing ? { description: null } : {}),
    url: value.url.trim(),
    auth:
      value.authType === 'apiKey'
        ? {
            type: 'apiKey',
            config: {
              headerName: value.headerName.trim(),
              value: value.key.trim() || REDACTED_SECRET,
            },
          }
        : { type: 'none' },
  };
}

/** An ID from a name, as the user would type it: "Member DB (EU)" becomes "member-db-eu". */
export function idFromName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63);
}
