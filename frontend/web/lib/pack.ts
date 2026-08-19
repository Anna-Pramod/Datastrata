/**
 * Server-side access to the real CSRD knowledge pack.
 *
 * Loaded through the engine's own validating loader, so the site gets the same
 * referentially-checked content the CLI and tests get. A load failure is not
 * swallowed: if the content firewall rejects the pack, the site fails loudly
 * rather than answering from a half-loaded record.
 */

import 'server-only';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadPack } from '@datastrata/engine';
import type { KnowledgePack } from '@datastrata/engine';

const CANDIDATE_ROOTS = [
  join(process.cwd(), '..', '..', 'backend', 'engine', 'knowledge', 'csrd'),
  join(process.cwd(), 'backend', 'engine', 'knowledge', 'csrd'),
];

let cached: KnowledgePack | undefined;

export function csrdPack(): KnowledgePack {
  if (cached) return cached;
  const dir = CANDIDATE_ROOTS.find((c) => existsSync(join(c, 'pack.json')));
  if (!dir) {
    throw new Error(
      `CSRD knowledge pack not found. Looked in:\n${CANDIDATE_ROOTS.join('\n')}\n` +
        'The site expects the engine at backend/engine relative to the repository root.',
    );
  }
  cached = loadPack(dir);
  return cached;
}

export function sourceById(pack: KnowledgePack, id: string) {
  const s = pack.sources.find((x) => x.id === id);
  return s ? { id: s.id, title: s.title, url: s.url } : { id, title: id, url: '' };
}

/**
 * Every headline figure the site prints, derived from the pack rather than
 * written into copy. The mockup's "6 REGIMES READ / 14 OBLIGATIONS FOUND" were
 * placeholders and are deliberately not reproduced.
 */
export function packStats() {
  const pack = csrdPack();
  return {
    version: pack.version,
    legalSnapshot: pack.legalSnapshot,
    requirements: pack.requirements.length,
    inForce: pack.requirements.filter((r) => r.legalStatus === 'in_force').length,
    ratified: pack.requirements.filter((r) => r.ratification.status === 'ratified').length,
    sources: pack.sources.length,
    obligationTemplates: pack.obligationTemplates.length,
    questions: pack.questions.length,
    factTypes: pack.factTypes.length,
    pendingActs: pack.changeWatch.length,
    ratifiedCountryPacks: Object.keys(pack.catalogues.ratified_country_packs?.entries ?? {}).length,
  };
}

export interface ActMark {
  id: string;
  /** OJ year of the instrument, from its own number (2013/34, (EU) 2026/470...). */
  year: number;
  /** Short OJ reference, e.g. "2026/470". */
  ref: string;
  /** The name a reader recognises — "Omnibus I", "CSRD", "Stop-the-clock". */
  name: string;
  title: string;
}

export interface PendingMark {
  id: string;
  title: string;
  /** Adopted acts carry no OJ number precisely because they are not published yet. */
  note: string;
}

const OJ_NUMBER = /\b(?:\(EU\)\s*)?((?:19|20)\d{2})\/(\d+)/;

/**
 * The reader-facing name of an act, taken from the clause the pack's own source
 * title puts after the em-dash ("Directive (EU) 2026/470 — Omnibus I"). A number
 * like "2026/470" means nothing to a visitor; "Omnibus I" does.
 *
 * The short forms below are trims of those curated titles, not new claims:
 * 2025/794 is the Stop-the-clock Directive (adopted 14 Apr 2025) and 2025/1416
 * the ESRS quick-fix (11 Jul 2025) — both verified against the OJ record.
 */
const SHORTEN: [RegExp, string][] = [
  [/\(host instrument\)/i, ''],
  [/^EU Taxonomy Regulation$/i, 'EU Taxonomy'],
  [/^Taxonomy Article 8 disclosures$/i, 'Taxonomy Art. 8'],
  [/^stop-the-clock$/i, 'Stop-the-clock'],
];

function actName(title: string): string {
  const tail = title.split(/\s+—\s+/)[1] ?? title;
  let name = tail.trim();
  for (const [re, to] of SHORTEN) name = name.replace(re, to).trim();
  return name;
}

/**
 * The live trace's series — the legal record accumulating, act by act.
 *
 * Every mark is a real source in the pack. In-force instruments carry an OJ
 * number, so they can be placed on a year and counted cumulatively: that
 * accumulation IS the sediment the product is named for. Adopted-but-not-in-force
 * acts have no OJ number yet — which is exactly why they are drawn resting above
 * the record rather than raising it (product law 4: pending law never binds).
 */
export function traceSeries(): { acts: ActMark[]; pending: PendingMark[] } {
  const pack = csrdPack();
  const acts: ActMark[] = [];
  const pending: PendingMark[] = [];

  for (const s of pack.sources) {
    const inForce = /^in force/i.test(s.statusAtSnapshot);
    const m = OJ_NUMBER.exec(s.title);
    if (inForce && m) {
      acts.push({ id: s.id, year: Number(m[1]), ref: `${m[1]}/${m[2]}`, name: actName(s.title), title: s.title });
    } else if (/adopted/i.test(s.statusAtSnapshot) && /not in force|pending/i.test(s.statusAtSnapshot)) {
      pending.push({ id: s.id, title: actName(s.title) || s.title, note: 'no OJ number yet' });
    }
  }
  acts.sort((a, b) => a.year - b.year || a.ref.localeCompare(b.ref));
  return { acts, pending };
}

/**
 * The institutions whose records the pack is built from, counted from the
 * sources themselves. This is the honest version of a logo wall: we have no
 * customers to name, but we can say exactly whose official record we read.
 */
export function sourceInstitutions(): { name: string; detail: string; count: number }[] {
  const pack = csrdPack();
  const buckets: Record<string, { name: string; detail: string; count: number }> = {
    eurlex: { name: 'EUR-Lex', detail: 'The Official Journal — the legal record itself', count: 0 },
    commission: { name: 'European Commission', detail: 'Delegated acts, notices and explanatory information', count: 0 },
    efrag: { name: 'EFRAG', detail: 'Standard-setting and implementation guidance', count: 0 },
  };
  for (const s of pack.sources) {
    const host = new URL(s.url).hostname;
    if (host.includes('eur-lex')) buckets.eurlex.count += 1;
    else if (host.includes('efrag')) buckets.efrag.count += 1;
    else if (host.includes('europa.eu')) buckets.commission.count += 1;
  }
  return Object.values(buckets).filter((b) => b.count > 0).sort((a, b) => b.count - a.count);
}
