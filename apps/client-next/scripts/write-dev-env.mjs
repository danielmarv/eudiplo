// Writes .dev/env.js for `ng serve`: the runtime configuration that the container entrypoint
// writes in production, plus the client the local backend accepts, so the login page starts
// pre-filled with it. The client ID and secret come from AUTH_CLIENT_ID and AUTH_CLIENT_SECRET
// in the repository's .env, the file the backend reads. .dev/ is git-ignored and only the
// development build serves it (angular.json), so the secret is neither committed nor shipped.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const envFile = join(appDir, '..', '..', '.env');
const target = join(appDir, '.dev', 'env.js');

/** The values of `keys` in a dotenv file; other entries are not read. */
function readKeys(file, keys) {
  if (!existsSync(file)) return {};
  const found = {};
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim().replace(/^export\s+/, '');
    const separator = line.indexOf('=');
    if (!line || line.startsWith('#') || separator < 1) continue;
    const key = line.slice(0, separator).trim();
    if (!keys.includes(key)) continue;
    let value = line.slice(separator + 1).trim();
    const quote = value[0];
    if ((quote === '"' || quote === "'") && value.endsWith(quote) && value.length > 1) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, '');
    }
    found[key] = value;
  }
  return found;
}

const { AUTH_CLIENT_ID: clientId, AUTH_CLIENT_SECRET: clientSecret } = readKeys(envFile, [
  'AUTH_CLIENT_ID',
  'AUTH_CLIENT_SECRET',
]);
const values = clientId && clientSecret ? { clientId, clientSecret } : {};

mkdirSync(dirname(target), { recursive: true });
writeFileSync(
  target,
  '// Written by scripts/write-dev-env.mjs for the development server; do not commit.\n' +
    `globalThis.env = Object.assign(globalThis.env || {}, ${JSON.stringify(values)});\n`
);
console.warn(
  clientId && clientSecret
    ? 'Login pre-filled with AUTH_CLIENT_ID and AUTH_CLIENT_SECRET from the repository .env.'
    : 'No AUTH_CLIENT_ID and AUTH_CLIENT_SECRET in the repository .env; the login starts empty.'
);
