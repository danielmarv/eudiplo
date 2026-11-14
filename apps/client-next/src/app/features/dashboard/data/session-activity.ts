import {
  sessionControllerGetSessionStats,
  type SessionRetentionDto,
  type SessionStatusCountsDto,
  type SessionTypeStatsDto,
} from '@eudiplo/sdk-core';
import { keepPreviousData, queryOptions } from '@tanstack/angular-query-experimental';

/** The periods the activity charts can cover; the first is the default. */
export type ActivityRange = '24h' | '7d' | '30d';

export const ACTIVITY_RANGES: readonly {
  readonly value: ActivityRange;
  readonly label: string;
  readonly seconds: number;
}[] = [
  { value: '24h', label: '24 hours', seconds: 86_400 },
  { value: '7d', label: '7 days', seconds: 7 * 86_400 },
  { value: '30d', label: '30 days', seconds: 30 * 86_400 },
];

export type SessionKind = 'issuance' | 'presentation';

/** One bar of the chart: the sessions created in an hour or a day, counted by kind. */
export interface ActivityBucket {
  readonly start: Date;
  /** The last instant of the bucket: the backend's bounds are inclusive. */
  readonly end: Date;
  readonly issuance?: SessionTypeStatsDto;
  readonly presentation?: SessionTypeStatsDto;
}

export interface SessionActivity {
  readonly range: ActivityRange;
  readonly buckets: readonly ActivityBucket[];
  readonly retention?: SessionRetentionDto;
}

const HOUR = 3_600_000;

/**
 * The buckets of `range`, oldest first, on local boundaries: the 24 hours up to the current
 * one, or the days up to today. The last bucket runs until `now`. A bucket ends a millisecond
 * before the next starts, as the backend counts both bounds.
 */
export function bucketsOf(range: ActivityRange, now = new Date()): { start: Date; end: Date }[] {
  const starts: Date[] = [];
  if (range === '24h') {
    const hour = new Date(now);
    hour.setMinutes(0, 0, 0);
    for (let back = 23; back >= 0; back--) starts.push(new Date(hour.getTime() - back * HOUR));
  } else {
    const days = range === '7d' ? 7 : 30;
    for (let back = days - 1; back >= 0; back--) {
      const day = new Date(now);
      day.setHours(0, 0, 0, 0);
      day.setDate(day.getDate() - back);
      starts.push(day);
    }
  }
  return starts.map((start, index) => ({
    start,
    end: index + 1 < starts.length ? new Date(starts[index + 1].getTime() - 1) : now,
  }));
}

/**
 * The sessions of the tenant over `range`, a bar per hour or day. The backend counts sessions
 * per period (`GET /api/session/stats`), not per bucket, so each bucket is one request; they run
 * at once, every five minutes while the page shows. A new range keeps the previous chart until
 * its own data has come.
 */
export function sessionActivityQuery(
  instance: string | undefined,
  tenant: string | null | undefined,
  range: ActivityRange,
  enabled: boolean
) {
  return queryOptions({
    queryKey: ['session-activity', instance, tenant, range] as const,
    queryFn: async (): Promise<SessionActivity> => {
      const buckets = bucketsOf(range);
      const stats = await Promise.all(
        buckets.map(
          async (bucket) =>
            (
              await sessionControllerGetSessionStats({
                query: {
                  createdFrom: bucket.start.toISOString(),
                  createdTo: bucket.end.toISOString(),
                },
              })
            ).data
        )
      );
      return {
        range,
        retention: stats.at(-1)?.retention,
        buckets: buckets.map((bucket, index) => ({
          ...bucket,
          issuance: stats[index].issuance,
          presentation: stats[index].presentation,
        })),
      };
    },
    enabled: !!instance && enabled,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    placeholderData: keepPreviousData,
  });
}

const NO_COUNTS: SessionStatusCountsDto = {
  active: 0,
  fetched: 0,
  completed: 0,
  expired: 0,
  failed: 0,
  cancelled: 0,
};

/** All sessions of one kind over the buckets, with their failure codes, largest first. */
export interface KindTotals {
  readonly total: number;
  readonly byStatus: SessionStatusCountsDto;
  readonly failureCodes: readonly { code: string; count: number }[];
  readonly lastCompletedAt: string | null;
}

/** Adds up the buckets of one kind; undefined when the caller cannot read that kind. */
export function totalsOf(
  buckets: readonly ActivityBucket[],
  kind: SessionKind
): KindTotals | undefined {
  const stats = buckets.map((bucket) => bucket[kind]).filter((entry) => entry !== undefined);
  if (!stats.length) return undefined;
  const byStatus = { ...NO_COUNTS };
  const codes = new Map<string, number>();
  let lastCompletedAt: string | null = null;
  for (const entry of stats) {
    for (const key of Object.keys(byStatus) as (keyof SessionStatusCountsDto)[]) {
      byStatus[key] += entry.byStatus[key] ?? 0;
    }
    for (const { code, count } of entry.failureCodes) {
      codes.set(code, (codes.get(code) ?? 0) + count);
    }
    if (entry.lastCompletedAt && (!lastCompletedAt || entry.lastCompletedAt > lastCompletedAt)) {
      lastCompletedAt = entry.lastCompletedAt;
    }
  }
  return {
    total: stats.reduce((sum, entry) => sum + entry.total, 0),
    byStatus,
    failureCodes: [...codes]
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code)),
    lastCompletedAt,
  };
}

/**
 * The ranges that still have data. With the cleanup mode `full` the backend deletes a session
 * `ttlSeconds` after it started, so a longer range would show days without sessions that were
 * only deleted. The shortest range always stays.
 */
export function rangeHasHistory(range: ActivityRange, retention?: SessionRetentionDto): boolean {
  if (range === ACTIVITY_RANGES[0].value || retention?.cleanupMode !== 'full') return true;
  const seconds = ACTIVITY_RANGES.find((entry) => entry.value === range)!.seconds;
  return retention.ttlSeconds >= seconds;
}
