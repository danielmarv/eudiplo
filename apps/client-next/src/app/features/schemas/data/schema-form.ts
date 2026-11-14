import {
  type AbstractControl,
  FormArray,
  FormControl,
  FormGroup,
  type ValidationErrors,
  Validators,
} from '@angular/forms';
import type { CredentialConfig, PublishSchemaMetaConfig } from '@eudiplo/sdk-core';
import {
  certificateBase64,
  certificateValidator,
} from '../../../shared/certificates/certificate-validator';
import { SEMVER_REGEX } from './schema-version';

/** The fields of a new schema, as the create page asks for them. */
export function createSchemaForm() {
  return new FormGroup(
    {
      name: new FormControl('', { nonNullable: true, validators: Validators.required }),
      version: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required, Validators.pattern(SEMVER_REGEX)],
      }),
      rulebookURI: new FormControl('', { nonNullable: true, validators: Validators.required }),
      attestationLoS: new FormControl<PublishSchemaMetaConfig['attestationLoS'] | ''>('', {
        nonNullable: true,
        validators: Validators.required,
      }),
      bindingType: new FormControl<PublishSchemaMetaConfig['bindingType'] | ''>('', {
        nonNullable: true,
        validators: Validators.required,
      }),
      category: new FormControl('', { nonNullable: true }),
      tags: new FormControl<string[]>([], { nonNullable: true }),
      /** The credential types whose schemas EUDIPLO builds and uploads. */
      credentialConfigIds: new FormControl<string[]>([], {
        nonNullable: true,
        validators: Validators.required,
      }),
      trustListIds: new FormControl<string[]>([], { nonNullable: true }),
      rootCertificates: new FormArray<FormControl<string>>([]),
    },
    { validators: needsTrustedAuthority }
  );
}

export type SchemaForm = ReturnType<typeof createSchemaForm>;

/** A root certificate field, in PEM or base64 DER. */
export function rootCertificateControl(value = ''): FormControl<string> {
  return new FormControl(value, {
    nonNullable: true,
    validators: [Validators.required, certificateValidator],
  });
}

/** A schema needs at least one trusted authority: a trust list or a root certificate. */
function needsTrustedAuthority(control: AbstractControl): ValidationErrors | null {
  const trustLists = control.get('trustListIds')?.value as string[] | undefined;
  const certificates = control.get('rootCertificates')?.value as string[] | undefined;
  return trustLists?.length || certificates?.length ? null : { trustedAuthority: true };
}

/**
 * The credential type the new schema is linked back to: the one the page was opened for, else
 * the only one selected. Several selected link none.
 */
export function linkedConfigId(
  form: SchemaForm,
  openedFor: string | undefined
): string | undefined {
  if (openedFor) return openedFor;
  const selected = form.controls.credentialConfigIds.value;
  return selected.length === 1 ? selected[0] : undefined;
}

/**
 * The schema the credential type `id` is linked to already, by its route ID (the last segment of
 * its `schemaMeta.id`); null when it has none. A linked one gets a new version there instead.
 */
export function existingSchemaOf(
  id: string | undefined,
  configs: readonly CredentialConfig[]
): { config: CredentialConfig; schemaId: string; routeId: string } | null {
  if (!id) return null;
  const config = configs.find((item) => item.id === id);
  const schemaId = config?.schemaMeta?.id?.trim();
  if (!config || !schemaId) return null;
  return { config, schemaId, routeId: schemaId.split('/').filter(Boolean).at(-1) ?? schemaId };
}

/**
 * The publish request of the form: the backend builds and uploads the schema of each selected
 * credential type, and publishes each trust list with its URL and certificate. Root certificates
 * go as base64 DER.
 */
export function schemaRequest(form: SchemaForm): Omit<PublishSchemaMetaConfig, 'id'> {
  const raw = form.getRawValue();
  return {
    name: raw.name.trim(),
    version: raw.version.trim(),
    rulebookURI: raw.rulebookURI.trim(),
    attestationLoS: raw.attestationLoS as PublishSchemaMetaConfig['attestationLoS'],
    bindingType: raw.bindingType as PublishSchemaMetaConfig['bindingType'],
    ...(raw.category ? { category: raw.category as PublishSchemaMetaConfig['category'] } : {}),
    ...(raw.tags.length ? { tags: raw.tags as PublishSchemaMetaConfig['tags'] } : {}),
    schemaURIs: raw.credentialConfigIds.map((credentialConfigId) => ({ credentialConfigId })),
    trustedAuthorities: [
      ...raw.trustListIds.map((trustListId) => ({ trustListId })),
      ...raw.rootCertificates.map((value) => ({
        frameworkType: 'x509' as const,
        value: certificateBase64(value),
      })),
    ],
  };
}
