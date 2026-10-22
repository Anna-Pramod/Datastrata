/**
 * `POST /api/check` and `POST /api/contact` under their body limits — what they are held to.
 *
 * Pilot readiness B4 (2026-10-22). Both routes are public and parsed their bodies with `request.json()`, which reads whatever
 * arrives before parsing a byte of it. Each now reads through `readBodyWithin` (8 KiB for the check, 32 KiB for contact) and
 * answers a body over its limit with 413, `Cache-Control: no-store` and a fixed body in its own existing shape. The route modules
 * are driven directly with standard requests, as `public-resolver-seam.test.ts` drives the check.
 *
 * Each route is held on both of the helper's paths. On the declared path the body is a stream that records its pulls, so the 413
 * is shown to have been decided without reading; on the streamed path the body declares no length, so only the count can find it.
 * Every refusal is paired with the pass one step away: exactly the limit beside one byte more, and a body padded to the limit
 * answered exactly as the same answers unpadded, so a route that refused everything, or one that parsed something other than the
 * bytes it was sent, fails here (evidence standard, failure modes 5 and 7).
 *
 * Contact never reaches a network. `fetch` is replaced by a recorder for every case, `CONTACT_WEBHOOK_URL` is unset unless a case
 * sets it to a reserved `.test` host, and the case that does is the positive control for "a body too large is never delivered".
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildCheckResponse } from '@/lib/checkResponse';
import type { CheckerAnswers } from '@/lib/checker';
import { csrdPack } from '@/lib/pack';
import { POST as check } from '@/app/api/check/route';
import { POST as contact } from '@/app/api/contact/route';

const CHECK_URL = 'http://127.0.0.1:3000/api/check';
const CONTACT_URL = 'http://127.0.0.1:3000/api/contact';
/** The instant the check route's clock is held at, and the assessment date it gives. Deliberately in the past. */
const NOW = new Date('2026-07-26T12:00:00.000Z');
const ASSESSMENT_DATE = '2026-07-26';
const WEBHOOK = 'https://hooks.example.test/contact';
/** Written into every oversize body, so a response that repeated what it was sent would be found. */
const MARKER = 'submitted-marker-7d1e0c';

const CHECK_TOO_LARGE = '{"error":"Request body too large."}';
const CONTACT_TOO_LARGE = '{"ok":false,"message":"Your message is too long."}';
const CONTACT_UNCONFIGURED = '{"ok":false,"message":"This form is not connected to an inbox yet, so nothing was sent."}';
const CONTACT_MALFORMED = '{"ok":false,"message":"Please check the form and try again."}';
const CHECK_MALFORMED = '{"error":"Malformed check answers."}';

/** A German entity over both thresholds, as the other check tests use. */
const ANSWERS: CheckerAnswers = {
  country: 'DE',
  legalForm: 'private_limited_company',
  financialYear: '2027',
  groupPosition: 'standalone',
  turnover: 'gt600',
  employees: 'gt1500',
  reportedFy2024: 'no',
  governingChoice: 'same',
  exclusion: 'no',
};

const MESSAGE = { name: 'Ada', email: 'ada@example.test', company: 'Example Ltd', message: `A message of more than ten characters. ${MARKER}` };

/** `value` as JSON of exactly `bytes` bytes: spaces before the closing brace, which every JSON parser skips. */
function paddedJson(value: object, bytes: number): string {
  const base = JSON.stringify(value);
  const padding = bytes - base.length;
  if (padding < 0) throw new Error(`${base.length} bytes of JSON do not fit in ${bytes}`);
  return `${base.slice(0, -1)}${' '.repeat(padding)}}`;
}

/** A body handed out in chunks only when pulled (high-water mark zero), with every pull written down. */
function recordedBody(text: string, chunkBytes = 1024) {
  const bytes = new TextEncoder().encode(text);
  const record = { pulls: 0 };
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
    },
    { highWaterMark: 0 },
  );
  return { stream, record };
}

/** A JSON POST of `text` that declares no length, so only the streamed count can measure it. */
function streamed(url: string, text: string): Request {
  return new Request(url, { method: 'POST', body: text, headers: { 'content-type': 'application/json' } });
}

/** A JSON POST of `text` over a recording stream that declares its true length. */
function declared(url: string, text: string) {
  const { stream, record } = recordedBody(text);
  const init: RequestInit & { duplex: 'half' } = {
    method: 'POST',
    body: stream,
    headers: { 'content-type': 'application/json', 'content-length': String(new TextEncoder().encode(text).byteLength) },
    duplex: 'half',
  };
  return { request: new Request(url, init), record };
}

/** Every header and the body of a response, as one string to search. */
const everythingIn = async (response: Response): Promise<string> => `${JSON.stringify([...response.headers.entries()])}\n${await response.text()}`;

let delivered: { url: string; body: string }[];

