/**
 * The dashboard page's own gate, and the line of the topbar that depends on it — what they are held to.
 *
 * Stage 1a (2026-10-20). The middleware refuses a stranger before any page code runs; `gatedRecord` is the second place the gate is
 * enforced and the one nearest the profile. The page asks it before it reads anything, and it calls the reader it is handed (in
 * production `pilotRecord`, the only reader of a configured profile) for one decision only: an allowed session. What is under test is
 * therefore a count, how often the reader is called under each decision the gate can give. The reader here is a spy that returns one
 * fixed object, so no profile, no pack and no variable of the machine is read, and every environment is handed in as a value: this
 * file stubs nothing and has nothing to restore.
 *
 * Every zero is paired with the one beside it (evidence standard, failure mode 7). A reader that is never called satisfies every
 * "was not called" case, so each refusal is followed, in the same case, by the nearest session that passes and the single call it
 * causes: the same cookie a millisecond before its expiry and at it, a revocation instant equal to the issue instant and one a
 * millisecond after it, the same token under the secret that signed it and under another, the same session under a usable
 * configuration and under an unusable one, a secret of sixteen characters and one of fifteen. A gate that refused everyone would
 * satisfy the refusals and fail the passes; one that read the profile before it decided would satisfy the outcomes and fail the
 * counts. Sessions are issued by the access module's own `issueAccessToken` under a synthetic secret and a fixed clock, so the
 * decision under test is the one production makes.
 *
 * The page (`app/dashboard/page.tsx`) and the topbar (`components/app/Shell.tsx`) are `.tsx` modules, and the site's tsconfig leaves
 * JSX to Next, so the runner cannot import either. What only their source can show is held by reading it, as the other page tests do:
 * the page hands `pilotRecord` to `gatedRecord` as the dependency and never calls it, which is the order the gate exists for, since a
 * page that read first and asked second would read the profile for every stranger and throw the result away. A scan that found
 * nothing because it read nothing would pass vacuously, so every absence is checked beside a presence in the same file, and the
 * pattern for a call is checked against the lines it is there to forbid and the lines it must let by. What can be tested with values
 * is kept out of the markup for that reason: the expiry's wording is `utcMinute`, a pure function, and the Topbar only prints it.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import {
  ACCESS_COOKIE,
  ACCESS_REVOKED_BEFORE_ENV,
  ACCESS_SECRET_ENV,
  issueAccessToken,
  type AccessDecision,
} from '@/lib/access';
import { gatedRecord, utcMinute, type GatedRecord } from '@/lib/dashboard-view';
import { accessReasonMessage } from '@/lib/pilot-access-handler';

type DeniedReason = Extract<AccessDecision, { kind: 'denied' }>['reason'];
type Env = Record<string, string | undefined>;

/** One visit to the dashboard, as the page hands it to the gate. */
interface Visit {
  env: Env;
  cookieHeader: string | null;
  now: Date;
}

const SECRET = 'correct horse battery staple';
const OTHER_SECRET = 'battery staple horse correct';
const FIFTEEN = 'fifteen-chars!!';
const SIXTEEN = 'sixteen-chars!!!';
const NOW = new Date('2026-10-20T12:00:00.000Z');
const HOUR_MS = 3_600_000;
/** Twelve hours, written out and not read from the access module that issues them. */
const SESSION_MS = 43_200_000;
const NONCE = 'n0nce-0123456789abcdef';
const ENV: Env = { [ACCESS_SECRET_ENV]: SECRET };
/** What the reader returns: one object, so that "passed through" is an identity and not an equal copy. */
const MARKER = { marker: 'the record the reader returned' };

function at(offsetMs: number): Date {
  return new Date(NOW.getTime() + offsetMs);
}

/** The Cookie header a browser holding a session issued at `issuedAt` under `secret` would send. */
async function cookieFor(secret: string, issuedAt: Date): Promise<string> {
  return `${ACCESS_COOKIE}=${await issueAccessToken(secret, issuedAt, NONCE)}`;
}

/** A visit at NOW under the usable configuration carrying this Cookie header, with any field replaced by `overrides`. */
function visit(cookieHeader: string | null, overrides: Partial<Visit> = {}): Visit {
  return { env: ENV, cookieHeader, now: NOW, ...overrides };
}

/** A reader that counts how often it is called, and returns `MARKER` each time. */
function reader() {
  return vi.fn(() => MARKER);
}

/** The allowed result, or a failure that says what the gate answered instead. */
function allowedOf<T>(result: GatedRecord<T>): Extract<GatedRecord<T>, { status: 'allowed' }> {
  if (result.status !== 'allowed') throw new Error(`expected the gate to allow the visit and it answered ${result.status}`);
  return result;
}

