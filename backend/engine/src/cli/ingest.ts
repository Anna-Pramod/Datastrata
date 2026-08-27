/**
 * Corpus ingest — the only component that touches the network.
 *
 * Everything downstream of the received bytes is deterministic and tested from
 * fixtures: bytes to normalization to hashing to a validated index entry. The
 * fetch itself is not, which is why it is isolated here rather than spread
 * through the verification code.
 *
 * Ingest does NOT discover legal relationships. Edges are either supplied by a
 * human and validated, or derived from published ELI/CELEX metadata. Working
 * out that one instrument amends another by reading them is a legal judgment,
 * and putting it inside the agent-free layer would smuggle reasoning into the
 * one part of the system whose value is that it contains none.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { CorpusDocument, CorpusEdge, CorpusIndex } from '../corpus/types';
import { parseCorpusIndex, verifyCorpusIntegrity } from '../corpus/schema';
import { assertCorpusAuthority } from '../corpus/authority';
import { loadPackContext } from '../knowledge/loader';
import { normalize, NORMALIZER_VERSION } from '../corpus/normalize';
import { sha256Hex } from '../corpus/hash';

export interface IngestInput {
  docId: string;
  /** Filename stem for both stored forms. */
  slug: string;
  serves: string[];
  title: string;
  url: string;
  versionLabel: string;
  /** ISO date. Passed in, never read from the clock here. */
  retrievedOn: string;
  /**
   * The bytes exactly as fetched. Bytes, not a decoded string: `sha256Raw`
   * covers what the publisher served, and what lands under `rawPath` is what a
   * future normalizer gets re-run over. Hashing and storing a decoded rendition
   * would pin something the publisher never served.
   */
  rawBytes: Uint8Array;
  /** `#id` region to scope extraction to. Omitted means the whole document. */
  contentSelector?: string;
  edges: CorpusEdge[];
}

/**
 * Bytes to a validated index entry. Throws if the result would not satisfy the
 * schema, so an invalid entry can never reach index.json. Also throws (via
 * `normalize`) when `contentSelector` is given but does not match anything in
 * the decoded text -- there is no silent fallback to the whole document, so
 * nothing downstream ever writes a document under a selector that does not
 * describe how its text was actually derived.
 *
 * The bytes are hashed as bytes and decoded separately for normalization, so
 * the stored raw form and the hash over it are the fetched bytes themselves.
 */
export function buildDocumentEntry(input: IngestInput): {
  entry: CorpusDocument;
  rawBytes: Uint8Array;
  normalizedText: string;
} {
  const decoded = new TextDecoder().decode(input.rawBytes);
  const normalizedText = normalize(decoded, input.contentSelector);

  const entry: CorpusDocument = {
    docId: input.docId,
    serves: input.serves,
    title: input.title,
    url: input.url,
    versionLabel: input.versionLabel,
    retrievedOn: input.retrievedOn,
    rawPath: `raw/${input.slug}.html`,
    normalizedPath: `normalized/${input.slug}.txt`,
    sha256Raw: sha256Hex(input.rawBytes),
    sha256Normalized: sha256Hex(normalizedText),
    normalizerVersion: NORMALIZER_VERSION,
    contentSelector: input.contentSelector ?? null,
    edges: input.edges,
  };

  // Validate the single entry immediately; a bad row never reaches the index.
  parseCorpusIndex({ updated: input.retrievedOn, documents: [entry] });

  return { entry, rawBytes: input.rawBytes, normalizedText };
}

/**
 * Adds or replaces a document, keeping the index sorted for clean diffs.
 *
 * `updated` only ever moves forward: re-ingesting a document with an earlier
 * `--retrieved-on` than the index already carries must not rewind the
 * index-level date, since the later retrieval genuinely happened.
 */
export function mergeIntoIndex(index: CorpusIndex, entry: CorpusDocument): CorpusIndex {
  const documents = index.documents.filter((d) => d.docId !== entry.docId);
  documents.push(entry);
  documents.sort((a, b) => (a.docId < b.docId ? -1 : a.docId > b.docId ? 1 : 0));
  // ISO dates order lexically, so a plain comparison is the date comparison.
  const updated = index.updated > entry.retrievedOn ? index.updated : entry.retrievedOn;
  return { updated, documents };
}

