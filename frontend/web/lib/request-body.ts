/**
 * A request body read within a byte limit, for the three routes that parse what a visitor posts: the sign-in, the check and contact.
 *
 * **Why a limit at all.** `request.json()` and `request.formData()` read the whole body, however large, before parsing a byte of
 * it, so a public route that calls them directly holds whatever a client chooses to send. Each route now reads its body here first,
 * within a limit far above anything its own form sends, and answers a body over it with 413 before any parser runs.
 *
 * **Why a declared length is believed only when it refuses.** `Content-Length` is written by the client. One that declares more than
 * the limit is refused at once and the stream is never read, because reading it would be accepting what the client has said is too
 * much. One that declares the limit or less settles nothing: the bytes that actually stream are counted, so a client that declares
 * less than it sends is stopped at the limit all the same. A value that is not a plain run of digits is no declaration at all, and
 * the stream is counted.
 *
 * **Why the reader is cancelled, not drained.** Reading stops at the first chunk that takes the count past the limit, and the
 * reader is cancelled, so a body too large costs at most the limit and one chunk, whatever the client would have gone on sending.
 *
 * **Why the routes parse a new request over the bytes.** Each route keeps the parser it had (`request.json()`, or `formData()` for
 * the sign-in), so a body within the limit is answered exactly as before. `withBoundedBody` gives them the request again, carrying
 * only the bytes that were read, under the original URL, method and `Content-Type` (where a multipart boundary lives) and no other
 * header, so nothing the original declared about its length travels with the copy.
 *
 * **Why the limits live here.** A route file may export nothing but its handlers and segment config, so a limit declared in one
 * could not be read by a test. Sign-in is 4 KiB, where a passphrase form is a few hundred bytes. The check is 8 KiB, for thirteen
 * short answers. Contact is 32 KiB: a 5,000-character message at up to four bytes per UTF-8 character, and the other fields.
 *
 * **Why nothing is imported.** The module is handed a standard `Request` and returns values, so it carries no Next import and is
 * tested with plain requests whose streams record every pull.
 */

/** `POST /api/pilot-access`. */
export const PILOT_ACCESS_BODY_LIMIT = 4096;
/** `POST /api/check`. */
export const CHECK_BODY_LIMIT = 8192;
/** `POST /api/contact`. */
export const CONTACT_BODY_LIMIT = 32768;

export type BoundedBody = { ok: true; bytes: Uint8Array<ArrayBuffer> } | { ok: false; reason: 'too_large' };

/** The length a request declares, or null when its `Content-Length` is absent or is not a plain non-negative integer. */
function declaredLength(request: Request): number | null {
  const value = request.headers.get('content-length');
  return value !== null && /^\d+$/.test(value) ? Number(value) : null;
}

/**
 * The body of `request`, when it is `limitBytes` bytes or fewer. A body declared longer is refused without being read; any other is
 * read a chunk at a time and refused, with the reader cancelled, as soon as the bytes read pass the limit. No body gives no bytes.
 */
export async function readBodyWithin(request: Request, limitBytes: number): Promise<BoundedBody> {
  const declared = declaredLength(request);
  if (declared !== null && declared > limitBytes) return { ok: false, reason: 'too_large' };
  if (request.body === null) return { ok: true, bytes: new Uint8Array(0) };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limitBytes) {
      await reader.cancel();
      return { ok: false, reason: 'too_large' };
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, bytes };
}

/** `request` again, carrying `bytes` as its body, with its URL, method and `Content-Type` and no other header. */
export function withBoundedBody(request: Request, bytes: Uint8Array<ArrayBuffer>): Request {
  const headers = new Headers();
  const contentType = request.headers.get('content-type');
  if (contentType !== null) headers.set('content-type', contentType);
  return new Request(request.url, { method: request.method, headers, body: bytes });
}