/**
 * Every refusal the gate can give a session, each with the visit that provokes it through the real decision and the nearest visit that
 * passes. Keyed by the reason, so a sixth reason in the access module is a type error here until a case provokes it.
 */
const NEAR_MISSES: Record<DeniedReason, () => Promise<{ refused: Visit; passed: Visit }>> = {
  no_session: async () => ({
    refused: visit(null),
    passed: visit(await cookieFor(SECRET, NOW)),
  }),
  malformed: async () => ({
    refused: visit(`${ACCESS_COOKIE}=garbage`),
    passed: visit(await cookieFor(SECRET, NOW)),
  }),
  bad_signature: async () => {
    const cookieHeader = await cookieFor(OTHER_SECRET, NOW);
    return {
      refused: visit(cookieHeader),
      passed: visit(cookieHeader, { env: { [ACCESS_SECRET_ENV]: OTHER_SECRET } }),
    };
  },
  expired: async () => {
    const cookieHeader = await cookieFor(SECRET, NOW);
    return {
      refused: visit(cookieHeader, { now: at(SESSION_MS) }),
      passed: visit(cookieHeader, { now: at(SESSION_MS - 1) }),
    };
  },
  revoked: async () => {
    const cookieHeader = await cookieFor(SECRET, NOW);
    // Both visits are at the later instant, so neither revocation instant is later than the visit, which would be a configuration
    // problem (final review, 2026-10-21) rather than a revocation; the two differ in the instant alone.
    return {
      refused: visit(cookieHeader, { env: { ...ENV, [ACCESS_REVOKED_BEFORE_ENV]: '2026-10-20T12:00:00.001Z' }, now: at(1) }),
      passed: visit(cookieHeader, { env: { ...ENV, [ACCESS_REVOKED_BEFORE_ENV]: '2026-10-20T12:00:00.000Z' }, now: at(1) }),
    };
  },
};
const REASONS = Object.keys(NEAR_MISSES) as DeniedReason[];

