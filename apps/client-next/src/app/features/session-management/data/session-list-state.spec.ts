import { describe, expect, it } from 'vitest';
import {
  sessionListStateFromParams,
  sessionListUrlParams,
  sessionQueryFromState,
  type SessionListState,
} from './session-list-state';

const EMPTY_STATE: SessionListState = {
  q: '',
  type: '',
  status: [],
  config: '',
  createdFrom: '',
  createdTo: '',
  updated: '',
  updatedFrom: '',
  updatedTo: '',
  failureCode: '',
  page: 1,
  pageSize: 25,
  sortBy: '',
  sortOrder: '',
};

function params(entries: Record<string, string | string[]> = {}) {
  return {
    get: (name: string) => {
      const value = entries[name];
      return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
    },
    getAll: (name: string) => {
      const value = entries[name];
      return Array.isArray(value) ? value : value ? [value] : [];
    },
  };
}

describe('session list state', () => {
  it('restores valid repeated filters and ignores invalid status, sort, and page values', () => {
    expect(
      sessionListStateFromParams(
        params({
          status: ['active', 'failed', 'unknown'],
          page: '-2',
          pageSize: '999',
          sortBy: 'unknown',
          sortOrder: 'sideways',
        })
      )
    ).toEqual({ ...EMPTY_STATE, status: ['active', 'failed'] });
  });

  it('maps filters to the paginated API query and keeps local day boundaries', () => {
    const state: SessionListState = {
      ...EMPTY_STATE,
      q: '  alice  ',
      type: 'presentation',
      status: ['active', 'fetched'],
      config: 'presentation:travel',
      createdFrom: '2025-01-02',
      createdTo: '2025-01-03',
      updated: 'custom',
      updatedFrom: '2025-01-04',
      updatedTo: '2025-01-05',
      failureCode: ' trust_chain_not_trusted ',
      page: 3,
      pageSize: 50,
      sortBy: 'updatedAt',
      sortOrder: 'desc',
    };

    const query = sessionQueryFromState(state, new Date('2025-01-10T00:00:00Z'));
    expect(query).toMatchObject({
      q: 'alice',
      type: 'presentation',
      status: ['active', 'fetched'],
      requestId: 'travel',
      page: 3,
      pageSize: 50,
      failureCode: 'trust_chain_not_trusted',
      sortBy: 'updatedAt',
      sortOrder: 'desc',
    });
    expect(new Date(query.createdFrom!).getDate()).toBe(2);
    expect(new Date(query.createdTo!).getDate()).toBe(3);
    expect(new Date(query.updatedTo!).getDate()).toBe(5);
  });

  it('round-trips the bookmarkable state without default page parameters', () => {
    const state: SessionListState = {
      ...EMPTY_STATE,
      status: ['active', 'fetched'],
      config: 'issuance:employee',
      page: 2,
      pageSize: 50,
    };
    const url = sessionListUrlParams(state);
    expect(url).toMatchObject({
      status: ['active', 'fetched'],
      credentialConfigurationId: 'employee',
      page: '2',
      pageSize: '50',
    });
    expect(url['requestId']).toBeNull();
  });

  it('keeps a typed, unprefixed configuration ID in the query and bookmark', () => {
    const state: SessionListState = {
      ...EMPTY_STATE,
      type: 'presentation',
      config: 'travel-check',
    };
    expect(sessionQueryFromState(state).requestId).toBe('travel-check');
    expect(sessionListUrlParams(state)['requestId']).toBe('travel-check');
  });
});
