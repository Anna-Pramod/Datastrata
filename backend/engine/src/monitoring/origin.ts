/**
 * Origin-declaration semantics: canonical form, and what a declaration covers.
 *
 * The register declares which origins a source has authorised to carry its
 * documents (`authorisedOrigins`). Two places need to agree about what those
 * declarations *mean*: the register schema, which refuses two spellings of one
 * permission, and the corpus authority validator, which decides whether a
 * document's recorded origin is covered. One definition, imported by both —
 * two would drift, and the drift would be invisible until they disagreed about
 * a document that mattered.
 *
 * **Pure, and dependency-free on purpose.** Nothing here reads a pack, a
 * register row's prose, or a source's tier. Whether a source may be *cited* is
 * a different axis owned elsewhere; this module only answers whether a URL is
 * covered by a declaration.
 *
 * # What a match means
 *
 * That the source has authorised the origin a document **records**. Not that
 * the bytes came from there: a local actor able to edit the corpus can edit the
 * recorded url and the hashes together. That stronger claim is envelope E2's
 * and is made nowhere here.
 *
 * # Why parsed, never string-compared
 *
 * `href.startsWith(declared)` is wrong three ways at once, and each has a
 * shipped-defect flavour: it makes `…/2013/345` a match for `…/2013/34`, it
 * treats `https://HOST/x` and `https://host/x` as different permissions, and it
 * lets a query or fragment ride along into the comparison. The URL parser
 * settles host case and a default `:443`; the trailing slash is settled below;
 * and the segment boundary is enforced explicitly.
 */

/** A declaration as the register carries it. */
export interface OriginDeclaration {
  kind: 'exact' | 'path_prefix';
  url: string;
}

/**
 * The declaration path, trailing slash removed except at the root.
 *
 * Case is preserved: URL paths are case-sensitive, and lowercasing one would
 * silently authorise a surface nobody declared.
 */
export function canonicalOriginPath(parsed: URL): string {
  const path = parsed.pathname;
  return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
}

/**
 * The identity two declarations share when they authorise the same surface.
 *
 * Used by the register schema to refuse duplicates. `https://EUR-LEX…:443/x/`
 * and `https://eur-lex…/x` are one permission, and a row holding both would
 * report two authorised surfaces where there is one.
 */
export function canonicalOriginKey(kind: string, url: string): string {
  const parsed = new URL(url);
  return `${kind} ${parsed.origin}${canonicalOriginPath(parsed)}`;
}

/**
 * Does this declaration authorise this recorded URL?
 *
 * `exact` — one document: same origin, same canonical path.
 * `path_prefix` — anything beneath a path: same origin, and the candidate path
 * either equals the declared one or continues it after a `/`. The boundary is
 * what keeps `/eli/dir/2013/34` from authorising `/eli/dir/2013/345`.
 *
 * A candidate's query and fragment do not participate. These two matchers
 * compare path identity, so a query cannot create a different permission under
 * them. That is a statement about *these* matchers and not a claim that queries
 * are never semantic: a source whose document identity genuinely turns on a
 * query needs a new declared matcher kind, not a loosening of these two.
 */
export function originAuthorises(declaration: OriginDeclaration, candidateUrl: string): boolean {
  let declared: URL;
  let candidate: URL;
  try {
    declared = new URL(declaration.url);
    candidate = new URL(candidateUrl);
  } catch {
    // An unparseable side authorises nothing. Both are schema-validated as
    // URLs upstream, so this is a floor rather than a path with a caller.
    return false;
  }
  if (declared.origin !== candidate.origin) return false;

  const declaredPath = canonicalOriginPath(declared);
  const candidatePath = canonicalOriginPath(candidate);
  if (declaration.kind === 'exact') return candidatePath === declaredPath;
  return candidatePath === declaredPath || candidatePath.startsWith(`${declaredPath}/`);
}