describe('gatedRecord', () => {
  it('calls the reader once, hands back what it returned as it returned it, and says when the session ends, for a session the gate accepts', async () => {
    const record = reader();
    const result = await gatedRecord(visit(await cookieFor(SECRET, at(-HOUR_MS))), { record });
    expect(result).toEqual({ status: 'allowed', record: MARKER, expiresAt: new Date('2026-10-20T23:00:00.000Z') });
    expect(allowedOf(result).record).toBe(MARKER);
    expect(record).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith();
  });

  it.each(REASONS)('refuses a session that fails as %s without calling the reader, and calls it once for the nearest session that passes', async (reason) => {
    const { refused, passed } = await NEAR_MISSES[reason]();

    const refusedReader = reader();
    await expect(gatedRecord(refused, { record: refusedReader })).resolves.toEqual({ status: 'denied', reason });
    expect(refusedReader).toHaveBeenCalledTimes(0);

    const passedReader = reader();
    await expect(gatedRecord(passed, { record: passedReader })).resolves.toMatchObject({ status: 'allowed', record: MARKER });
    expect(passedReader).toHaveBeenCalledTimes(1);
  });

  // The absent header is the near miss above; these are the other shapes of a visitor with no session, each beside a session.
  const noSession: [string, string][] = [
    ['an empty Cookie header', ''],
    ['other cookies only', 'theme=dark; last=3'],
    ['the session cookie with nothing in it', `${ACCESS_COOKIE}=`],
  ];
  it.each(noSession)('refuses %s without calling the reader, where the same server calls it once for a session', async (_name, cookieHeader) => {
    const refusedReader = reader();
    await expect(gatedRecord(visit(cookieHeader), { record: refusedReader })).resolves.toEqual({ status: 'denied', reason: 'no_session' });
    expect(refusedReader).toHaveBeenCalledTimes(0);

    const passedReader = reader();
    await expect(gatedRecord(visit(await cookieFor(SECRET, NOW)), { record: passedReader })).resolves.toMatchObject({ status: 'allowed' });
    expect(passedReader).toHaveBeenCalledTimes(1);
  });

  it.each(REASONS)('gives the page a reason it has a sentence for when a session fails as %s', async (reason) => {
    const { refused } = await NEAR_MISSES[reason]();
    await expect(gatedRecord(refused, { record: reader() })).resolves.toEqual({ status: 'denied', reason });
    expect(accessReasonMessage(reason), `no sentence for ${reason}`).toEqual(expect.stringMatching(/\S/));
  });

  describe('when the gate is not configured', () => {
    const unusable: [string, Env, string][] = [
      ['no secret', {}, ACCESS_SECRET_ENV],
      ['a blank secret', { [ACCESS_SECRET_ENV]: '   ' }, ACCESS_SECRET_ENV],
      ['a 15-character secret', { [ACCESS_SECRET_ENV]: FIFTEEN }, ACCESS_SECRET_ENV],
      ['a revocation instant that is not an instant', { ...ENV, [ACCESS_REVOKED_BEFORE_ENV]: 'soon' }, ACCESS_REVOKED_BEFORE_ENV],
      // Final review (2026-10-21): an instant later than the visit is a configuration problem, not a revocation of every session.
      ['a revocation instant a millisecond later than the visit', { ...ENV, [ACCESS_REVOKED_BEFORE_ENV]: '2026-10-20T12:00:00.001Z' }, ACCESS_REVOKED_BEFORE_ENV],
    ];
    it.each(unusable)('answers unconfigured, naming the variable and not calling the reader, for %s, where a usable configuration accepts the same session', async (_name, env, variable) => {
      const cookieHeader = await cookieFor(SECRET, NOW);

      const acceptedReader = reader();
      await expect(gatedRecord(visit(cookieHeader), { record: acceptedReader })).resolves.toMatchObject({ status: 'allowed' });
      expect(acceptedReader).toHaveBeenCalledTimes(1);

      const refusedReader = reader();
      await expect(gatedRecord(visit(cookieHeader, { env }), { record: refusedReader })).resolves.toEqual({
        status: 'unconfigured',
        problems: [expect.stringContaining(variable)],
      });
      expect(refusedReader).toHaveBeenCalledTimes(0);
    });

    it('refuses even a session signed under the unusable secret itself: fifteen characters give unconfigured and sixteen give a session', async () => {
      expect(FIFTEEN).toHaveLength(15);
      expect(SIXTEEN).toHaveLength(16);

      const refusedReader = reader();
      const short = visit(await cookieFor(FIFTEEN, NOW), { env: { [ACCESS_SECRET_ENV]: FIFTEEN } });
      await expect(gatedRecord(short, { record: refusedReader })).resolves.toMatchObject({ status: 'unconfigured' });
      expect(refusedReader).toHaveBeenCalledTimes(0);

      const passedReader = reader();
      const long = visit(await cookieFor(SIXTEEN, NOW), { env: { [ACCESS_SECRET_ENV]: SIXTEEN } });
      await expect(gatedRecord(long, { record: passedReader })).resolves.toMatchObject({ status: 'allowed' });
      expect(passedReader).toHaveBeenCalledTimes(1);
    });

    it('names the variable of each problem and never the value it was set to', async () => {
      const shortValue = 'hunter2-xyz';
      const badInstant = 'next-tuesday-ish';
      const env = { [ACCESS_SECRET_ENV]: shortValue, [ACCESS_REVOKED_BEFORE_ENV]: badInstant };
      const result = await gatedRecord(visit(null, { env }), { record: reader() });
      expect(result).toEqual({
        status: 'unconfigured',
        problems: [expect.stringContaining(ACCESS_SECRET_ENV), expect.stringContaining(ACCESS_REVOKED_BEFORE_ENV)],
      });

      // Everything the page could print of this result, as text: it holds the variable names, which is what makes its silence about the values mean something.
      const printed = JSON.stringify(result);
      expect(printed).toContain(ACCESS_SECRET_ENV);
      expect(printed).toContain(ACCESS_REVOKED_BEFORE_ENV);
      expect(printed).not.toContain(shortValue);
      expect(printed).not.toContain(badInstant);
    });
  });
});

