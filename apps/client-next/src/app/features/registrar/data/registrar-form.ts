import {
  type AbstractControl,
  FormControl,
  FormGroup,
  type ValidationErrors,
  type ValidatorFn,
} from '@angular/forms';
import type {
  CreateRegistrarConfigDto,
  RegistrarConfigResponseDto,
  UpdateRegistrarConfigDto,
} from '@eudiplo/sdk-core';

/** Registrars the URLs can be filled in from. */
export const REGISTRAR_PRESETS = [
  {
    name: 'German sandbox',
    registrarUrl: 'https://sandbox.eudi-wallet.org/api',
    oidcUrl: 'https://auth.sandbox.eudi-wallet.org/realms/sandbox-registrar',
    clientId: 'swagger',
  },
] as const;

/**
 * The backend appends API and OIDC paths to both URLs, so they must be base URLs: http(s), no
 * query, no fragment (not even a trailing `?` or `#`) and no credentials.
 */
function baseUrl(control: AbstractControl): ValidationErrors | null {
  const value = (control.value as string).trim();
  if (!value) return { required: true };
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { url: true };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return { url: true };
  return url.username || url.password || value.includes('?') || value.includes('#')
    ? { baseUrl: true }
    : null;
}

function required(control: AbstractControl): ValidationErrors | null {
  return (control.value as string).trim() ? null : { required: true };
}

/** The registrar's rules for the relying party contact, which the backend repeats. */
const CONTACT_RULES = {
  supportUri: (value: string) => {
    try {
      return new URL(value).protocol === 'https:';
    } catch {
      return false;
    }
  },
  email: (value: string) => /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(value),
  phone: (value: string) => /^[+0-9()\-\s]{5,40}$/.test(value),
};

type ContactField = keyof typeof CONTACT_RULES;
const CONTACT_FIELDS = Object.keys(CONTACT_RULES) as ContactField[];

function contact(rule: (value: string) => boolean): ValidatorFn {
  return (control) => {
    const value = (control.value as string).trim();
    return !value || rule(value) ? null : { pattern: true };
  };
}

/** The registration certificate defaults the form shows; others are kept as they are. */
const DEFAULT_FIELDS = ['privacy_policy', 'support_uri', 'intermediary'] as const;

export function createRegistrarForm() {
  const context: { stored: RegistrarConfigResponseDto | null } = { stored: null };
  const form = new FormGroup({
    registrarUrl: new FormControl('', { nonNullable: true, validators: baseUrl }),
    oidcUrl: new FormControl('', { nonNullable: true, validators: baseUrl }),
    clientId: new FormControl('', { nonNullable: true, validators: required }),
    clientSecret: new FormControl('', { nonNullable: true }),
    username: new FormControl('', { nonNullable: true, validators: required }),
    // Required unless the stored password is kept, which needs the same URLs.
    password: new FormControl('', {
      nonNullable: true,
      validators: (control) =>
        !(control.value as string) &&
        (!context.stored?.hasPassword || differs(context.stored, control.parent))
          ? { required: true }
          : null,
    }),
    supportUri: new FormControl('', {
      nonNullable: true,
      validators: contact(CONTACT_RULES.supportUri),
    }),
    email: new FormControl('', { nonNullable: true, validators: contact(CONTACT_RULES.email) }),
    phone: new FormControl('', { nonNullable: true, validators: contact(CONTACT_RULES.phone) }),
    privacy_policy: new FormControl('', { nonNullable: true }),
    support_uri: new FormControl('', { nonNullable: true }),
    intermediary: new FormControl('', { nonNullable: true }),
  });
  const revalidate = () => form.controls.password.updateValueAndValidity({ emitEvent: false });
  form.controls.registrarUrl.valueChanges.subscribe(revalidate);
  form.controls.oidcUrl.valueChanges.subscribe(revalidate);
  return Object.assign(form, { context });
}

export type RegistrarForm = ReturnType<typeof createRegistrarForm>;

/**
 * Whether the URLs differ from the stored ones. The backend keeps the stored password and client
 * secret only for the same URLs, so new URLs replace the whole configuration.
 */
