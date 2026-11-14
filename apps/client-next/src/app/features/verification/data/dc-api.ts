import type { DigitalCredentialResponse } from '@eudiplo/sdk-core';
import { decodeJwtPart } from '../../../shared/format/jwt';

/**
 * Asks a wallet on this device for the presentation through the Digital Credentials API, and
 * sends its answer to the verifier's response URI from the signed request. Resolves once the
 * verifier took the response; the session then says whether it was verified. Throws an error that
 * says what went wrong.
 */
export async function presentWithDcApi(requestObject: string): Promise<void> {
  const credential = (await navigator.credentials.get({
    mediation: 'required',
    digital: {
      requests: [{ protocol: 'openid4vp-v1-signed', data: { request: requestObject } }],
    },
  } as CredentialRequestOptions)) as DigitalCredentialResponse | null;
  if (!credential) throw new Error('The wallet did not answer.');
  if (credential.data?.error) {
    const { error, error_description } = credential.data;
    throw new Error(
      `The wallet refused: ${error}${error_description ? `: ${error_description}` : ''}`
    );
  }

  const responseUri = decodeJwtPart(requestObject, 'payload')['response_uri'];
  if (typeof responseUri !== 'string' || !responseUri) {
    throw new Error('The request names no response URI.');
  }
  const response = await fetch(responseUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...credential.data, sendResponse: true }),
  });
  if (!response.ok) throw new Error(await rejection(response));
}

/**
 * Why the verifier refused the response: a rejected presentation answers 400 with no message, or
 * with a redirect URI whose `error_description` says why.
 */
async function rejection(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as {
    redirect_uri?: unknown;
    message?: unknown;
  } | null;
  if (typeof body?.redirect_uri === 'string') {
    try {
      const description = new URL(body.redirect_uri, location.href).searchParams.get(
        'error_description'
      );
      if (description) return `The verifier rejected the presentation: ${description}`;
    } catch {
      // Not a URL: fall through to the message.
    }
  }
  if (typeof body?.message === 'string' && body.message) return body.message;
  return response.status === 400
    ? 'The verifier rejected the presentation; the result below says why.'
    : `The verifier did not take the response (HTTP ${response.status}).`;
}
