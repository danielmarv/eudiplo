/** A build of the Web Client or the backend: its version and the git commit it was built from. */
export interface BuildInfo {
  version: string;
  revision?: string;
}

/**
 * - `match`: the same build, or releases that differ only in the patch version
 * - `mismatch`: the Web Client and the backend come from different builds
 * - `unknown`: not enough to decide, for example with a local development build
 */
export type BuildCompatibility = 'match' | 'mismatch' | 'unknown';

const SEMVER = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;

/** The version with the short commit, for example `10.0.0 (commit abcdef0)`. */
export function formatBuild(info: BuildInfo): string {
  return info.revision ? `${info.version} (commit ${info.revision.slice(0, 7)})` : info.version;
}

/**
 * Whether the Web Client can safely talk to the backend. Both images are built from the same
 * commit, so the git revision decides; released images that differ only in the patch version
 * are accepted as well. As in `apps/client/src/app/services/version.service.ts`.
 */
export function compareBuilds(client: BuildInfo, backend: BuildInfo): BuildCompatibility {
  if (client.revision && backend.revision && client.revision === backend.revision) {
    return 'match';
  }
  const clientSemver = SEMVER.exec(client.version);
  const backendSemver = SEMVER.exec(backend.version);
  if (
    clientSemver &&
    backendSemver &&
    !clientSemver[4] &&
    !backendSemver[4] &&
    clientSemver[1] === backendSemver[1] &&
    clientSemver[2] === backendSemver[2]
  ) {
    return 'match';
  }
  if ((client.revision && backend.revision) || (clientSemver && backendSemver)) {
    return 'mismatch';
  }
  return 'unknown';
}

/**
 * This Web Client's build, from `env.js`, which the container's entrypoint writes from the
 * image's VERSION and REVISION. A development server has none: then it is `dev`.
 */
export function clientBuild(): BuildInfo {
  const env = (globalThis as { env?: { version?: string; revision?: string } }).env;
  return { version: env?.version || 'dev', revision: env?.revision || undefined };
}
