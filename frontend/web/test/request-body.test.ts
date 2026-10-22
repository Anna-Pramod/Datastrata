/**
 * The bounded body reader — what it is held to.
 *
 * Pilot readiness B4 (2026-10-22). Before this, every public route parsed its body with `request.json()` or `request.formData()`,
 * which read whatever arrives, however large, before parsing a byte of it. `readBodyWithin` is the one place a body is now read,
 * and each route answers 413 when it refuses, so a defect here reopens all three routes at once while their own tests, which post
 * ordinary bodies, stay green.
 *
 * Its two refusals are told apart by what the stream saw, not only by the answer. A body that declares too much and a body that
 * streams too much are both answered `too_large`, so an outcome alone cannot say whether the declared length was believed or the
 * whole body was read first and measured afterwards. The bodies here are streams that hand out one chunk only when asked
 * (`highWaterMark: 0`, so nothing is pulled before a read) and write down every pull and every cancellation. "Never pulled" is
 * then paired with the same stream pulled once the declared length is within the limit, and "cancelled after three pulls" with a
 * count the arithmetic of the chunks fixes, so neither is satisfied by a stream that could not be read at all (evidence standard,
 * failure mode 7).
 *
 * The boundary is held on both paths and in bytes: exactly the limit is allowed and one byte more is refused, declared or not, and
 * a limit counted in characters is caught by a body of two-byte characters. Expected values are literals.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CHECK_BODY_LIMIT,
  CONTACT_BODY_LIMIT,
  PILOT_ACCESS_BODY_LIMIT,
  readBodyWithin,
  withBoundedBody,
} from '@/lib/request-body';

const URL_ = 'http://127.0.0.1:3000/api/example';
const LIMIT = 16;
const TOO_LARGE = { ok: false, reason: 'too_large' } as const;

const encode = (text: string) => new TextEncoder().encode(text);

/**
 * A body that hands out `text` in chunks of `chunkBytes`, one per pull, with every pull and every cancellation written down. The
 * high-water mark of zero means the stream is pulled only when a reader asks, so a pull count of zero means no read was attempted.
 */
function recordedBody(text: string, chunkBytes: number) {
  const bytes = encode(text);
  const record = { pulls: 0, cancelled: 0 };
  let offset = 0;
  const stream = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        record.pulls += 1;
        if (offset >= bytes.byteLength) {
          controller.close();
          return;
        }
        controller.enqueue(bytes.slice(offset, offset + chunkBytes));
        offset += chunkBytes;
      },
      cancel() {
        record.cancelled += 1;
      },
    },
    { highWaterMark: 0 },
  );
  return { stream, record };
}

/** A POST carrying `body`, with `headers`; a stream body needs `duplex`, which the DOM's `RequestInit` does not yet name. */
function post(body: BodyInit | null, headers: Record<string, string> = {}): Request {
  const init: RequestInit & { duplex: 'half' } = { method: 'POST', body, headers, duplex: 'half' };
  return new Request(URL_, init);
}

describe('readBodyWithin', () => {
  it.each(['17', '4097', '99999999999999999999'])(
    'refuses a body that declares %s bytes against a limit of 16 without pulling its stream once',
    async (declared) => {
      const { stream, record } = recordedBody('x'.repeat(17), 4);
      await expect(readBodyWithin(post(stream, { 'content-length': declared }), LIMIT)).resolves.toStrictEqual(TOO_LARGE);
      expect(record.pulls).toBe(0);
      expect(record.cancelled).toBe(0);
    },
  );

  it('pulls the same kind of stream when its declared length is within the limit, which is what makes "never pulled" above mean something', async () => {
    const { stream, record } = recordedBody('x'.repeat(16), 4);
    await expect(readBodyWithin(post(stream, { 'content-length': '16' }), LIMIT)).resolves.toStrictEqual({ ok: true, bytes: encode('x'.repeat(16)) });
    // Four chunks of four, and the fifth pull finds the end.
    expect(record.pulls).toBe(5);
    expect(record.cancelled).toBe(0);
  });

  it('cancels a stream that declares no length as soon as the count passes the limit, and asks for nothing more', async () => {
    const { stream, record } = recordedBody('x'.repeat(80), 8);
    await expect(readBodyWithin(post(stream), LIMIT)).resolves.toStrictEqual(TOO_LARGE);
    // 8, 16, then 24: the third chunk passes the limit, so three pulls and one cancellation, and seven chunks were never asked for.
    expect(record.pulls).toBe(3);
    expect(record.cancelled).toBe(1);
  });

  it('is not defeated by a declared length smaller than the body: the count of what streams refuses it, and cancels the rest', async () => {
    const { stream, record } = recordedBody('x'.repeat(80), 8);
    await expect(readBodyWithin(post(stream, { 'content-length': '10' }), LIMIT)).resolves.toStrictEqual(TOO_LARGE);
    expect(record.pulls).toBe(3);
    expect(record.cancelled).toBe(1);
  });

  it('allows exactly the limit and refuses one byte more, whether the length is declared or only streamed', async () => {
    const at = 'x'.repeat(16);
    const over = 'x'.repeat(17);
    await expect(readBodyWithin(post(at, { 'content-length': '16' }), LIMIT)).resolves.toStrictEqual({ ok: true, bytes: encode(at) });
    await expect(readBodyWithin(post(at), LIMIT)).resolves.toStrictEqual({ ok: true, bytes: encode(at) });
    await expect(readBodyWithin(post(over, { 'content-length': '17' }), LIMIT)).resolves.toStrictEqual(TOO_LARGE);
    await expect(readBodyWithin(post(over), LIMIT)).resolves.toStrictEqual(TOO_LARGE);
  });

  it('counts bytes, not characters: eight two-byte characters are allowed at 16 and nine are refused', async () => {
    const eight = 'é'.repeat(8);
    const nine = 'é'.repeat(9);
    expect(encode(eight).byteLength).toBe(16);
    await expect(readBodyWithin(post(eight), LIMIT)).resolves.toStrictEqual({ ok: true, bytes: encode(eight) });
    await expect(readBodyWithin(post(nine), LIMIT)).resolves.toStrictEqual(TOO_LARGE);
  });

  it('gives empty bytes for a request with no body, even under a limit of zero', async () => {
    const empty = { ok: true, bytes: new Uint8Array(0) };
    await expect(readBodyWithin(new Request(URL_, { method: 'POST' }), LIMIT)).resolves.toStrictEqual(empty);
    await expect(readBodyWithin(new Request(URL_, { method: 'POST' }), 0)).resolves.toStrictEqual(empty);
  });

  it('returns the bytes exactly as sent, across chunk boundaries that split a character', async () => {
    const text = 'passphrase=caf%C3%A9&note=ü€';
    const { stream } = recordedBody(text, 3);
    await expect(readBodyWithin(post(stream), 64)).resolves.toStrictEqual({ ok: true, bytes: encode(text) });
  });

  it.each(['seventeen', '-17', '17 bytes', '1e3', '0x20'])(
    'takes a Content-Length of %j, which is not a plain non-negative integer, as no declaration: the stream is counted instead',
    async (declared) => {
      const within = recordedBody('x'.repeat(16), 8);
      await expect(readBodyWithin(post(within.stream, { 'content-length': declared }), LIMIT)).resolves.toStrictEqual({ ok: true, bytes: encode('x'.repeat(16)) });
      const over = recordedBody('x'.repeat(80), 8);
      await expect(readBodyWithin(post(over.stream, { 'content-length': declared }), LIMIT)).resolves.toStrictEqual(TOO_LARGE);
      expect(over.record.cancelled).toBe(1);
    },
  );
});

