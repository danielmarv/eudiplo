import type { CredentialConfig } from '@eudiplo/sdk-core';
import { describe, expect, it } from 'vitest';
import {
  pemToBase64Der,
  TEST_ROOT_CERTIFICATE_PEM,
} from '../../../shared/certificates/certificate-validator.testing';
import {
  createSchemaForm,
  existingSchemaOf,
  linkedConfigId,
  rootCertificateControl,
  schemaRequest,
} from './schema-form';

function filledForm() {
  const form = createSchemaForm();
  form.patchValue({
    name: ' Gym membership ',
    version: '1.0.0',
    rulebookURI: 'https://rules.example/gym.md',
    attestationLoS: 'iso_18045_basic',
    bindingType: 'key',
    credentialConfigIds: ['gym-card', 'gym-mdoc'],
  });
  return form;
}

describe('schema form', () => {
  it('needs a trusted authority: a trust list or a root certificate', () => {
    const form = filledForm();
    expect(form.hasError('trustedAuthority')).toBe(true);

    form.controls.rootCertificates.push(rootCertificateControl('not a certificate'));
    expect(form.hasError('trustedAuthority')).toBe(false);
    expect(form.controls.rootCertificates.at(0).hasError('certificate')).toBe(true);
  });

  it('sends each credential type by ID and root certificates as base64 DER', () => {
    const form = filledForm();
    form.controls.trustListIds.setValue(['tl-1']);
    form.controls.rootCertificates.push(rootCertificateControl(TEST_ROOT_CERTIFICATE_PEM));
    form.controls.tags.setValue(['membership']);

    expect(form.valid).toBe(true);
    expect(schemaRequest(form)).toEqual({
      name: 'Gym membership',
      version: '1.0.0',
      rulebookURI: 'https://rules.example/gym.md',
      attestationLoS: 'iso_18045_basic',
      bindingType: 'key',
      tags: ['membership'],
      schemaURIs: [{ credentialConfigId: 'gym-card' }, { credentialConfigId: 'gym-mdoc' }],
      trustedAuthorities: [
        { trustListId: 'tl-1' },
        { frameworkType: 'x509', value: pemToBase64Der(TEST_ROOT_CERTIFICATE_PEM) },
      ],
    });
  });

  it('links the credential type it was opened for, else the only one selected', () => {
    const form = filledForm();
    expect(linkedConfigId(form, undefined)).toBeUndefined();
    expect(linkedConfigId(form, 'pid')).toBe('pid');
    form.controls.credentialConfigIds.setValue(['gym-card']);
    expect(linkedConfigId(form, undefined)).toBe('gym-card');
  });

  it('finds the schema a credential type is linked to already', () => {
    const configs = [
      { id: 'gym-card', schemaMeta: { id: 'https://catalog.example/attestations/gym/' } },
      { id: 'pid' },
    ] as unknown as CredentialConfig[];
    expect(existingSchemaOf('gym-card', configs)).toMatchObject({
      schemaId: 'https://catalog.example/attestations/gym/',
      routeId: 'gym',
    });
    expect(existingSchemaOf('pid', configs)).toBeNull();
    expect(existingSchemaOf(undefined, configs)).toBeNull();
  });
});
