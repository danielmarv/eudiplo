import {
  FormControl,
  FormGroup,
  Validators,
  type AbstractControl,
  type ValidationErrors,
} from '@angular/forms';
import type {
  CreateFederationTrustAnchorDto,
  UpdateFederationTrustAnchorDto,
} from '@eudiplo/sdk-core';

const PRIVATE_JWK_MEMBERS = new Set(['d', 'p', 'q', 'dp', 'dq', 'qi', 'oth', 'k']);

export function isFederationEntityId(value: string): boolean {
  if (value.includes('?') || value.includes('#')) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !!url.hostname;
  } catch {
    return false;
  }
}

function jwksValue(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const keys = (parsed as { keys?: unknown }).keys;
  if (!Array.isArray(keys) || !keys.length) return null;
  for (const key of keys) {
    if (!key || typeof key !== 'object' || Array.isArray(key)) return null;
    const jwk = key as Record<string, unknown>;
    if (
      !['EC', 'RSA', 'OKP'].includes(String(jwk['kty'])) ||
      typeof jwk['kid'] !== 'string' ||
      !jwk['kid'].trim() ||
      Object.keys(jwk).some((member) => PRIVATE_JWK_MEMBERS.has(member))
    ) {
      return null;
    }
  }
  return parsed as Record<string, unknown>;
}

function entityIdValidator(control: AbstractControl): ValidationErrors | null {
  const value = String(control.value ?? '').trim();
  return !value || isFederationEntityId(value) ? null : { entityId: true };
}

function jwksValidator(control: AbstractControl): ValidationErrors | null {
  return jwksValue(control.value) ? null : { jwks: true };
}

export type FederationTrustAnchorForm = FormGroup<{
  id: FormControl<string>;
  entityId: FormControl<string>;
  description: FormControl<string>;
  jwks: FormControl<string>;
}>;

export function createFederationTrustAnchorForm(): FederationTrustAnchorForm {
  return new FormGroup({
    id: new FormControl('', {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.maxLength(255),
        Validators.pattern(/^[A-Za-z0-9._-]+$/),
      ],
    }),
    entityId: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(2048), entityIdValidator],
    }),
    description: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(1000)],
    }),
    jwks: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, jwksValidator],
    }),
  });
}

export function federationTrustAnchorCreateBody(
  form: FederationTrustAnchorForm
): CreateFederationTrustAnchorDto {
  const value = form.getRawValue();
  const jwks = jwksValue(value.jwks);
  if (!jwks) throw new Error('The public JWK set is invalid');
  return {
    id: value.id.trim(),
    entityId: value.entityId.trim(),
    description: value.description.trim() || null,
    jwks: jwks as CreateFederationTrustAnchorDto['jwks'],
  };
}

export function federationTrustAnchorUpdateBody(
  form: FederationTrustAnchorForm
): UpdateFederationTrustAnchorDto {
  const value = federationTrustAnchorCreateBody(form);
  return {
    entityId: value.entityId,
    description: value.description,
    jwks: value.jwks,
  };
}

export function federationTrustAnchorJwksText(jwks: Record<string, unknown>): string {
  return JSON.stringify(jwks, null, 2);
}