describe('utcMinute', () => {
  const written: [string, string][] = [
    ['2026-10-21T05:30:00.000Z', '2026-10-21 05:30 UTC'],
    // Seconds are dropped and never rounded up, so the label never says a session lasts longer than it does.
    ['2026-10-21T05:30:59.999Z', '2026-10-21 05:30 UTC'],
    ['2026-10-21T05:31:00.000Z', '2026-10-21 05:31 UTC'],
    // Every field is padded to its width.
    ['2027-01-02T03:04:05.006Z', '2027-01-02 03:04 UTC'],
    ['2026-12-31T23:59:59.999Z', '2026-12-31 23:59 UTC'],
    ['2026-03-01T00:00:00.000Z', '2026-03-01 00:00 UTC'],
  ];
  it.each(written)('writes %s as %s', (instant, expected) => {
    expect(utcMinute(new Date(instant))).toBe(expected);
  });

  it('writes the end of a session issued at 17:30:45 UTC as 05:30 UTC on the next day, the form the topbar is specified with', async () => {
    const issuedAt = new Date('2026-10-20T17:30:45.123Z');
    const result = await gatedRecord(visit(await cookieFor(SECRET, issuedAt), { now: issuedAt }), { record: reader() });
    expect(utcMinute(allowedOf(result).expiresAt)).toBe('2026-10-21 05:30 UTC');
  });

  it('reads the instant in UTC whatever time zone the process is in: a Date whose local-time accessors refuse to answer is written the same', () => {
    const instant = new Date('2026-10-21T05:30:45.123Z');
    for (const method of ['getFullYear', 'getMonth', 'getDate', 'getHours', 'getMinutes', 'toLocaleString', 'toLocaleDateString', 'toLocaleTimeString']) {
      Object.defineProperty(instant, method, {
        value: () => {
          throw new Error(`the instant was read in local time through ${method}`);
        },
      });
    }
    expect(utcMinute(instant)).toBe('2026-10-21 05:30 UTC');
  });
});

