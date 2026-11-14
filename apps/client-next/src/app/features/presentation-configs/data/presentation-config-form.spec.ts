import { describe, expect, it } from 'vitest';
import {
  configBody,
  createConfigForm,
  fillConfigForm,
  parseOrigins,
  purposeGroup,
} from './presentation-config-form';

const query = { credentials: [{ id: 'pid', format: 'dc+sd-jwt' }] };

describe('presentation configuration form', () => {
  it('fills a copy with a distinct ID and preserves its optional settings', () => {
    const form = createConfigForm();
    fillConfigForm(
      form,
      {
        id: 'age-check',
        description: 'Verify age',
        lifeTime: 90,
        statusCheckMode: 'best_effort',
        redirectUri: 'https://shop.example/complete',
        allowedOrigins: ['https://shop.example'],
        accessKeyChainId: 'access',
        webhookEndpointId: 'events',
        registration_cert: {
          body: { purpose: [{ lang: 'en-US', content: 'Verify age' }] },
        },
        transaction_data: [{ type: 'payment', credential_ids: ['pid'] }],
        attached: [{ format: 'dc+sd-jwt', data: { jwt: 'value' }, credential_ids: ['pid'] }],
      },
      true
    );

    expect(form.getRawValue()).toMatchObject({
      id: 'age-check-copy',
      description: 'Verify age',
      lifeTime: 90,
      statusCheckMode: 'best_effort',
      redirectUri: 'https://shop.example/complete',
      allowedOrigins: 'https://shop.example',
      accessKeyChainId: 'access',
      webhookEndpointId: 'events',
      registrationMode: 'body',
      purposes: [{ lang: 'en-US', content: 'Verify age' }],
      transactionData: JSON.stringify([{ type: 'payment', credential_ids: ['pid'] }], null, 2),
      attached: JSON.stringify(
        [{ format: 'dc+sd-jwt', data: { jwt: 'value' }, credential_ids: ['pid'] }],
        null,
        2
      ),
    });
  });

  it('validates certificate sources and clears optional fields on edit', () => {
    const form = createConfigForm();
    form.patchValue({ id: 'age-check', registrationMode: 'jwt' });
    expect(form.controls.description.invalid).toBe(true);
    form.controls.description.setValue('Verify age');
    expect(form.controls.registrationJwt.invalid).toBe(true);
    form.controls.registrationJwt.setValue('eyJhbGciOiJFUzI1NiJ9.eyJpc3MiOiJ4In0.signature');
    expect(form.controls.registrationJwt.valid).toBe(true);

    form.patchValue({ registrationMode: 'body' });
    expect(form.controls.purposes.invalid).toBe(true);
    form.controls.purposes.push(purposeGroup('en-US', 'Verify age'));
    expect(form.controls.purposes.valid).toBe(true);

    form.patchValue({
      registrationMode: 'none',
      registrationJwt: '',
      allowedOrigins: '',
      accessKeyChainId: '',
      webhookEndpointId: '',
      redirectUri: '',
      transactionData: '',
      attached: '',
    });
    const body = configBody(form, query, true);
    expect(body).toMatchObject({
      registration_cert: null,
      allowedOrigins: null,
      accessKeyChainId: null,
      webhookEndpointId: null,
      redirectUri: null,
      transaction_data: null,
      attached: [],
    });
  });

  it('normalizes newline and comma-separated origins and validates their serialized form', () => {
    expect(parseOrigins('https://shop.example\n, http://localhost:4300')).toEqual([
      'https://shop.example',
      'http://localhost:4300',
    ]);

    const form = createConfigForm();
    form.controls.allowedOrigins.setValue('https://shop.example/path');
    expect(form.controls.allowedOrigins.errors?.['origins']).toBeTruthy();
    form.controls.allowedOrigins.setValue('https://shop.example');
    expect(form.controls.allowedOrigins.valid).toBe(true);
  });

  it('rejects non-string credential IDs in transaction data and attachments', () => {
    const form = createConfigForm();
    form.controls.transactionData.setValue(
      JSON.stringify([{ type: 'payment', credential_ids: [123] }])
    );
    form.controls.attached.setValue(
      JSON.stringify([{ format: 'dc+sd-jwt', data: {}, credential_ids: [123] }])
    );

    expect(form.controls.transactionData.errors?.['json']).toContain('string credential query IDs');
    expect(form.controls.attached.errors?.['json']).toContain('list of strings');
  });
});
