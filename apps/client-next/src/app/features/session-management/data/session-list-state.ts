import type { Session, SessionControllerGetAllSessionsData } from '@eudiplo/sdk-core';

export type SessionQuery = NonNullable<SessionControllerGetAllSessionsData['query']>;
export type SessionStatus = Session['status'];
export type SessionType = NonNullable<SessionQuery['type']>;
export type SessionSortField = NonNullable<SessionQuery['sortBy']>;
export type UpdatedWithin = '15m' | '1h' | '24h' | '7d';
export type UpdatedFilter = '' | UpdatedWithin | 'custom';

export interface SessionListState {
  q: string;
  type: SessionType | '';
  status: SessionStatus[];
  config: string;
  createdFrom: string;
  createdTo: string;
  updated: UpdatedFilter;
  updatedFrom: string;
  updatedTo: string;
  failureCode: string;
  page: number;
  pageSize: number;
  sortBy: SessionSortField | '';
  sortOrder: 'asc' | 'desc' | '';
}

export interface SessionQueryParamsReader {
  get(name: string): string | null;
  getAll(name: string): string[];
}

export const DEFAULT_SESSION_PAGE_SIZE = 25;
export const SESSION_PAGE_SIZES = [10, 25, 50, 100] as const;

const STATUSES = new Set<SessionStatus>([
  'active',
  'fetched',
  'completed',
  'expired',
  'failed',
  'cancelled',
]);
const SORT_FIELDS = new Set<SessionSortField>([
  'id',
  'status',
  'createdAt',
  'updatedAt',
  'requestId',
]);
const UPDATED_WINDOWS: Record<UpdatedWithin, number> = {
  '15m': 15 * 60_000,
  '1h': 60 * 60_000,
  '24h': 24 * 60 * 60_000,
  '7d': 7 * 24 * 60 * 60_000,
};

function validDay(value: string | null): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  const date = new Date(`${value}T00:00:00`);
  const [year, month, day] = value.split('-').map(Number);
  return Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
    ? ''
    : value;
}

function validPage(value: string | null): number {
  const page = Number(value);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

function validPageSize(value: string | null): number {
  const size = Number(value);
  return SESSION_PAGE_SIZES.includes(size as (typeof SESSION_PAGE_SIZES)[number])
    ? size
    : DEFAULT_SESSION_PAGE_SIZE;
}

function validUpdated(value: string | null, hasCustomRange: boolean): UpdatedFilter {
  if (value && value in UPDATED_WINDOWS) return value as UpdatedWithin;
  return hasCustomRange ? 'custom' : '';
}

/** Restores filters, sort and pagination from a bookmark or the browser history. */
export function sessionListStateFromParams(params: SessionQueryParamsReader): SessionListState {
  const type = params.get('type');
  const createdFrom = validDay(params.get('createdFrom'));
  const createdTo = validDay(params.get('createdTo'));
  const updatedFrom = validDay(params.get('updatedFrom'));
  const updatedTo = validDay(params.get('updatedTo'));
  const sortBy = params.get('sortBy');
  const sortOrder = params.get('sortOrder');

  return {
    q: params.get('q') ?? '',
    type: type === 'issuance' || type === 'presentation' ? type : '',
    status: params
      .getAll('status')
      .filter((status): status is SessionStatus => STATUSES.has(status as SessionStatus)),
    config: params.get('credentialConfigurationId')
      ? `issuance:${params.get('credentialConfigurationId')}`
      : params.get('requestId')
        ? `presentation:${params.get('requestId')}`
        : '',
    createdFrom,
    createdTo,
    updated: validUpdated(params.get('updatedWithin'), !!(updatedFrom || updatedTo)),
    updatedFrom,
    updatedTo,
    failureCode: params.get('failureCode') ?? '',
    page: validPage(params.get('page')),
    pageSize: validPageSize(params.get('pageSize')),
    sortBy:
      sortBy && SORT_FIELDS.has(sortBy as SessionSortField) ? (sortBy as SessionSortField) : '',
    sortOrder: sortOrder === 'asc' || sortOrder === 'desc' ? sortOrder : '',
  };
}

function dayBoundary(day: string, endOfDay: boolean): string | undefined {
  if (!day) return undefined;
  const date = new Date(`${day}T${endOfDay ? '23:59:59.999' : '00:00:00'}`);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function configFilter(state: SessionListState): { kind: SessionType; id: string } | undefined {
  const [prefix, ...parts] = state.config.split(':');
  if (!state.config) return undefined;
  if (prefix === 'presentation' || prefix === 'issuance') {
    const id = parts.join(':');
    return id ? { kind: prefix, id } : undefined;
  }
  return {
    kind: state.type === 'presentation' ? 'presentation' : 'issuance',
    id: state.config,
  };
}

/** Builds the backend query while keeping day filters in local calendar time. */
export function sessionQueryFromState(state: SessionListState, now = new Date()): SessionQuery {
  const config = configFilter(state);
  const createdFrom = dayBoundary(state.createdFrom, false);
  const createdTo = dayBoundary(state.createdTo, true);
  let updatedFrom: string | undefined;
  let updatedTo: string | undefined;

  if (state.updated === 'custom') {
    updatedFrom = dayBoundary(state.updatedFrom, false);
    updatedTo = dayBoundary(state.updatedTo, true);
  } else if (state.updated) {
    updatedFrom = new Date(now.getTime() - UPDATED_WINDOWS[state.updated]).toISOString();
  }

  return {
    page: state.page,
    pageSize: state.pageSize,
    ...(state.type ? { type: state.type } : {}),
    ...(state.status.length ? { status: state.status } : {}),
    ...(state.q.trim() ? { q: state.q.trim() } : {}),
    ...(config?.id && config.kind === 'issuance'
      ? { credentialConfigurationId: config.id }
      : config?.id
        ? { requestId: config.id }
        : {}),
    ...(createdFrom ? { createdFrom } : {}),
    ...(createdTo ? { createdTo } : {}),
    ...(updatedFrom ? { updatedFrom } : {}),
    ...(updatedTo ? { updatedTo } : {}),
    ...(state.failureCode.trim() ? { failureCode: state.failureCode.trim() } : {}),
    ...(state.sortBy && state.sortOrder
      ? { sortBy: state.sortBy, sortOrder: state.sortOrder }
      : {}),
  };
}

/** URL representation of the state, omitting defaults so shared links stay readable. */
export function sessionListUrlParams(
  state: SessionListState
): Record<string, string | string[] | null> {
  const config = configFilter(state);
  const customUpdated = state.updated === 'custom';

  return {
    q: state.q.trim() || null,
    type: state.type || null,
    status: state.status.length ? state.status : null,
    credentialConfigurationId: config?.kind === 'issuance' ? config.id : null,
    requestId: config?.kind === 'presentation' ? config.id : null,
    createdFrom: state.createdFrom || null,
    createdTo: state.createdTo || null,
    updatedWithin: state.updated && !customUpdated ? state.updated : null,
    updatedFrom: customUpdated ? state.updatedFrom || null : null,
    updatedTo: customUpdated ? state.updatedTo || null : null,
    failureCode: state.failureCode.trim() || null,
    page: state.page > 1 ? String(state.page) : null,
    pageSize: state.pageSize !== DEFAULT_SESSION_PAGE_SIZE ? String(state.pageSize) : null,
    sortBy: state.sortBy || null,
    sortOrder: state.sortOrder || null,
  };
}
