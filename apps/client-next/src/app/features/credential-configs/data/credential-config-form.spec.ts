import type { CredentialConfigCreate } from '@eudiplo/sdk-core';
import { describe, expect, it } from 'vitest';
import { claimSchemaError, unsupportedConstraintsError } from './claim-schema-check';
import {
  createCredentialConfigForm,
  credentialConfigBody,
  fillCredentialConfigForm,
  flattenForForm,
  nestFields,
  parseDefault,
  parsePath,
} from './credential-config-form';
import { CREDENTIAL_TEMPLATES } from './templates';

const stored = {
  id: 'membership',
  description: 'Club membership',
  keyChainId: 'signing',
  lifeTime: 86400,
  keyBinding: true,
  statusManagement: true,
  revokeWithWalletUnit: false,
  vct: 'https://club.example/membership',
  config: {
    format: 'dc+sd-jwt',
    display: [{ name: 'Membership', locale: 'en-US', background_color: '#123456' }],
    proofTypesSupported: ['jwt'],
  },
  fields: [
    { path: ['name'], type: 'string', mandatory: true, disclosable: true },
    {
      path: ['address'],
      type: 'object',
      mandatory: false,
      disclosable: true,
      children: [
        {
          path: ['city'],
          type: 'string',
          mandatory: false,
          disclosable: true,
          defaultValue: 'Berlin',
        },
      ],
    },
  ],
  attributeProviderId: 'crm',
} as unknown as CredentialConfigCreate;

describe('credential type form', () => {
  it('fills the form from a stored credential type and builds the same body back', () => {
    const form = createCredentialConfigForm();
    fillCredentialConfigForm(form, stored);
    expect(form.controls.fields.length).toBe(3);
    expect(form.controls.fields.at(2).controls.path.value).toBe('address.city');
    expect(form.valid).toBe(true);

    const body = credentialConfigBody(form) as unknown as Record<string, unknown>;
    expect(body).toMatchObject({
      id: 'membership',
      description: 'Club membership',
      keyChainId: 'signing',
      lifeTime: 86400,
      vct: 'https://club.example/membership',
      sdJwtTrustFormat: 'x5c',
      attributeProviderId: 'crm',
      webhookEndpointId: null,
      iaeActions: null,
      embeddedDisclosurePolicy: null,
      config: {
        format: 'dc+sd-jwt',
        display: [{ name: 'Membership', locale: 'en-US', background_color: '#123456' }],
        proofTypesSupported: ['jwt'],
      },
    });
    expect(body['fields']).toEqual([
      { path: ['name'], type: 'string', mandatory: true, disclosable: true },
      {
        path: ['address'],
        type: 'object',
        mandatory: false,
        disclosable: true,
        children: [
          {
            path: ['city'],
            type: 'string',
            mandatory: false,
            disclosable: true,
            defaultValue: 'Berlin',
          },
        ],
      },
    ]);
  });

  it('locks revocation and key attestation on while revoking with the wallet unit', () => {
    const form = createCredentialConfigForm();
    fillCredentialConfigForm(form, {
      ...stored,
      revokeWithWalletUnit: true,
      statusManagement: false,
    });
    expect(form.controls.statusManagement.disabled).toBe(true);
    expect(form.controls.keyAttestation.getRawValue()).toBe(true);
    const body = credentialConfigBody(form) as unknown as Record<string, unknown>;
    expect(body['statusManagement']).toBe(true);
    expect((body['config'] as Record<string, unknown>)['keyAttestationsRequired']).toEqual({});
  });

  it('requires a vct URI for SD-JWT and a docType for mdoc', () => {
    const form = createCredentialConfigForm();
    form.controls.id.setValue('x');
    expect(form.controls.vctString.hasError('required')).toBe(true);
    form.controls.format.setValue('mso_mdoc');
    form.controls.vctString.updateValueAndValidity();
    form.controls.docType.updateValueAndValidity();
    expect(form.controls.vctString.valid).toBe(true);
    expect(form.controls.docType.hasError('required')).toBe(true);
  });

  it('parses paths and defaults by type', () => {
    expect(parsePath('address.*.city')).toEqual(['address', null, 'city']);
    expect(parsePath('list.0')).toEqual(['list', 0]);
    expect(parseDefault('42', 'integer')).toBe(42);
    expect(parseDefault(' ', 'string')).toBe(' ');
    expect(parseDefault('', 'boolean')).toBeUndefined();
    expect(() => parseDefault('4.2', 'integer')).toThrow('Enter a whole number, e.g. 42.');
  });

  it('nests array items under their array again', () => {
    const flat = flattenForForm([
      {
        path: ['nationalities'],
        type: 'array',
        mandatory: false,
        disclosable: true,
        children: [{ path: [], type: 'string', mandatory: false, disclosable: true }],
      } as never,
    ]);
    expect(flat.map((field) => field.path)).toEqual([['nationalities'], ['nationalities', null]]);
    expect(nestFields(flat)).toEqual([
      expect.objectContaining({
        path: ['nationalities'],
        children: [expect.objectContaining({ path: [null] })],
      }),
    ]);
  });

  it('loads every template into a valid form', () => {
    for (const template of CREDENTIAL_TEMPLATES) {
      const form = createCredentialConfigForm();
      fillCredentialConfigForm(form, structuredClone(template.config));
      expect(form.valid, template.name).toBe(true);
      expect(
        claimSchemaError(credentialConfigBody(form).fields ?? []),
        template.name
      ).toBeUndefined();
    }
  });

  it('names constraints the API refuses', () => {
    expect(unsupportedConstraintsError({ pattern: '^[A-Z]$' })).toBeUndefined();
    expect(unsupportedConstraintsError({ colour: 'red' })).toContain(
      'Not a supported JSON Schema keyword: colour'
    );
    expect(unsupportedConstraintsError([])).toContain('Enter a JSON object');
  });
});
