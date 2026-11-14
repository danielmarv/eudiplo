import {
  buildSimpleDcql,
  type ClaimQuery,
  dcqlReferenceError,
  readSimpleDcql,
  type SimpleCredentialQuery,
  type SimpleDcql,
  simpleDcqlError,
} from './simple-dcql';
import { dcqlSchemaError } from './dcql-validation';

/**
 * A DCQL query being edited: in the visual builder while it holds only what the builder shows,
 * else as JSON. Switching keeps the query; a query the builder cannot show stays in JSON.
 */
export interface DcqlDraft {
  mode: 'visual' | 'json';
  simple: SimpleDcql;
  json: string;
}

/** Whether every claim path can be typed as text: names without dots, and array indexes. */
function pathsAreText(query: SimpleDcql): boolean {
  return query.credentials.every((credential) =>
    credential.claims.every((claim) =>
      claim.path.every(
        (part) => typeof part === 'number' || (!part.includes('.') && !/^\d+$/.test(part))
      )
    )
  );
}

export function emptyCredential(index: number): SimpleCredentialQuery {
  return {
    id: index ? `credential_${index + 1}` : 'credential',
    format: 'dc+sd-jwt',
    type: '',
    claims: [],
  };
}

/** A draft of `query`, in the builder when it can show it. An empty query starts with one credential. */
export function draftOf(query: unknown): DcqlDraft {
  const empty = query === undefined || query === null || query === '';
  if (empty) return { mode: 'visual', simple: { credentials: [emptyCredential(0)] }, json: '' };
  const json = typeof query === 'string' ? query : JSON.stringify(query, null, 2);
  const simple = readSimpleDcql(query);
  return simple && pathsAreText(simple)
    ? { mode: 'visual', simple, json }
    : { mode: 'json', simple: { credentials: [] }, json };
}

/** The draft as JSON, or why it cannot become one. */
export function draftQuery(draft: DcqlDraft): { query?: object; error?: string } {
  if (draft.mode === 'visual') {
    const error = simpleDcqlError(draft.simple);
    if (error) return { error };
    const query = buildSimpleDcql(draft.simple);
    const schemaError = dcqlSchemaError(query);
    return schemaError ? { error: `DCQL schema error at ${schemaError}` } : { query };
  }
  if (!draft.json.trim()) return { error: 'Enter the DCQL query.' };
  let query: unknown;
  try {
    query = JSON.parse(draft.json);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const position = jsonErrorPosition(message, draft.json);
    if (position !== null) {
      const prefix = draft.json.slice(0, position);
      const line = prefix.split('\n').length;
      const column = prefix.length - prefix.lastIndexOf('\n');
      return { error: `Invalid JSON at line ${line}, column ${column}: ${message}` };
    }
    return { error: `Invalid JSON: ${message}` };
  }
  if (!query || typeof query !== 'object' || Array.isArray(query)) {
    return { error: 'The DCQL query is not a JSON object.' };
  }
  const credentials = (query as { credentials?: unknown }).credentials;
  if (!Array.isArray(credentials) || !credentials.length) {
    return { error: 'The DCQL query needs "credentials", a list of at least one credential.' };
  }
  const schemaError = dcqlSchemaError(query);
  if (schemaError) return { error: `DCQL schema error at ${schemaError}` };
  const error = dcqlReferenceError(query);
  return error ? { error } : { query };
}

function jsonErrorPosition(message: string, source: string): number | null {
  const position = /position\s+(\d+)/i.exec(message);
  if (position) return Number(position[1]);
  if (/end of JSON input/i.test(message)) return source.length;
  const excerpt = /, \.\.\.(.*) is not valid JSON$/s.exec(message)?.[1];
  const token = /Unexpected token ['"](.+?)['"]/s.exec(message)?.[1];
  if (!excerpt || !token) return null;
  const decodedExcerpt = excerpt
    .replace(/\\(["\\/])/g, '$1')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t');
  const offset = decodedExcerpt.lastIndexOf(token);
  if (offset < 0) return null;
  const suffix = decodedExcerpt.slice(offset + token.length).replace(/["']$/, '');
  let start = source.lastIndexOf(token);
  while (start >= 0) {
    if (source.slice(start + token.length).startsWith(suffix)) return start;
    start = source.lastIndexOf(token, start - 1);
  }
  return null;
}

/** Switches the draft to `mode`; returns why not when the query does not fit the builder. */
export function switchDraft(draft: DcqlDraft, mode: DcqlDraft['mode']): DcqlDraft | string {
  if (mode === draft.mode) return draft;
  if (mode === 'json') {
    return { ...draft, mode, json: JSON.stringify(buildSimpleDcql(draft.simple), null, 2) };
  }
  const next = draftOf(draft.json);
  return next.mode === 'visual'
    ? next
    : 'The builder cannot show this query: it uses options such as claim sets, wildcards or other metadata. Keep editing it as JSON.';
}

/** A claim path as typed: `address.locality`, `nationalities.0`. */
export function pathText(claim: ClaimQuery): string {
  return claim.path.map(String).join('.');
}

/** A typed claim path: names separated by dots, a number picks an array item. */
export function parsePath(text: string): (string | number)[] {
  return text
    .split('.')
    .map((part) => part.trim())
    .map((part) => (/^\d+$/.test(part) ? Number(part) : part));
}