interface FetchOutcome {
  ok: boolean;
  bytes: Uint8Array;
  error?: string;
}

/** A failed fetch is recorded as unreachable. It is never treated as empty. */
async function fetchDocument(url: string): Promise<FetchOutcome> {
  const empty = new Uint8Array(0);
  try {
    const response = await fetch(url, { headers: { accept: 'text/html,text/plain' } });
    if (!response.ok) {
      return { ok: false, bytes: empty, error: `HTTP ${response.status} ${response.statusText}` };
    }
    // arrayBuffer, not text: the store pins the bytes as served.
    return { ok: true, bytes: Buffer.from(await response.arrayBuffer()) };
  } catch (err) {
    return { ok: false, bytes: empty, error: err instanceof Error ? err.message : String(err) };
  }
}

function usage(): never {
  console.error(
    [
      'Usage:',
      '  npm run ingest -- --url <url> --doc-id <DOC-...> --slug <stem> \\',
      '    --serves SRC-001[,SRC-004] --title "<title>" --version-label "<label>" \\',
      '    --retrieved-on YYYY-MM-DD --pack-dir <dir> [--corpus-dir <dir>] \\',
      '    [--register-dir <dir>] [--edges <edges.json>] [--content-selector "#id"]',
      '',
      '--pack-dir names the pack whose source register governs this ingestion.',
      'A document may only be written for a source that has authorised the origin',
      'it was fetched from, and the register is where a source says so. The',
      'register defaults to <pack-dir>/../../monitoring, the same convention',
      'loadPack uses.',
      '',
      'Edges, when supplied, are a JSON array of CorpusEdge objects. Each needs a',
      'complete provenance block. Ingest validates them; it does not invent them.',
      '',
      '--content-selector scopes extraction to one element (v0 supports a bare',
      '"#id" only). A selector that does not match the fetched document is an',
      'error: nothing is written, rather than silently falling back to the whole',
      'document.',
    ].join('\n'),
  );
  process.exit(2);
}

/**
 * A value that looks like another flag means this flag was given without one.
 * `--version-label --retrieved-on 2026-08-20` would otherwise write
 * `versionLabel: "--retrieved-on"` into index.json — and versionLabel is one of
 * the five fields a signature pins (spec 4.2), with no downstream pattern to
 * catch it the way `--doc-id` has. Treating it as missing sends it to usage().
 */
function arg(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return undefined;
  const value = argv[i + 1];
  if (value === undefined || value.startsWith('--')) return undefined;
  return value;
}

