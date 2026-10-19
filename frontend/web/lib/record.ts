/**
 * The record behind the dashboard: the selected profile document, assessed by
 * the real engine over the verification-aware pack, or a refusal the page can
 * print.
 *
 * **Why the two halves.** `resolvePilotRecord` is pure: the environment, the
 * file reader and the pack are handed in, so a test can walk the synthetic
 * path and the refusal path without Next and without touching the real
 * environment. `pilotRecord()` is the production wiring and the only place
 * `process.env` and the filesystem are read for a profile. It also owns the
 * one side effect: a refusal's operator detail — the path and the system
 * error — goes to the server log here, and nowhere nearer the browser.
 *
 * **Why a refusal is returned rather than thrown.** The dashboard is a server
 * component; a throw would surface as Next's error boundary, which says
 * nothing about profiles. The page needs to say which variable, what kind of
 * failure and every problem by field, and to render nothing else — never the
 * sample in place of the company the operator meant.
 *
 * **No cache.** The page is dynamic, the file is small and the assessment is
 * cheap, so each request reads the file as it stands: editing the pilot's
 * profile and reloading is the intended loop during an evaluation.
 */

import 'server-only';
import { readFileSync } from 'node:fs';
import { assess } from '@datastrata/engine';
import type { AssessmentResult, KnowledgePack } from '@datastrata/engine';
import { csrdPack } from '@/lib/pack';
import {
  loadProfileDocument,
  ProfileConfigurationError,
  type ProfileDocument,
  type ProfileOrigin,
} from '@/lib/profile';
import synthetic from '@/profiles/synthetic-meridian.json';

export type PilotRecord =
  | { ok: true; origin: ProfileOrigin; document: ProfileDocument; pack: KnowledgePack; assessment: AssessmentResult }
  | { ok: false; error: ProfileConfigurationError };

export interface RecordDeps {
  readFile: (path: string) => string;
  synthetic: unknown;
  pack: KnowledgePack;
}

/** The pure half: select, validate, assess; a profile refusal becomes a value. */
export function resolvePilotRecord(env: Readonly<Record<string, string | undefined>>, deps: RecordDeps): PilotRecord {
  try {
    const { origin, document } = loadProfileDocument(env, deps);
    return { ok: true, origin, document, pack: deps.pack, assessment: assess(deps.pack, document.profile, document.context) };
  } catch (error) {
    if (error instanceof ProfileConfigurationError) return { ok: false, error };
    throw error;
  }
}

/** The production wiring: the process environment, the filesystem, the site's pack. */
export function pilotRecord(): PilotRecord {
  const record = resolvePilotRecord(process.env, {
    readFile: (path) => readFileSync(path, 'utf8'),
    synthetic,
    pack: csrdPack(),
  });
  if (!record.ok) {
    console.error(`[pilot profile] ${record.error.code}: ${record.error.operatorDetail}`);
  }
  return record;
}
