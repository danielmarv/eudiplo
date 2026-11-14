import { describe, expect, it } from 'vitest';
import { draftOf, draftQuery, switchDraft } from './dcql-draft';

describe('DCQL draft', () => {
  it('keeps unsupported query fields in JSON and reports schema locations', () => {
    const invalid = draftOf({
      credentials: [{ id: 'pid', format: 'unsupported', meta: {} }],
    });

    expect(invalid.mode).toBe('json');
    expect(draftQuery(invalid).error).toContain('/credentials/0');
  });

  it('validates and preserves advanced DCQL fields', () => {
    const draft = draftOf({
      credentials: [
        {
          id: 'pid',
          format: 'dc+sd-jwt',
          meta: { vct_values: ['urn:example:pid'] },
          claims: [{ id: 'name', path: ['name'] }],
          claim_sets: [['name']],
        },
      ],
      credential_sets: [{ options: [['pid']] }],
    });

    expect(draft.mode).toBe('json');
    expect(draftQuery(draft).query).toEqual({
      credentials: [
        {
          id: 'pid',
          format: 'dc+sd-jwt',
          meta: { vct_values: ['urn:example:pid'] },
          claims: [{ id: 'name', path: ['name'] }],
          claim_sets: [['name']],
        },
      ],
      credential_sets: [{ options: [['pid']] }],
    });
  });

  it('does not switch unsupported queries to the visual builder', () => {
    const draft = draftOf({
      credentials: [
        {
          id: 'pid',
          format: 'dc+sd-jwt',
          meta: { vct_values: ['urn:example:pid'] },
          claims: [{ id: 'name', path: ['name'] }],
          claim_sets: [['name']],
        },
      ],
    });

    expect(draft.mode).toBe('json');
    expect(switchDraft(draft, 'visual')).toContain('cannot show this query');
    expect(draftQuery(draft).query).toBeTruthy();
  });

  it('reports the line and column of malformed JSON', () => {
    const draft = draftOf('{\n  "credentials": ]\n}');

    expect(draftQuery(draft).error).toContain('line 2, column 18');
  });
});