export async function main(argv: string[]): Promise<void> {
  const url = arg(argv, 'url');
  const docId = arg(argv, 'doc-id');
  const slug = arg(argv, 'slug');
  const serves = arg(argv, 'serves');
  const title = arg(argv, 'title');
  const versionLabel = arg(argv, 'version-label');
  const retrievedOn = arg(argv, 'retrieved-on');
  const corpusDir = arg(argv, 'corpus-dir') ?? 'corpus';
  const packDir = arg(argv, 'pack-dir');
  const registerDir = arg(argv, 'register-dir') ?? (packDir ? join(packDir, '..', '..', 'monitoring') : undefined);
  const edgesPath = arg(argv, 'edges');
  const contentSelector = arg(argv, 'content-selector');

  if (!url || !docId || !slug || !serves || !title || !versionLabel || !retrievedOn) usage();
  // Required, not defaulted. Ingestion writes corpus state that later becomes
  // model-visible evidence, and the authority governing it is not something to
  // guess at: without a pack there is no source universe and no register, so
  // there is no question this command could answer about what it is writing.
  if (!packDir || !registerDir) usage();

  const edges: CorpusEdge[] = edgesPath ? JSON.parse(readFileSync(edgesPath, 'utf8')) : [];

  const outcome = await fetchDocument(url);
  if (!outcome.ok) {
    console.error(`UNREACHABLE ${url}: ${outcome.error}`);
    console.error('Nothing was written. An unreachable source is not a source that said nothing.');
    process.exit(1);
  }

  let built: ReturnType<typeof buildDocumentEntry>;
  try {
    built = buildDocumentEntry({
      docId,
      slug,
      serves: serves.split(',').map((s) => s.trim()),
      title,
      url,
      versionLabel,
      retrievedOn,
      rawBytes: outcome.bytes,
      contentSelector,
      edges,
    });
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    console.error('Nothing was written.');
    process.exit(1);
  }
  const { entry, rawBytes, normalizedText } = built;

  const indexPath = join(corpusDir, 'index.json');
  let index: CorpusIndex;
  try {
    index = parseCorpusIndex(JSON.parse(readFileSync(indexPath, 'utf8')));
  } catch {
    index = { updated: retrievedOn, documents: [] };
  }

  const merged = mergeIntoIndex(index, entry);
  verifyCorpusIntegrity(merged);

  // The authority preflight, and its position is the whole point.
  //
  // `merged` is the complete candidate state and nothing durable has happened
  // yet: the first filesystem mutation is the `mkdirSync` below. So a refusal
  // here leaves the corpus exactly as it was — no partial document, no
  // directory created, nothing to roll back. Validating after writing and
  // undoing would be a different and weaker promise, and one this command
  // already refuses to make elsewhere ("Nothing was written").
  //
  // It runs the same validator the load path will: one matcher, not an
  // ingest-specific copy. The origin it checks is `entry.url`, which is the
  // `--url` this command actually fetched — not a second, separately supplied
  // value that could disagree with what was retrieved.
  //
  // What it proves is that the source has authorised that origin. Not that the
  // bytes came from there — this process fetched them, but the corpus it writes
  // cannot later prove that, and nothing downstream should read the check as
  // saying so.
  //
  // **Authority comes through `loadPackContext`, and the object identity is the
  // point.** That loader refuses a missing register, parses it exactly once,
  // proves it describes this pack (program, requirement and source ids), then
  // applies citability — and hands back *that* register. The origin question
  // below is therefore decided by the same in-memory object whose integrity was
  // checked against this pack.
  //
  // Re-reading the file here would break that, and "same path" would not repair
  // it: a path is not bytes, and a second parse is a second object nothing
  // vouched for. There is deliberately no second read.
  //
  // Citability stays where it is. The loader decides whether a requirement may
  // *cite* a source; this decides whether an artefact may *serve* one. A corpus
  // may hold documents for sources nothing cites, so the second question cannot
  // be answered by the first.
  try {
    const { pack, sourceRegister } = loadPackContext(packDir, { sourceRegisterDir: registerDir });
    assertCorpusAuthority(merged, sourceRegister, pack);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    console.error('Nothing was written.');
    process.exit(1);
  }

  // The raw side is written as bytes so what is stored is what was served;
  // the normalized side is text this process produced, so it is written as
  // UTF-8.
  const rawOut = join(corpusDir, entry.rawPath);
  mkdirSync(dirname(rawOut), { recursive: true });
  writeFileSync(rawOut, rawBytes);

  const normalizedOut = join(corpusDir, entry.normalizedPath);
  mkdirSync(dirname(normalizedOut), { recursive: true });
  writeFileSync(normalizedOut, normalizedText, 'utf8');
  mkdirSync(dirname(indexPath), { recursive: true });
  writeFileSync(indexPath, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');

  console.log(`Ingested ${entry.docId}`);
  console.log(`  raw        ${entry.rawPath}  ${entry.sha256Raw.slice(0, 12)}\u2026`);
  console.log(`  normalized ${entry.normalizedPath}  ${entry.sha256Normalized.slice(0, 12)}\u2026`);
  console.log(`  selector   ${entry.contentSelector ?? '(none: whole document)'}`);
  console.log(`  edges      ${entry.edges.length}`);
  if (entry.edges.length === 0) {
    console.log('  No edges recorded. Ingest does not infer them \u2014 supply them with --edges.');
  }
}

const invokedDirectly = process.argv[1] !== undefined && process.argv[1].endsWith('ingest.ts');
if (invokedDirectly) {
  await main(process.argv.slice(2));
}