beforeEach(() => {
  vi.stubEnv('CONTACT_WEBHOOK_URL', undefined);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  delivered = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    delivered.push({ url: String(input), body: String(init?.body) });
    return new Response(null, { status: 204 });
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('POST /api/check', () => {
  const assessed = () => JSON.parse(JSON.stringify(buildCheckResponse(csrdPack(), ANSWERS, ASSESSMENT_DATE))) as unknown;

  it('answers a body that declares more than 8192 bytes with 413, no-store and the fixed body, without reading it', async () => {
    const { request, record } = declared(CHECK_URL, paddedJson(ANSWERS, 8193));
    const response = await check(request);
    expect(response.status).toBe(413);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.text()).toBe(CHECK_TOO_LARGE);
    expect(record.pulls).toBe(0);
  });

  it('reads and assesses the same answers declaring exactly 8192 bytes, which is what makes "without reading" above mean something', async () => {
    const { request, record } = declared(CHECK_URL, paddedJson(ANSWERS, 8192));
    const response = await check(request);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(assessed());
    expect(record.pulls).toBeGreaterThan(0);
  });

  it('answers a body of 8193 bytes that declares no length with 413 and the fixed body, and the same answers in exactly 8192 are assessed', async () => {
    const over = await check(streamed(CHECK_URL, paddedJson(ANSWERS, 8193)));
    expect(over.status).toBe(413);
    expect(over.headers.get('cache-control')).toBe('no-store');
    expect(await over.text()).toBe(CHECK_TOO_LARGE);

    const at = await check(streamed(CHECK_URL, paddedJson(ANSWERS, 8192)));
    expect(at.status).toBe(200);
    expect(await at.json()).toEqual(assessed());
  });

  it('answers within the limit exactly as before: the stated answers are assessed, and malformed answers are still 400', async () => {
    const response = await check(streamed(CHECK_URL, JSON.stringify(ANSWERS)));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(assessed());

    for (const body of ['{"country":', '{"exclusion":"perhaps"}', '']) {
      const refused = await check(streamed(CHECK_URL, body));
      expect(refused.status, body).toBe(400);
      expect(await refused.text(), body).toBe(CHECK_MALFORMED);
    }
  });

  it('puts nothing that was submitted into a 413, on either path', async () => {
    const answers = { ...ANSWERS, legalForm: MARKER };
    const responses = [await check(streamed(CHECK_URL, paddedJson(answers, 9000))), await check(declared(CHECK_URL, paddedJson(answers, 9000)).request)];
    // What is scanned is a 413: a route that answered something else would make the silence below say nothing about a refusal.
    expect(responses.map((response) => response.status)).toEqual([413, 413]);
    const seen = await Promise.all(responses.map(everythingIn));
    expect(seen.join('\n')).not.toContain(MARKER);
    // The control: the scan finds the marker where it is.
    expect(await everythingIn(new Response(paddedJson(answers, 9000)))).toContain(MARKER);
  });
});

describe('POST /api/contact', () => {
  it('answers a body that declares more than 32768 bytes with 413, no-store and its own JSON shape, without reading it or delivering anything', async () => {
    vi.stubEnv('CONTACT_WEBHOOK_URL', WEBHOOK);
    const { request, record } = declared(CONTACT_URL, paddedJson(MESSAGE, 32769));
    const response = await contact(request);
    expect(response.status).toBe(413);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.text()).toBe(CONTACT_TOO_LARGE);
    expect(record.pulls).toBe(0);
    expect(delivered).toEqual([]);
  });

  it('answers a body of 32769 bytes that declares no length with 413 and delivers nothing', async () => {
    vi.stubEnv('CONTACT_WEBHOOK_URL', WEBHOOK);
    const response = await contact(streamed(CONTACT_URL, paddedJson(MESSAGE, 32769)));
    expect(response.status).toBe(413);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.text()).toBe(CONTACT_TOO_LARGE);
    expect(delivered).toEqual([]);
  });

  it('delivers the same message padded to exactly 32768 bytes, declared or not, as it delivers it unpadded: the control for "delivers nothing" above', async () => {
    vi.stubEnv('CONTACT_WEBHOOK_URL', WEBHOOK);
    const { request, record } = declared(CONTACT_URL, paddedJson(MESSAGE, 32768));
    const bodies = [request, streamed(CONTACT_URL, paddedJson(MESSAGE, 32768)), streamed(CONTACT_URL, JSON.stringify(MESSAGE))];
    for (const body of bodies) {
      const response = await contact(body);
      expect(response.status).toBe(200);
      expect(await response.text()).toBe('{"ok":true}');
    }
    expect(record.pulls).toBeGreaterThan(0);
    expect(delivered).toHaveLength(3);
    for (const { url, body } of delivered) {
      expect(url).toBe(WEBHOOK);
      expect(JSON.parse(body)).toEqual({ ...MESSAGE, receivedAt: NOW.toISOString(), source: 'datastrata.site/contact' });
    }
  });

  it('keeps its existing answers within the limit while delivery is unconfigured: 503 for a good message, also at exactly 32768 bytes, and 400 for a bad one', async () => {
    for (const body of [JSON.stringify(MESSAGE), paddedJson(MESSAGE, 32768)]) {
      const response = await contact(streamed(CONTACT_URL, body));
      expect(response.status).toBe(503);
      expect(await response.text()).toBe(CONTACT_UNCONFIGURED);
    }
    const refused = await contact(streamed(CONTACT_URL, JSON.stringify({ ...MESSAGE, email: 'not an address' })));
    expect(refused.status).toBe(400);
    expect(await refused.text()).toBe(CONTACT_MALFORMED);
    expect(delivered).toEqual([]);
  });

  it('puts nothing that was submitted into a 413, on either path', async () => {
    const responses = [
      await contact(streamed(CONTACT_URL, paddedJson(MESSAGE, 40000))),
      await contact(declared(CONTACT_URL, paddedJson(MESSAGE, 40000)).request),
    ];
    expect(responses.map((response) => response.status)).toEqual([413, 413]);
    const seen = await Promise.all(responses.map(everythingIn));
    expect(seen.join('\n')).not.toContain(MARKER);
    expect(seen.join('\n')).not.toContain(MESSAGE.email);
    expect(await everythingIn(new Response(paddedJson(MESSAGE, 40000)))).toContain(MARKER);
  });
});
