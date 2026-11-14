/** How an endpoint authenticates: "API key in X-API-Key", or "None". */
export function authLabel(endpoint: { auth?: unknown }): string {
  const auth = endpoint.auth as { type?: string; config?: { headerName?: string } } | undefined;
  if (auth?.type !== 'apiKey') return 'None';
  return auth.config?.headerName ? `API key in ${auth.config.headerName}` : 'API key';
}

/** The URL's host, to tell endpoints apart at a glance; the URL itself when it has none. */
export function hostOf(url: string): string {
  try {
    return new URL(url).host || url;
  } catch {
    return url;
  }
}
