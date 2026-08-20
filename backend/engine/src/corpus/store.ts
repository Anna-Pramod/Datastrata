/**
 * Corpus loading and integrity.
 *
 * Every load re-derives the stored hashes from the files on disk, so "the text
 * did not move" is checked rather than trusted. A pinned document that has been
 * edited or removed is an integrity failure with its own error type: in an
 * append-only, git-tracked corpus this cannot happen through ordinary drift,
 * so it must not be filed alongside "the law changed".
 */

import { readFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import type { CorpusDocument, CorpusIndex } from './types';
import { CorpusIntegrityError, parseCorpusIndex, verifyCorpusIntegrity } from './schema';
import { normalize, NORMALIZER_VERSION } from './normalize';
import { sha256Hex } from './hash';

export class CorpusDocumentNotFoundError extends Error {
  constructor(docId: string) {
    super(`Corpus holds no document ${docId}`);
    this.name = 'CorpusDocumentNotFoundError';
  }
}

export interface LoadedCorpus {
  index: CorpusIndex;
  /** Throws CorpusDocumentNotFoundError for an unknown id. */
  document(docId: string): CorpusDocument;
  /** The text agents read. */
  normalizedText(docId: string): string;
  /** The bytes as fetched, decoded as UTF-8. */
  rawText(docId: string): string;
}

function readIfPresent(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

/**
 * Reads and validates a corpus directory. `corpusDir` contains index.json and
 * the raw/ and normalized/ trees; document paths are resolved relative to it.
 */
export function loadCorpus(corpusDir: string): LoadedCorpus {
  const indexRaw = readIfPresent(join(corpusDir, 'index.json'));
  if (indexRaw === null) {
    throw new CorpusIntegrityError([`no index.json under ${corpusDir}`]);
  }

  const index = parseCorpusIndex(JSON.parse(indexRaw));
  verifyCorpusIntegrity(index);

  const resolve = (p: string): string => (isAbsolute(p) ? p : join(corpusDir, p));

  const problems: string[] = [];
  const rawText = new Map<string, string>();
  const normalizedText = new Map<string, string>();

  for (const d of index.documents) {
    const raw = readIfPresent(resolve(d.rawPath));
    const norm = readIfPresent(resolve(d.normalizedPath));

    if (raw === null) {
      problems.push(`${d.docId}: raw file ${d.rawPath} is missing`);
    } else if (sha256Hex(raw) !== d.sha256Raw) {
      problems.push(`${d.docId}: ${d.rawPath} does not match sha256Raw`);
    }

    if (norm === null) {
      problems.push(`${d.docId}: normalized file ${d.normalizedPath} is missing`);
    } else if (sha256Hex(norm) !== d.sha256Normalized) {
      problems.push(`${d.docId}: ${d.normalizedPath} does not match sha256Normalized`);
    }

    // The pair must be internally consistent: raw bytes plus the named
    // normalizer must reconstruct the normalized text. A document produced by a
    // different normalizer version is not corrupt — recovering it is the
    // normalizer_changed path, handled in B1b — so the check is skipped there.
    if (raw !== null && norm !== null && d.normalizerVersion === NORMALIZER_VERSION) {
      if (normalize(raw) !== norm) {
        problems.push(`${d.docId}: ${d.rawPath} does not reproduce ${d.normalizedPath} under normalizer ${NORMALIZER_VERSION}`);
      }
    }

    if (raw !== null) rawText.set(d.docId, raw);
    if (norm !== null) normalizedText.set(d.docId, norm);
  }

  if (problems.length > 0) throw new CorpusIntegrityError(problems);

  const byId = new Map(index.documents.map((d) => [d.docId, d]));

  const document = (docId: string): CorpusDocument => {
    const d = byId.get(docId);
    if (d === undefined) throw new CorpusDocumentNotFoundError(docId);
    return d;
  };

  return {
    index,
    document,
    normalizedText: (docId) => {
      document(docId);
      return normalizedText.get(docId) ?? '';
    },
    rawText: (docId) => {
      document(docId);
      return rawText.get(docId) ?? '';
    },
  };
}
