import type { GrafanaConfigDto } from '@eudiplo/sdk-core';

/**
 * Links into Grafana Explore for a session, when the backend names a Grafana instance
 * (`GET /api/frontend-config`, `grafana.url`). Null without one.
 */

function explore(config: GrafanaConfigDto, pane: Record<string, unknown>): string {
  return `${config.url}/explore?schemaVersion=1&panes=${encodeURIComponent(JSON.stringify({ x: pane }))}`;
}

/** The backend's logs that mention the session, in Loki, from its creation. */
export function sessionLogsUrl(
  config: GrafanaConfigDto | undefined,
  sessionId: string,
  from?: string
): string | null {
  if (!config?.url) return null;
  return explore(config, {
    datasource: config.lokiUid,
    queries: [{ refId: 'A', expr: `{service_name="eudiplo-backend"} |= "${sessionId}"` }],
    range: { from: from ? String(new Date(from).getTime()) : 'now-1h', to: 'now' },
  });
}

/** The traces of the session, in Tempo. */
export function sessionTracesUrl(
  config: GrafanaConfigDto | undefined,
  sessionId: string
): string | null {
  if (!config?.url) return null;
  return explore(config, {
    datasource: config.tempoUid,
    queries: [{ refId: 'A', queryType: 'traceql', query: `{span.session.id="${sessionId}"}` }],
    range: { from: 'now-1h', to: 'now' },
  });
}

/** One trace, by its ID, in Tempo. */
export function traceUrl(config: GrafanaConfigDto | undefined, traceId: string): string | null {
  if (!config?.url) return null;
  return explore(config, {
    datasource: config.tempoUid,
    queries: [{ refId: 'A', queryType: 'traceql', query: traceId }],
    range: { from: 'now-1h', to: 'now' },
  });
}