describe('withBoundedBody', () => {
  it('carries the bytes under the original URL, method and Content-Type, and no other header', async () => {
    const original = new Request(`${URL_}?q=1`, {
      method: 'POST',
      body: 'a=1',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'text/html', 'content-length': '3', cookie: 'c=1' },
    });
    const copy = withBoundedBody(original, encode('a=2'));
    expect(copy.url).toBe(`${URL_}?q=1`);
    expect(copy.method).toBe('POST');
    expect([...copy.headers.entries()]).toEqual([['content-type', 'application/x-www-form-urlencoded']]);
    expect(await copy.text()).toBe('a=2');
  });

  it('sends no Content-Type when the original declared none', async () => {
    const copy = withBoundedBody(new Request(URL_, { method: 'POST', body: encode('{}') }), encode('{}'));
    expect([...copy.headers.entries()]).toEqual([]);
  });

  it('lets each existing parser read the bounded bytes as it would have read the original: url-encoded, multipart with its boundary, and JSON', async () => {
    const multipart = new FormData();
    multipart.set('passphrase', 'from a multipart form');
    const originals: [string, () => Request, (request: Request) => Promise<unknown>][] = [
      ['url-encoded', () => new Request(URL_, { method: 'POST', body: new URLSearchParams({ passphrase: 'pässphräse ✓' }) }), async (r) => (await r.formData()).get('passphrase')],
      ['multipart', () => new Request(URL_, { method: 'POST', body: multipart }), async (r) => (await r.formData()).get('passphrase')],
      ['JSON', () => new Request(URL_, { method: 'POST', body: '{"country":"DE","note":"ü"}', headers: { 'content-type': 'application/json' } }), (r) => r.json()],
    ];
    for (const [name, build, parse] of originals) {
      const expected = await parse(build());
      const original = build();
      const read = await readBodyWithin(original, 4096);
      if (!read.ok) throw new Error(`${name}: refused within the limit`);
      await expect(parse(withBoundedBody(original, read.bytes)), name).resolves.toEqual(expected);
    }
  });
});

describe('the limits', () => {
  it('are 4 KiB for the sign-in, 8 KiB for the check and 32 KiB for contact', () => {
    expect(PILOT_ACCESS_BODY_LIMIT).toBe(4096);
    expect(CHECK_BODY_LIMIT).toBe(8192);
    expect(CONTACT_BODY_LIMIT).toBe(32768);
  });
});

describe('the module', () => {
  /** The module's code with its comments removed, so prose that names a module is not taken for importing it. */
  const code = readFileSync(fileURLToPath(new URL('../lib/request-body.ts', import.meta.url)), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

  it('imports nothing, Next included, and reads no environment: it is handed a standard Request and returns values', () => {
    expect([...code.matchAll(/(?:\bfrom\s+|\bimport\s*\(?\s*|\brequire\s*\(\s*)['"]([^'"]+)['"]/g)]).toEqual([]);
    expect(code).not.toMatch(/process\.env/);
    // The control: the pattern finds an import where there is one.
    expect([..."import { NextResponse } from 'next/server';".matchAll(/(?:\bfrom\s+|\bimport\s*\(?\s*|\brequire\s*\(\s*)['"]([^'"]+)['"]/g)]).toHaveLength(1);
  });
});