describe('the dashboard sources', () => {
  const sourcePath = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));
  const GATE = '../lib/dashboard-view.ts';
  const PAGE = '../app/dashboard/page.tsx';
  const SHELL = '../components/app/Shell.tsx';

  /** The module's code with its comments removed, so prose that names `pilotRecord()` is not taken for calling it. */
  function code(relative: string): string {
    return readFileSync(sourcePath(relative), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
  }

  /** The code with every run of whitespace collapsed to one space, so JSX wrapped across lines is matched as it reads. */
  const flat = (relative: string) => code(relative).replace(/\s+/g, ' ');

  /** The modules a file imports, once each: a value import and a type import from one module are one dependency. */
  const importsOf = (relative: string) => [
    ...new Set([...code(relative).matchAll(/(?:\bfrom\s+|\bimport\s*\(?\s*|\brequire\s*\(\s*)['"]([^'"]+)['"]/g)].map((match) => match[1])),
  ].sort();

  it('keeps the gate to the access module, so it has no reader of its own to call by another route than the one it is handed', () => {
    expect(importsOf(GATE)).toEqual(['@/lib/access']);
  });

  it('reads neither the environment nor the clock itself, because the caller hands both in', () => {
    // The pattern for a read of either, the lines it must find, and the page, which does read both and so shows the pattern sees them in a real file.
    const reads = /\bprocess\.env\b|\bnew Date\(\s*\)|\bDate\.now\s*\(/;
    for (const read of ['process.env', 'process.env.DATASTRATA_PILOT_ACCESS_SECRET', 'new Date()', 'new Date( )', 'Date.now()']) {
      expect(read).toMatch(reads);
    }
    expect(code(PAGE)).toMatch(reads);
    expect(code(GATE)).not.toMatch(reads);
  });

  describe('the page', () => {
    const page = () => flat(PAGE);

    /** Calling `pilotRecord`, however it is spelled: directly, through `call`, `apply` or `bind`, or parenthesised. */
    const callsPilotRecord = /\bpilotRecord\s*(?:\(|\.\s*(?:call|apply|bind)\b|\)\s*\()/;

    it('has a pattern for calling pilotRecord that finds every call it is there to forbid and none of the ways of handing the function over', () => {
      for (const call of ['const record = pilotRecord();', 'return await pilotRecord ()', 'const [record] = [pilotRecord()]', 'pilotRecord.call(null)', 'pilotRecord.bind(null)()', '(pilotRecord)()']) {
        expect(call).toMatch(callsPilotRecord);
      }
      for (const handedOver of ['{ record: pilotRecord }', '{ record: pilotRecord, }', "import { pilotRecord } from '@/lib/record';"]) {
        expect(handedOver).not.toMatch(callsPilotRecord);
      }
    });

    it('is an async server component that is rendered for each request', () => {
      expect(page()).toMatch(/export default async function DashboardPage\(/);
      expect(page()).toContain("export const dynamic = 'force-dynamic'");
      expect(page()).not.toMatch(/['"]use client['"]/);
    });

    it('hands pilotRecord to the gate as the dependency, with the environment, the Cookie header and the clock', () => {
      expect(page()).toContain("import { headers } from 'next/headers';");
      const call = /\bawait gatedRecord\(([\s\S]*?)\)\s*;/.exec(page());
      expect(call, 'the page does not await gatedRecord(...)').not.toBeNull();
      const args = call?.[1] ?? '';
      expect(args).toContain('env: process.env');
      expect(args).toMatch(/cookieHeader: \(await headers\(\)\)\.get\('cookie'\)/);
      expect(args).toContain('now: new Date()');
      expect(args).toMatch(/\{ record: pilotRecord,? \}\s*,?\s*$/);
    });

    it('never calls pilotRecord itself, and mentions it only to import it and to hand it to the gate', () => {
      expect(page()).not.toMatch(callsPilotRecord);
      expect(page()).toContain("import { pilotRecord } from '@/lib/record';");
      expect(page().match(/\bpilotRecord\b/g)).toHaveLength(2);
    });

    it('reads process.env once, as the environment handed to the gate, so nothing else of it can be printed', () => {
      const reads = [...code(PAGE).matchAll(/process\.env(?:\.\w+|\[|\b)/g)].map((match) => match[0]);
      expect(reads).toEqual(['process.env']);
    });

    it('renders the three outcomes: the problems for an unconfigured gate, the handler\'s sentence and a link to the access page for a denied one, and the record', () => {
      expect(page()).toContain('Pilot access is not configured');
      expect(page()).toMatch(/gate\.problems\.map\(/);
      expect(page()).toContain('Sign in to view this record');
      expect(page()).toContain("import { accessReasonMessage } from '@/lib/pilot-access-handler';");
      expect(page()).toMatch(/accessReasonMessage\(gate\.reason\)/);
      expect(page()).toMatch(/<Link\b[^>]*\bhref="\/pilot-access"/);
    });

    it('gives the topbar the session on both pages rendered for a verified session, the record and the refusal for a profile that cannot be served', () => {
      // The refusal frame hands the session on to its topbar; without that, giving one to the refusal would change nothing on the page.
      expect(page()).toMatch(/\bsession\?: \{ expiresAt: Date \}/);
      expect(page()).toMatch(/<Topbar\b[^>]*\borg=\{org\}[^>]*\bsession=\{session\}/);
      expect(page()).toMatch(/<Refusal\b[^>]*\borg="No profile loaded"[^>]*\bsession=\{\{ expiresAt: gate\.expiresAt \}\}/);
      expect(page()).toMatch(/<Topbar\b[^>]*\borg=\{document\.record\.name\}[^>]*\bsession=\{\{ expiresAt: gate\.expiresAt \}\}/);
      // Those three are every place the page mentions a session, whatever order a tag writes its attributes in.
      expect(page().match(/\bsession=/g)).toHaveLength(3);
    });

    it('gives neither refusal of the gate a session: one has no verified session to show and the other cannot verify one', () => {
      // The control: the part of the pattern that names a gate refusal finds both of them, so the silence below is not a scan that found none.
      expect(page().match(/<Refusal\b[^>]*\borg="Pilot access"/g)).toHaveLength(2);
      const gateRefusalWithSession = /<Refusal\b[^>]*\borg="Pilot access"[^>]*\bsession=/;
      expect(page()).not.toMatch(gateRefusalWithSession);
      // And the pattern can fire: it finds a session on a gate refusal, and lets by a gate refusal without one and the profile refusal that has one.
      expect('<Refusal org="Pilot access" snapshot={stats.legalSnapshot} session={{ expiresAt: gate.expiresAt }}>').toMatch(gateRefusalWithSession);
      expect('<Refusal org="Pilot access" snapshot={stats.legalSnapshot}>').not.toMatch(gateRefusalWithSession);
      expect('<Refusal org="No profile loaded" snapshot={stats.legalSnapshot} session={{ expiresAt: gate.expiresAt }}>').not.toMatch(gateRefusalWithSession);
    });
  });

  describe('the topbar', () => {
    const shell = () => flat(SHELL);

    it('signs out through one plain form post to the sign-out route, with no client script', () => {
      expect(shell().match(/<form\b/g)).toHaveLength(1);
      expect(shell()).toMatch(/<form\b[^>]*\bmethod="post"/);
      expect(shell()).toMatch(/<form\b[^>]*\baction="\/api\/pilot-access\/sign-out"/);
      expect(shell()).toMatch(/<Button\b[^>]*\btype="submit"/);
      expect(shell()).not.toMatch(/['"]use client['"]/);
      expect(shell()).not.toMatch(/\bonClick\b/);
    });

    it('takes the session as an optional prop, and shows the expiry through utcMinute and the form only inside the branch that has one', () => {
      expect(shell()).toMatch(/session\?: \{ expiresAt: Date \}/);
      expect(shell()).toContain('SESSION UNTIL {utcMinute(session.expiresAt)}');
      // The form sits between the opening of the branch for a session and the first closing of its fragment.
      expect(shell()).toMatch(/session === undefined \? null : \(\s*<>(?:(?!<\/>).)*<form\b/);
    });
  });
});
