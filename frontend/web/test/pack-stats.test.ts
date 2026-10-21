/**
 * `packStats()`'s two signature counts, over a repository that holds a signature at each rung.
 *
 * Final review (2026-10-21), finding m5. The site prints `signed` on the landing page's stat shelf and beside the requirement count
 * in the coverage register ("0 of 23 requirements signed"), and it counts a requirement signed at either rung, `verified` or
 * `ratified`. Over the real repository both counts are 0, so a `signed` that counted one rung alone would print the same 0 and
 * nothing in the suite would notice (evidence standard, failure mode 3). Here one requirement is signed at each rung and both counts
 * are pinned exactly: `signed` 2 fails a count of either rung alone, and `ratified` 1 fails a count that took the lower rung in.
 *
 * The repository is `test/fixture-repository.ts`'s: the production layout over the real knowledge and corpus, with signatures
 * computed by the producers the sign CLI uses. That fixture signs every requirement as a ratification, so one of its two entries is
 * re-signed here at the verified rung: its `kind` is rewritten and its entry id recomputed with the engine's own `entryId`, which
 * the loader checks, and nothing the signature pins moves. The statuses the loaded pack derives are asserted before the counts are
 * read, so the counts are read over the rungs this file means. `packStats()` finds its repository from the working directory, as
 * the deployed server does, so the process is pointed at the fixture for the call and put back afterwards, the seam
 * `public-resolver-seam.test.ts` uses. This pins behaviour that already exists; it does not drive a change to `lib/pack.ts`.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { entryId, type SigningEntry, type UnsignedLedgerEntry } from '../../../backend/engine/src/verification/ledger';
import { csrdPack, packStats } from '@/lib/pack';
import { buildFixtureRepository } from './fixture-repository';

const VERIFIED_ID = 'CSRD-S-001';
const RATIFIED_ID = 'CSRD-S-002';

/** Runs `fn` as a process whose working directory is `dir`, and puts it back. */
function inRepository<T>(dir: string, fn: () => T): T {
  const previous = process.cwd();
  process.chdir(dir);
  try {
    return fn();
  } finally {
    process.chdir(previous);
  }
}

/**
 * Re-signs one requirement at the verified rung: its ledger line is given `kind: 'verified'` and an entry id recomputed over the
 * changed line by the engine's own `entryId`, so the loader's id check still holds, while every pin, and so the signature's
 * freshness, stays as the fixture computed it.
 */
function signAtVerifiedRung(engineRoot: string, requirementId: string): void {
  const ledgerPath = join(engineRoot, 'verification', 'signatures.jsonl');
  const lines = readFileSync(ledgerPath, 'utf8').trimEnd().split('\n');
  let rewritten = 0;
  const resigned = lines.map((line) => {
    const entry = JSON.parse(line) as SigningEntry;
    if (entry.requirementId !== requirementId) return line;
    rewritten += 1;
    const { entryId: _ratifiedId, ...fields } = { ...entry, kind: 'verified' as const };
    return JSON.stringify({ ...fields, entryId: entryId(fields as unknown as UnsignedLedgerEntry) });
  });
  if (rewritten !== 1) throw new Error(`fixture: expected one ledger entry for ${requirementId} and found ${rewritten}`);
  writeFileSync(ledgerPath, `${resigned.join('\n')}\n`, 'utf8');
}

describe('packStats over a repository holding a signature at each rung', () => {
  it('counts both rungs as signed and the higher alone as ratified: signed 2, ratified 1', () => {
    const fixture = buildFixtureRepository({ requirementIds: [VERIFIED_ID, RATIFIED_ID] });
    signAtVerifiedRung(fixture.engineRoot, VERIFIED_ID);

    const { pack, stats } = inRepository(fixture.repoRoot, () => ({ pack: csrdPack(), stats: packStats() }));

    // The rungs the counts are read over, as the loader derived them from the ledger.
    const derived = (id: string) => pack.requirements.find((r) => r.id === id)?.derivedStatus;
    expect(derived(VERIFIED_ID)).toBe('verified');
    expect(derived(RATIFIED_ID)).toBe('ratified');
    expect(pack.requirements.filter((r) => r.derivedStatus === 'draft')).toHaveLength(pack.requirements.length - 2);
    expect(stats.requirements).toBe(pack.requirements.length);

    expect({ signed: stats.signed, ratified: stats.ratified }).toEqual({ signed: 2, ratified: 1 });
  });
});
