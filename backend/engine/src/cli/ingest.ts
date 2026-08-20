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
  rawText: string;
  /** `#id` region to scope extraction to. Omitted means the whole document. */
  contentSelector?: string;
  edges: CorpusEdge[];
}

/**
 * Bytes to a validated index entry. Throws if the result would not satisfy the
 * schema, so an invalid entry can never reach index.json. Also throws (via
 * `normalize`) when `contentSelector` is given but does not match anything in
 * `rawText` -- there is no silent fallback to the whole document, so nothing
 * downstream ever writes a document under a selector that does not describe
 * how its text was actually derived.
 */
export function buildDocumentEntry(input: IngestInput): {
  entry: CorpusDocument;
  rawText: string;
  normalizedText: string;
} {
  const normalizedText = normalize(input.rawText, input.contentSelector);

  const entry: CorpusDocument = {
    docId: input.docId,
    serves: input.serves,
    title: input.title,
    url: input.url,
    versionLabel: input.versionLabel,
    retrievedOn: input.retrievedOn,
    rawPath: `raw/${input.slug}.html`,
    normalizedPath: `normalized/${input.slug}.txt`,
    sha256Raw: sha256Hex(input.rawText),
    sha256Normalized: sha256Hex(normalizedText),
    normalizerVersion: NORMALIZER_VERSION,
    contentSelector: input.contentSelector ?? null,
    edges: input.edges,
  };

  // Validate the single entry immediately; a bad row never reaches the index.
  parseCorpusIndex({ updated: input.retrievedOn, documents: [entry] });

  return { entry, rawText: input.rawText, normalizedText };
}

/** Adds or replaces a document, keeping the index sorted for clean diffs. */
export function mergeIntoIndex(index: CorpusIndex, entry: CorpusDocument): CorpusIndex {
  const documents = index.documents.filter((d) => d.docId !== entry.docId);
  documents.push(entry);
  documents.sort((a, b) => (a.docId < b.docId ? -1 : a.docId > b.docId ? 1 : 0));
  return { updated: entry.retrievedOn, documents };
}

interface FetchOutcome {
  ok: boolean;
  text: string;
  error?: string;
}

/** A failed fetch is recorded as unreachable. It is never treated as empty. */
async function fetchDocument(url: string): Promise<FetchOutcome> {
  try {
    const response = await fetch(url, { headers: { accept: 'text/html,text/plain' } });
    if (!response.ok) {
      return { ok: false, text: '', error: `HTTP ${response.status} ${response.statusText}` };
    }
    return { ok: true, text: await response.text() };
  } catch (err) {
    return { ok: false, text: '', error: err instanceof Error ? err.message : String(err) };
  }
}

function usage(): never {
  console.error(
    [
      'Usage:',
      '  npm run ingest -- --url <url> --doc-id <DOC-...> --slug <stem> \\',
      '    --serves SRC-001[,SRC-004] --title "<title>" --version-label "<label>" \\',
      '    --retrieved-on YYYY-MM-DD [--corpus-dir <dir>] [--edges <edges.json>] \\',
      '    [--content-selector "#id"]',
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

function arg(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return undefined;
  return argv[i + 1];
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
  const edgesPath = arg(argv, 'edges');
  const contentSelector = arg(argv, 'content-selector');

  if (!url || !docId || !slug || !serves || !title || !versionLabel || !retrievedOn) usage();

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
      rawText: outcome.text,
      contentSelector,
      edges,
    });
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    console.error('Nothing was written.');
    process.exit(1);
  }
  const { entry, rawText, normalizedText } = built;

  const indexPath = join(corpusDir, 'index.json');
  let index: CorpusIndex;
  try {
    index = parseCorpusIndex(JSON.parse(readFileSync(indexPath, 'utf8')));
  } catch {
    index = { updated: retrievedOn, documents: [] };
  }

  const merged = mergeIntoIndex(index, entry);
  verifyCorpusIntegrity(merged);

  for (const [path, contents] of [
    [join(corpusDir, entry.rawPath), rawText],
    [join(corpusDir, entry.normalizedPath), normalizedText],
  ] as const) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents, 'utf8');
  }
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
