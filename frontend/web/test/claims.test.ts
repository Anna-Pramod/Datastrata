/**
 * The public site and the record screen say nothing the record does not back.
 *
 * Stage 1a, Task 6. The design's status-language table (§3) names the claims
 * that were written into copy with nothing behind them: a question count the
 * check no longer has, "You are current" from a change loop that never runs,
 * an answer "continuously maintained" by no mechanism, six regimes "tracked,
 * scoped and queued" with no register row, a versioning guarantee no stored run
 * backs, a login card that welcomed back accounts that do not exist. Each was
 * replaced by words derived from the record or by a plain statement of what is
 * planned. This test is the guard: it reads every `.ts` and `.tsx` file under
 * `app/`, `components/` and `lib/` and fails, naming the file and the phrase,
 * if any of them comes back.
 *
 * Text is compared with runs of whitespace collapsed to one space, because JSX
 * wraps a sentence across source lines and the rendered sentence is what is
 * forbidden: "DETERMINATIONS VERSIONED, NEVER\n OVERWRITTEN" is still the claim.
 * It is also compared without regard to letter case, because much of the copy
 * is set in capitals in the source itself: the landing page's change sheet
 * printed "YOU ARE CURRENT" while a case-sensitive scan passed.
 *
 * The list reaches past the design's first table. The parent's review found the
 * same claims on surfaces that table did not name (the illustrations beside the
 * story steps, the "how it works" and proof lists, the company page's origin and
 * principles, the record screen's rail label), and each phrase removed there is
 * guarded here as well. The final review (2026-10-21) found five more, on the
 * record's rail label, the landing page's change step and coverage heading, the
 * company page's build order and the contact page, and three phrases design §3
 * says disappear that nothing guarded. Each is guarded as a specific phrase,
 * never as a bare word such as "monitoring" or "maintain", which stay valid in
 * definitions and in clearly labelled plans.
 *
 * A scan that found nothing because it read nothing would pass vacuously
 * (evidence standard, failure mode 7), so the control asserts that the one
 * status word the register does print today, "Draft · evaluation only", is
 * found in at least one scanned file, and that each of the three directories
 * contributed a file. The control phrase is spelled here rather than imported
 * from `COVERAGE_WORDS`, so it cannot agree with a module that changed the word,
 * and it is matched exactly, case included, so it stays pinned to that word.
 *
 * The two link texts that sent a visitor to the dashboard are forbidden as well,
 * "See a sample report" on the landing page and "See how this is maintained" on
 * the check result (Task 4). The dashboard is behind the access gate, so a public
 * page that offers it offers a door the visitor cannot open, and the second text
 * also claims a maintenance that nothing does. The check result now says, in a
 * plain sentence, that a record built from a company's own profile is available to
 * pilot evaluations by arrangement.
 *
 * The second block pins the number the copy prints. It is derived from
 * `visibleQuestions` over proposal §4.5's visitor types, the fewest and the most
 * questions any visitor answers, with the optional pair a parent may add, and
 * each visitor type's range must be the one §4.5's "Total" column states (DP1
 * plan, Task 6; the count was nine and ten while the check had a fixed step list).
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CHECK_QUESTIONS, visibleQuestions, type CheckerAnswers, type QuestionId } from '@/lib/check-answers';
import { checkQuestionCount } from '@/lib/check-view';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCANNED_DIRS = ['app', 'components', 'lib'] as const;

export const FORBIDDEN_CLAIMS: string[] = [
  '8 QUESTIONS',
  'Eight questions',
  'You are current',
  'NOTHING CHANGED WHAT BINDS YOU',
  'Answer, maintained',
  'continuously maintained answer',
  'tracked, scoped and queued',
  'Watched · not yet encoded',
  'DETERMINATIONS VERSIONED, NEVER OVERWRITTEN',
  'Nothing has been overwritten',
  'signs them off',
  'hello@datastrata.example',
  'Email me a magic link',
  'we only watch today',
  // Found by the parent's review, on surfaces the design's first table did not name.
  'Nothing is overwritten',
  'Every layer, answered',
  'ACT DETECTED',
  'owner assigned',
  'exportable to calendar',
  'living calendar',
  'weekly briefing',
  "week's briefing",
  'appended like strata',
  'never erased',
  'maintained as the law moves',
  'nothing enters the record without',
  'applied on the day it actually applies',
  // The two links that sent a visitor to the dashboard once it was behind the access gate (Stage 1a, Task 4).
  'See a sample report',
  'See how this is maintained',
  // Found in the final review (2026-10-21): five leftover phrases, guarded as phrases and never as bare words, because "monitoring"
  // and "maintain" stay valid in definitions and clearly labelled plans.
  'Watch list · pending acts',
  'You see them settle',
  'what we are still reading',
  'Source monitoring exists as a tiered register',
  'who build and maintain the record',
  'who maintain the record',
  // ...and three phrases design §3 says disappear, which nothing guarded until then.
  'Encoded · answerable',
  'ACTS WATCHED',
  'REVISED ESRS',
];

export const REQUIRED_CONTROL = 'Draft · evaluation only';

interface ScannedFile {
  file: string;
  /** The source with every run of whitespace collapsed to one space. */
  text: string;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

