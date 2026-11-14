import { describe, expect, it } from 'vitest';
import { ROLE_DESCRIPTIONS, ROLE_GROUPS, ROLE_ORDER } from './role-descriptions';
import { roles } from './role-grants';

describe('ROLE_GROUPS', () => {
  it('puts every role in exactly one group', () => {
    expect([...ROLE_ORDER].sort()).toEqual([...roles].sort());
    expect(new Set(ROLE_ORDER).size).toBe(ROLE_ORDER.length);
  });

  it('describes every role it groups', () => {
    for (const group of ROLE_GROUPS) {
      for (const role of group.roles) expect(ROLE_DESCRIPTIONS[role]).toBeTruthy();
    }
  });
});
