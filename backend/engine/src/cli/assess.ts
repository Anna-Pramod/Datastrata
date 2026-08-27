/**
 * CLI: run an assessment against a profile JSON and print the cited
 * determination report (the first sellable artifact, Pass 3 §10 step 6).
 *
 *   npm run assess -- examples/p001-eu-standalone.json
 *   npm run assess -- examples/p004-exempt-subsidiary.json --json
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPack } from '../knowledge/loader';
import { assess } from '../engine/evaluate';
import type { AssessmentContext, Determination, Profile } from '../types';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');

const args = process.argv.slice(2).filter((a) => a !== '--');
const profilePath = args.find((a) => !a.startsWith('--'));
const asJson = args.includes('--json');

if (!profilePath) {
  console.error('Usage: npm run assess -- <profile.json> [--json]');
  process.exit(1);
}

const pack = loadPack(join(root, 'knowledge', 'csrd'));
const input = JSON.parse(readFileSync(profilePath, 'utf8')) as { profile: Profile; context: AssessmentContext };
const result = assess(pack, input.profile, input.context);

if (asJson) {
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

const icon = (r: Determination['result']) => (r === 'APPLIES' ? '●' : r === 'DOES_NOT_APPLY' ? '○' : '◐');
const srcUrl = (id: string) => pack.sources.find((s) => s.id === id)?.url ?? '';

const lines: string[] = [];
lines.push(`# DataStrata ${pack.program} scope report`);
lines.push('');
lines.push(`Subject: ${input.profile.scopeObjects.find((o) => o.id === input.context.subjectId)?.name ?? input.context.subjectId}`);
lines.push(`Assessed: ${input.context.assessmentDate} · FY ${input.context.financialYear.start} → ${input.context.financialYear.end}`);
lines.push(`Knowledge pack: ${pack.id}@${pack.version} · legal snapshot ${pack.legalSnapshot}`);
if (result.containsDraftContent) {
  lines.push('');
  lines.push('> **PROTOTYPE — UNRATIFIED CONTENT.** These determinations are built on draft requirement records that have not been expert-ratified. Not for customer reliance.');
}
lines.push('');
lines.push(`## Summary`);
lines.push('');
lines.push(result.summary.headline);
lines.push('');
lines.push(`## Determinations (requirement-level — the authoritative output)`);
lines.push('');
for (const d of result.determinations.sort((a, b) => a.requirementId.localeCompare(b.requirementId))) {
  const sel = d.selected ? ` → ${d.selected}` : '';
  const why = d.reason ? ` (${d.reason})` : '';
  lines.push(`- ${icon(d.result)} **${d.requirementId}** ${d.requirementTitle} — ${d.scopeName}: **${d.result}**${sel}${why} [${d.relationshipClass}]`);
  lines.push(`  sources: ${d.sources.map((s) => `${s} <${srcUrl(s)}>`).join('; ')}${d.locators.length > 0 ? ` — ${d.locators.join('; ')}` : ''}`);
  if (d.result !== 'DOES_NOT_APPLY' && d.caution) lines.push(`  caution: ${d.caution}`);
}
lines.push('');
if (result.obligations.length > 0) {
  lines.push(`## Obligations instantiated (${result.obligations.length})`);
  lines.push('');
  for (const o of result.obligations) {
    lines.push(`- **${o.templateId}** ${o.obligation}`);
    lines.push(`  scope: ${o.scopeName} · owner: ${o.defaultOwnerRole} · deadline: ${o.deadlineLogic} · from: ${o.derivedFrom.join(', ')}`);
  }
  lines.push('');
}
if (result.gaps.length > 0) {
  lines.push(`## Gap ledger`);
  lines.push('');
  for (const g of result.gaps.filter((g) => g.status !== 'satisfied')) {
    lines.push(`- [${g.priority.toUpperCase()}] ${g.readinessTest} — ${g.status}. First action: ${g.firstAction}`);
  }
  lines.push('');
}
lines.push(`## Next questions (compiled from unresolved requirements)`);
lines.push('');
for (const q of result.nextQuestions.slice(0, 5)) {
  const blocked = q.blockedDeterminations.length > 0 ? ` — unblocks: ${q.blockedDeterminations.join(', ')}` : '';
  lines.push(`- ${q.question.id} [${q.question.module}] ${q.question.text}${blocked}`);
}
lines.push('');
lines.push(`## Change watch (pending law — does NOT alter today's determinations)`);
lines.push('');
for (const w of result.changeWatch) {
  lines.push(`- ${w.id} ${w.title} — ${w.status}${w.expected ? ` · ${w.expected}` : ''}`);
}
lines.push('');
lines.push(`_Every determination above carries a full derivation trace (run with --json to inspect). Nothing here is a final legal conclusion while national-law status is unresolved._`);

console.log(lines.join('\n'));