function scan(): ScannedFile[] {
  return SCANNED_DIRS.flatMap((dir) => sourceFiles(join(ROOT, dir))).map((path) => ({
    file: relative(ROOT, path),
    text: readFileSync(path, 'utf8').replace(/\s+/g, ' '),
  }));
}

describe('claims guard', () => {
  const files = scan();

  it('reads source from each of app/, components/ and lib/', () => {
    for (const dir of SCANNED_DIRS) {
      expect(files.filter((f) => f.file.startsWith(`${dir}/`)).length, `${dir}/ contributed no file`).toBeGreaterThan(0);
    }
  });

  it('finds no forbidden claim in any scanned file, in any letter case', () => {
    const hits = files.flatMap((f) => {
      const folded = f.text.toLowerCase();
      return FORBIDDEN_CLAIMS.filter((phrase) => folded.includes(phrase.toLowerCase())).map((phrase) => `${f.file}: ${phrase}`);
    });
    expect(hits).toEqual([]);
  });

  it('finds the control phrase the register prints today, proving the scan reads the files', () => {
    const carrying = files.filter((f) => f.text.includes(REQUIRED_CONTROL)).map((f) => f.file);
    expect(carrying).not.toHaveLength(0);
  });
});

describe('the question count the copy prints', () => {
  const field = (id: QuestionId) => CHECK_QUESTIONS.find((q) => q.id === id)!.field;

  /**
   * Every way through the questions from a visitor type's C-1 and C-2: each shown,
   * not-optional question answered with each of its options, in the order shown.
   * Gives each complete flow's count of required questions and of optional ones.
   */
  function flowCounts(start: CheckerAnswers): { required: number[]; optional: number[] } {
    const required: number[] = [];
    const optional: number[] = [];
    const walk = (answers: CheckerAnswers): void => {
      const visible = visibleQuestions(answers);
      const next = visible.find((q) => !q.optional && answers[field(q.id)] === undefined);
      if (next === undefined) {
        required.push(visible.filter((q) => !q.optional).length);
        optional.push(visible.filter((q) => q.optional).length);
        return;
      }
      for (const option of CHECK_QUESTIONS.find((q) => q.id === next.id)!.options) walk({ ...answers, [field(next.id)]: option.id } as CheckerAnswers);
    };
    walk(start);
    return { required, optional };
  }

  const GROUPS = CHECK_QUESTIONS.find((q) => q.id === 'C-2')!.options.map((o) => o.id) as NonNullable<CheckerAnswers['group']>[];

  /** §4.5, "How many questions each visitor answers": the "Total" column without the optional questions, and the optional C-9 and C-10. The table is the oracle. */
  const SECTION_4_5: [string, CheckerAnswers[], [number, number], number][] = [
    ['EU company, no group', [{ country: 'DE', group: 'none' }], [5, 6], 0],
    ['EU parent', [{ country: 'DE', group: 'parent' }], [5, 6], 2],
    ['EU subsidiary', [{ country: 'DE', group: 'owned' }], [5, 7], 0],
    ['EU intermediate parent', [{ country: 'DE', group: 'both' }], [5, 7], 2],
    ['EU, group position "Not sure"', [{ country: 'DE', group: 'not_sure' }], [5, 6], 0],
    ['Non-EU company or group', GROUPS.flatMap((group) => [{ country: 'US', group }, { country: 'other', countryOther: 'AR', group }] as CheckerAnswers[]), [3, 3], 0],
    ['Country "Not sure"', GROUPS.map((group) => ({ country: 'not_sure', group }) as CheckerAnswers), [2, 2], 0],
  ];

  it('is 2 to 7 questions, and 2 more for a parent company on its own', () => {
    expect(checkQuestionCount()).toEqual({ fewest: 2, most: 7, optional: 2 });
  });

  it('is visibleQuestions’ range over §4.5’s visitor types, and each type’s range is the one §4.5 states', () => {
    const all = { required: [] as number[], optional: [] as number[] };
    for (const [visitor, starts, total, optional] of SECTION_4_5) {
      const counts = starts.map(flowCounts);
      const required = counts.flatMap((c) => c.required);
      const optionals = counts.flatMap((c) => c.optional);
      all.required.push(...required);
      all.optional.push(...optionals);
      expect([visitor, Math.min(...required), Math.max(...required), Math.max(...optionals)]).toEqual([visitor, ...total, optional]);
    }
    expect(checkQuestionCount()).toEqual({ fewest: Math.min(...all.required), most: Math.max(...all.required), optional: Math.max(...all.optional) });
  });

  it('the pages that state a count read it from checkQuestionCount, and write no number of questions themselves', () => {
    const literal = /\b\d+\s+(questions|QUESTIONS)\b|\b\d+\s+for a parent/i;
    // Positive control: the pattern sees a written count.
    expect(['9 QUESTIONS', '10 for a parent undertaking', 'Eight questions'].map((t) => literal.test(t))).toEqual([true, true, false]);
    for (const page of ['app/page.tsx', 'app/check/page.tsx']) {
      const source = readFileSync(join(ROOT, page), 'utf8');
      expect([page, source.includes('checkQuestionCount()'), literal.test(source)]).toEqual([page, true, false]);
    }
  });
});
