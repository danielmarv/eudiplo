import { signal, type WritableSignal } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import {
  type AttributeProviderEntity,
  type ClaimFieldDefinition,
  type CredentialConfig,
  deriveRuntimeArtifacts,
} from '@eudiplo/sdk-core';
import type { FormlyFieldConfig, FormlyFormOptions } from '@ngx-formly/core';
import type { FormlyJsonschema } from '@ngx-formly/core/json-schema';
import { claimsForForm, schemaForForm } from './offer-request';

export type ClaimSourceKind = 'form' | 'attributeProvider';

/**
 * The part of an offer that belongs to one credential: the claims form formly builds from its
 * schema, where its claims come from, and the attribute provider an authorization code offer
 * resolves them with. Built once per credential and kept while it stays chosen, so formly gets
 * the same fields on every check.
 */
export interface ClaimForm {
  readonly id: string;
  readonly config: CredentialConfig;
  readonly fields: FormlyFieldConfig[];
  readonly form: FormGroup;
  readonly options: FormlyFormOptions;
  /** The claims as typed; a new object replaces them, as defaults or an import do. */
  readonly model: WritableSignal<Record<string, unknown>>;
  /** The claim values the credential configuration sets, to fill the form with. */
  readonly defaults?: Record<string, unknown>;
  /** The attribute provider the credential configuration names, if any. */
  readonly configuredProviderId?: string;
  readonly source: WritableSignal<ClaimSourceKind>;
  readonly provider: FormControl<string>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * A leaf without a display label gets the claim's name, so every input has a visible label and
 * an accessible name. Groups and lists get theirs from their field type.
 */
function labelLeaf(field: FormlyFieldConfig): FormlyFieldConfig {
  const leaf = !field.fieldGroup && !field.fieldArray;
  const key = Array.isArray(field.key) ? field.key.at(-1) : field.key;
  if (leaf && key != null && !field.props?.label) {
    field.props = { ...field.props, label: String(key) };
  }
  return field;
}

/**
 * The form of one credential. The attribute provider defaults to the one the credential names,
 * else to the only one there is; the external authorization server flow needs one.
 */
export function createClaimForm(
  config: CredentialConfig,
  jsonschema: FormlyJsonschema,
  providers: readonly AttributeProviderEntity[],
  providerRequired: boolean
): ClaimForm {
  const runtime = config.fields?.length
    ? deriveRuntimeArtifacts(config.fields as ClaimFieldDefinition[])
    : undefined;
  const schema = runtime?.schema
    ? schemaForForm(config, runtime.schema as Record<string, unknown>)
    : undefined;
  const root = schema
    ? jsonschema.toFieldConfig(schema as Parameters<FormlyJsonschema['toFieldConfig']>[0], {
        map: labelLeaf,
      })
    : undefined;
  const defaults = claimsForForm(config, runtime?.claims);
  const configuredProviderId = config.attributeProviderId || undefined;
  const providerId = configuredProviderId || (providers.length === 1 ? providers[0].id : '');
  return {
    id: config.id,
    config,
    fields: root ? [root] : [],
    form: new FormGroup({}),
    options: {},
    model: signal({}),
    defaults: isRecord(defaults) && Object.keys(defaults).length ? defaults : undefined,
    configuredProviderId,
    source: signal('form'),
    provider: new FormControl(providerId, {
      nonNullable: true,
      validators: providerRequired ? Validators.required : [],
    }),
  };
}
