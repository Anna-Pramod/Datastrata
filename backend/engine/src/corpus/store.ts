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
 * The raw side is read as bytes and hashed as bytes, never as a decoded string.
 * `sha256Raw` covers the bytes as fetched, and re-taking that hash over a
 * decoded-then-re-encoded rendition would apply the same lossy transform as the
 * value it is checking: byte sequences that decode identically (any invalid
 * UTF-8 sequence, for one) would collide, and that whole class of mutation
 * would be invisible to the check. The raw store is also what a future
 * normalizer is re-run over (spec 4.3), so it must be the publisher's bytes
 * rather than a rendition of them.
 */
function readBytesIfPresent(path: string): Buffer | null {
  try {
    return readFileSync(path);
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
    // Bytes for the hash, a separately decoded string for reading and for the
    // reproduction check below. The two must not be collapsed: the check would
    // then share the decode with the value it checks.
    const rawBytes = readBytesIfPresent(resolve(d.rawPath));
    const raw = rawBytes === null ? null : rawBytes.toString('utf8');
    const norm = readIfPresent(resolve(d.normalizedPath));

    if (rawBytes === null) {
      problems.push(`${d.docId}: raw file ${d.rawPath} is missing`);
    } else if (sha256Hex(rawBytes) !== d.sha256Raw) {
      problems.push(`${d.docId}: ${d.rawPath} does not match sha256Raw`);
    }

    if (norm === null) {
      problems.push(`${d.docId}: normalized file ${d.normalizedPath} is missing`);
    } else if (sha256Hex(norm) !== d.sha256Normalized) {
      problems.push(`${d.docId}: ${d.normalizedPath} does not match sha256Normalized`);
    }

    // The pair must be internally consistent: raw bytes plus the named
    // normalizer, run with the document's own recorded selector, must
    // reconstruct the normalized text. A document produced by a different
    // normalizer version is not corrupt — recovering it is the
    // normalizer_changed path, handled in B1b — so the check is skipped there.
    // A document whose selector is recorded but whose stored text was
    // produced without it (or vice versa) fails here, not silently.
    //
    // The version gate is deliberate, and it is also the one switch that can
    // turn this check off: editing normalizerVersion alone disables it while
    // both hash checks still pass, because they hash whatever is on disk. What
    // keeps that from being a hiding place is the real-corpus test in
    // test/corpus-store.test.ts, which asserts that every committed document
    // sits at the current NORMALIZER_VERSION — so the skip is only ever
    // exercised by a document that is genuinely older.
    if (raw !== null && norm !== null && d.normalizerVersion === NORMALIZER_VERSION) {
      try {
        if (normalize(raw, d.contentSelector ?? undefined) !== norm) {
          problems.push(`${d.docId}: ${d.rawPath} does not reproduce ${d.normalizedPath} under normalizer ${NORMALIZER_VERSION}`);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        problems.push(`${d.docId}: ${d.rawPath} does not reproduce ${d.normalizedPath} under normalizer ${NORMALIZER_VERSION} (${message})`);
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

  /**
   * Unreachable while the loop above throws for any document whose file is
   * missing — but the default must not be `''` all the same. An empty haystack
   * is a fail-*open* default in exactly the accessor the absence checker trusts:
   * every `absence` claim would succeed against it. If the invariant ever
   * breaks, this has to be loud.
   */
  const loaded = (cache: Map<string, string>, docId: string, form: string): string => {
    document(docId);
    const text = cache.get(docId);
    if (text === undefined) {
      throw new CorpusIntegrityError([
        `${docId}: ${form} text is not loaded although the corpus passed integrity checks`,
      ]);
    }
    return text;
  };

  return {
    index,
    document,
    normalizedText: (docId) => loaded(normalizedText, docId, 'normalized'),
    rawText: (docId) => loaded(rawText, docId, 'raw'),
  };
}