export function urlsChanged(form: RegistrarForm): boolean {
  return !!form.context.stored && differs(form.context.stored, form);
}

function differs(stored: RegistrarConfigResponseDto, form: AbstractControl | null): boolean {
  const url = (name: string) => ((form?.get(name)?.value as string | undefined) ?? '').trim();
  return url('registrarUrl') !== stored.registrarUrl || url('oidcUrl') !== stored.oidcUrl;
}

/** Fills the form with the stored configuration; the secrets stay empty, as none is returned. */
export function fillRegistrarForm(
  form: RegistrarForm,
  stored: RegistrarConfigResponseDto | null
): void {
  form.context.stored = stored;
  const defaults = (stored?.registrationCertificateDefaults ?? {}) as Record<string, unknown>;
  const text = (value: unknown) => (typeof value === 'string' ? value : '');
  form.reset({
    registrarUrl: stored?.registrarUrl ?? '',
    oidcUrl: stored?.oidcUrl ?? '',
    clientId: stored?.clientId ?? '',
    clientSecret: '',
    username: stored?.username ?? '',
    password: '',
    supportUri: stored?.relyingPartyContact?.supportUri ?? '',
    email: stored?.relyingPartyContact?.email ?? '',
    phone: stored?.relyingPartyContact?.phone ?? '',
    privacy_policy: text(defaults['privacy_policy']),
    support_uri: text(defaults['support_uri']),
    intermediary: text(defaults['intermediary']),
  });
}

/**
 * The stored defaults with the form's fields on top: a filled field sets its key, a cleared one
 * removes it, and keys the form does not show, such as `provides_attestations`, stay.
 */
function mergedDefaults(form: RegistrarForm): Record<string, unknown> | null {
  const value = form.getRawValue();
  const defaults: Record<string, unknown> = {
    ...(form.context.stored?.registrationCertificateDefaults as Record<string, unknown> | null),
  };
  for (const key of DEFAULT_FIELDS) {
    const entry = value[key].trim();
    if (entry) defaults[key] = entry;
    else if (typeof defaults[key] === 'string') delete defaults[key];
  }
  return Object.keys(defaults).length ? defaults : null;
}

function contactOf(form: RegistrarForm): Record<ContactField, string> | null {
  const value = form.getRawValue();
  const entries = CONTACT_FIELDS.map((field) => [field, value[field].trim()] as const).filter(
    ([, entry]) => entry
  );
  return entries.length ? (Object.fromEntries(entries) as Record<ContactField, string>) : null;
}

/**
 * What saving sends. A stored configuration with the same URLs is changed with `PATCH`: it leaves
 * the URLs out, and an unchanged client ID or username, as the backend checks the credentials
 * again whenever the request carries one; a secret is sent only when entered. Otherwise `POST`
 * replaces the configuration, and an empty client secret removes the stored one.
 */
export function registrarRequest(
  form: RegistrarForm
):
  | { method: 'POST'; body: CreateRegistrarConfigDto }
  | { method: 'PATCH'; body: UpdateRegistrarConfigDto } {
  const value = form.getRawValue();
  const stored = form.context.stored;
  const shared = {
    ...(value.clientSecret ? { clientSecret: value.clientSecret } : {}),
    ...(value.password ? { password: value.password } : {}),
    registrationCertificateDefaults: mergedDefaults(form),
    relyingPartyContact: contactOf(form),
  };
  if (stored && !urlsChanged(form)) {
    return {
      method: 'PATCH',
      body: {
        ...(value.clientId.trim() !== stored.clientId ? { clientId: value.clientId.trim() } : {}),
        ...(value.username.trim() !== stored.username ? { username: value.username.trim() } : {}),
        ...shared,
      },
    };
  }
  return {
    method: 'POST',
    body: {
      registrarUrl: value.registrarUrl.trim(),
      oidcUrl: value.oidcUrl.trim(),
      clientId: value.clientId.trim(),
      username: value.username.trim(),
      password: value.password,
      ...shared,
    },
  };
}
