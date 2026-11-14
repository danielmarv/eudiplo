import { describe, expect, it } from 'vitest';
import {
  applyEndpointJson,
  createEndpointForm,
  endpointBody,
  fillEndpoint,
  idFromName,
  REDACTED_SECRET,
} from './endpoint-form';

const stored = {
  id: 'member-db',
  name: 'Member database',
  description: 'Members of Acme',
  url: 'https://backend.example/claims',
  auth: { type: 'apiKey', config: { headerName: 'X-Key', value: REDACTED_SECRET } },
};

describe('endpoint form', () => {
  it('takes a new endpoint without authentication, leaving out an empty description', () => {
    const form = createEndpointForm();
    form.patchValue({ id: ' member-db ', name: 'Member database', url: 'https://b.example/c' });

    expect(form.valid).toBe(true);
    expect(endpointBody(form, false)).toEqual({
      id: 'member-db',
      name: 'Member database',
      url: 'https://b.example/c',
      auth: { type: 'none' },
    });
  });

  it('asks for an http or https URL, and for the header and key of an API key', () => {
    const form = createEndpointForm();
    form.patchValue({ id: 'a', name: 'A', url: 'ftp://b.example' });
    expect(form.controls.url.hasError('url')).toBe(true);

    form.patchValue({ url: 'https://b.example', authType: 'apiKey', headerName: ' ' });
    expect(form.controls.headerName.hasError('required')).toBe(true);
    expect(form.controls.key.hasError('required')).toBe(true);
    form.patchValue({ authType: 'none' });
    expect(form.valid).toBe(true);
  });

  it('keeps a stored key while it is left empty, but only for the same URL', () => {
    const form = createEndpointForm();
    fillEndpoint(form, stored);

    expect(form.controls.key.value).toBe('');
    expect(form.valid).toBe(true);
    expect(endpointBody(form, true)).toEqual({
      name: 'Member database',
      description: 'Members of Acme',
      url: 'https://backend.example/claims',
      auth: { type: 'apiKey', config: { headerName: 'X-Key', value: REDACTED_SECRET } },
    });

    form.controls.url.setValue('https://other.example/claims');
    expect(form.controls.key.hasError('newUrl')).toBe(true);
    form.controls.key.setValue('new-key');
    expect(form.valid).toBe(true);
    expect(endpointBody(form, true).auth).toEqual({
      type: 'apiKey',
      config: { headerName: 'X-Key', value: 'new-key' },
    });
  });

  it('clears the description when editing with null', () => {
    const form = createEndpointForm();
    fillEndpoint(form, stored);
    form.controls.description.setValue('');

    expect(endpointBody(form, true).description).toBeNull();
  });

  it('takes JSON the user edited, keeping the ID and whether a key is stored', () => {
    const form = createEndpointForm();
    fillEndpoint(form, stored);

    applyEndpointJson(form, { ...stored, id: 'renamed', name: 'Members' }, true);
    expect(form.controls.id.value).toBe('member-db');
    expect(form.controls.name.value).toBe('Members');
    expect(form.valid).toBe(true);
    expect(() => applyEndpointJson(form, [1], true)).toThrow('Enter a JSON object.');
  });

  it('suggests an ID from a name', () => {
    expect(idFromName('Member DB (Europe)')).toBe('member-db-europe');
    expect(idFromName('  Café Ünion ')).toBe('cafe-union');
  });
});
