import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { NavGroups } from './nav-groups';

describe('NavGroups', () => {
  beforeEach(() => localStorage.clear());

  const create = () => {
    TestBed.resetTestingModule();
    return TestBed.inject(NavGroups);
  };

  it('starts with every group open', () => {
    expect(create().isClosed('Issuance')).toBe(false);
  });

  it('closes and opens a group, and remembers it in this browser', () => {
    const groups = create();

    groups.toggle('Issuance');
    expect(groups.isClosed('Issuance')).toBe(true);
    expect(create().isClosed('Issuance')).toBe(true);

    groups.toggle('Issuance');
    expect(groups.isClosed('Issuance')).toBe(false);
    expect(create().isClosed('Issuance')).toBe(false);
  });

  it('opens a closed group, as when the user opens one of its pages', () => {
    const groups = create();
    groups.toggle('Trust and keys');

    groups.open('Trust and keys');

    expect(groups.isClosed('Trust and keys')).toBe(false);
    expect(create().isClosed('Trust and keys')).toBe(false);
  });

  it('ignores a stored value it cannot read', () => {
    localStorage.setItem('eudiplo.nav.collapsed.v2', '{not json');
    expect(create().isClosed('Issuance')).toBe(false);
  });
});
