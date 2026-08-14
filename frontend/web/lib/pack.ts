/**
 * Server-side access to the real CSRD knowledge pack.
 *
 * The pack is loaded through the engine's own loader, so the site gets the same
 * validated, referentially-checked content the CLI and tests get. Load failures
 * are not swallowed: if the content firewall rejects the pack, the checker must
 * fail loudly rather than answer from a half-loaded record.
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
