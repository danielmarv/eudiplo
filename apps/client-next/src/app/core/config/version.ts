import { appControllerGetVersion } from '@eudiplo/sdk-core';
import { queryOptions } from '@tanstack/angular-query-experimental';

/** The backend's version (`GET /api/version`); the shell also reads it to say the instance answers. */
export function versionQuery(instance: string | undefined) {
  return queryOptions({
    queryKey: ['version', instance] as const,
    queryFn: async () => (await appControllerGetVersion()).data,
    enabled: !!instance,
    staleTime: 5 * 60_000,
  });
}

/** "v1.4.0" for a release; a development build's version, such as "main", as it is. */
export function versionLabel(version: string | undefined): string | undefined {
  if (!version) return undefined;
  return /^\d/.test(version) ? `v${version}` : version;
}
