/** The parts of a compact JWS that can be read without its key. */
export type JwtPart = 'header' | 'payload';

/**
 * The header or payload of a compact JWS (`header.payload.signature`) as a JSON object, to show
 * what a token says. It does not check the signature, so never trust what it returns. Throws
 * an error that says what is wrong when the token is not a JWS or the part is not a JSON object.
 */
export function decodeJwtPart(jwt: string, part: JwtPart): Record<string, unknown> {
  const parts = jwt.trim().split('.');
  if (parts.length !== 3) throw new Error('This is not a JWT: it needs three dot-separated parts.');
  const encoded = parts[part === 'header' ? 0 : 1];
  let decoded: unknown;
  try {
    decoded = JSON.parse(base64UrlDecode(encoded));
  } catch {
    throw new Error(`The ${part} is not base64url-encoded JSON.`);
  }
  if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) {
    throw new Error(`The ${part} is not a JSON object.`);
  }
  return decoded as Record<string, unknown>;
}

function base64UrlDecode(value: string): string {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) throw new Error('Not base64url');
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '='));
  return new TextDecoder('utf-8', { fatal: true }).decode(
    Uint8Array.from(binary, (character) => character.charCodeAt(0))
  );
}
