/**
 * `src/verification/` stays pure — as far as the rules below reach, and no
 * further.
 *
 * CLAUDE.md and the plan's global constraints say the verification modules
 * read nothing themselves: no filesystem, network or clock, the CLIs doing the
 * reading and handing values in. Until this file nothing checked it, and a
 * property nothing checks is a comment (failure mode 6). The evidence-validity
 * tier makes it matter more: a measurement that could reach for the corpus on
 * disk on its own would measure whatever it found there rather than the corpus
 * the run authorised. This header states every rule the file enforces and
 * names what it leaves out; it claims nothing else.
 *
 * **What is scanned.** Every entry of `src/verification/`, one level deep. The
 * directory must hold only regular `.ts` files — no subdirectory, and no
 * `.mts`, `.cts`, `.tsx`, `.js` or other file or link — so nothing escapes a
 * scan that reads `*.ts`. The one exception is the completeness check's ignore
 * list, which is exactly `.DS_Store`: Finder leaves it in directories it has
 * shown, it holds no code, and `.gitignore` keeps it out of the repository, so
 * without the exception `npm test` would fail on macOS for no reason in the
 * code. **Extending the ignore list is a reviewed change,** as extending the
 * allowlist below is. The scanned list must include `sign.ts` and
 * `evidence-validity.ts`. Each file is parsed with the TypeScript parser — an
 * existing devDependency, used here at test time only — so module specifiers,
 * calls and identifiers are matched as syntax, never as bare text: a comment
 * or a string that spells `require('fs')` or `Date.now()` is neither an import
 * nor a reference, and an object key spelled `node:` is not a specifier.
 *
 * **Module rules,** over every import and re-export form, `import type`
 * included unless a rule says otherwise:
 *
 *   - no `node:*` specifier, and not the bare `fs` and `path` modules or their
 *     subpaths;
 *   - no `require(` and no `import(`, whatever they name — neither is how this
 *     directory loads a module;
 *   - `../corpus/store`, which reads the filesystem, only through a
 *     declaration-level `import type` or `export type`. A mixed
 *     `import { type A, b }` is a value import, and so is `import { type A }`:
 *     whether it survives emission depends on compiler settings the source
 *     does not carry, so only the form that is erased by definition is
 *     admitted;
 *   - every reference that is not declaration-level type-only names a sibling
 *     (`./name`) or a module on `VALUE_IMPORT_ALLOWLIST`, and every entry of
 *     that list is value-imported by some file. **Extending the list is a
 *     reviewed change:** an entry is a judgment that the module is fit to be
 *     reached from a pure directory, which no rule here can make.
 *
 * **Global rules.** No value-position reference to a global that reaches the
 * clock, the network or the process environment: `Date`, `performance`,
 * `setTimeout`, `setInterval`, `setImmediate`, `fetch`, `XMLHttpRequest`,
 * `WebSocket` and `process`. A property name — `x.fetch`, a key `Date:`, a
 * member named `fetch` — is not a reference, and a destructured property
 * renamed away (`{ fetch: get }`) is not a reference; a shorthand `{ fetch }`
 * binds a local of that name and is flagged, as any local that shadows a listed
 * global is. A type — `: Date`, `typeof process` in a type, an interface's
 * `extends Date`, a class's `implements WebSocket` — is not a reference. A
 * class's `extends Date` is, and so is an instantiation expression
 * (`setTimeout<[]>`), whose expression is the value itself. The match is by
 * name, not by scope, so a local binding that shadows one of these names is
 * flagged too.
 *
 * Each rule is applied on its own, and a violation names the file, the line,
 * the specifier or global, and every rule it breaks.
 *
 * **Out of scope.**
 *
 *   - Transitive imports. The scan reads each file's own statements, not the
 *     module graph: `sign.ts` and others import `../corpus/hash`, which
 *     imports `node:crypto`, and nothing outside this directory is scanned at
 *     all. What an allowlisted module does is admitted by the review that
 *     listed it.
 *   - Anything the rules do not list: a global reached through an object
 *     (`globalThis.fetch`, `globalThis['Date']`), and any global not named
 *     above (`crypto`, `Math.random`, `queueMicrotask`, `eval`, `Function`).
 *
 * **The scanner is tested before it is trusted.** An empty list passes as
 * easily against a check that sees nothing, so each rule has a synthetic
 * control, and the real-directory assertions call the same helpers:
 *
 *   - each module and global rule a synthetic source it must flag, and each
 *     look-alike a synthetic source it must not;
 *   - the stale-allowlist rule synthetic references that leave an entry
 *     unused, including one named only by `import type`, and references that
 *     leave none;
 *   - the no-subdirectory rule a synthetic listing whose directory it must
 *     report, and nothing else in it;
 *   - the file rule a synthetic listing it must fault, and one whose
 *     `.DS_Store` it must pass over while still faulting the files beside it;
 *   - the scan's aggregation of violations two synthetic sources, one clean
 *     and one with a forbidden import, through the same `scanSources` the real
 *     directory is read into, which must report the second's violation and
 *     nothing of the first;
 *   - and the real directory scan must see the imports it is known to hold.
 *
 * Two assertions are made over the real directory only, because they are
 * facts about it rather than rules a scanner applies: that the scan read every
 * `.ts` file the listing holds, and that `sign.ts` and `evidence-validity.ts`
 * are among them.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const verificationDir = join(here, '..', 'src', 'verification');

// ---------------------------------------------------------------------------
// The scanner
// ---------------------------------------------------------------------------

type Form =
  | 'import from'
  | 'side-effect import'
  | 'export from'
  | 'import-equals require'
  | 'require call'
  | 'dynamic import'
  | 'type-position import';

interface ModuleReference {
  form: Form;
  specifier: string;
  /** Erased by definition: `import type …` or `export type … from`. */
  typeOnly: boolean;
  line: number;
}

/**
 * Every module a verification file may value-import other than a sibling: the
 * set in use when this list was written. Extending it is a reviewed change —
 * see the header.
 */
const VALUE_IMPORT_ALLOWLIST: readonly string[] = [
  'zod',
  '../corpus/evidence',
  '../corpus/hash',
  '../corpus/ranges',
  '../corpus/schema',
  '../knowledge/schema',
];

/** A module in this same directory: `./name`, one segment, not `./..`. */
const SIBLING = /^\.\/[^./][^/]*$/;

/** The globals the global rules forbid, and what each one reaches. */
const FORBIDDEN_GLOBALS: ReadonlyMap<string, string> = new Map([
  ['Date', 'the clock'],
  ['performance', 'the clock'],
  ['setTimeout', 'the clock'],
  ['setInterval', 'the clock'],
  ['setImmediate', 'the clock'],
  ['fetch', 'the network'],
  ['XMLHttpRequest', 'the network'],
  ['WebSocket', 'the network'],
  ['process', 'the process environment'],
]);

/** Every module a source file names, as the parser sees it. */
function referencesOf(fileName: string, source: string): ModuleReference[] {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const found: ModuleReference[] = [];
  const lineOf = (node: ts.Node): number => file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
  const named = (node: ts.Node | undefined): string =>
    node !== undefined && ts.isStringLiteralLike(node) ? node.text : '<computed>';

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && node.importClause !== undefined) {
      found.push({ form: 'import from', specifier: named(node.moduleSpecifier), typeOnly: node.importClause.isTypeOnly, line: lineOf(node) });
    }
    if (ts.isImportDeclaration(node) && node.importClause === undefined) {
      found.push({ form: 'side-effect import', specifier: named(node.moduleSpecifier), typeOnly: false, line: lineOf(node) });
    }
    if (ts.isExportDeclaration(node) && node.moduleSpecifier !== undefined) {
      found.push({ form: 'export from', specifier: named(node.moduleSpecifier), typeOnly: node.isTypeOnly, line: lineOf(node) });
    }
    if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      found.push({ form: 'import-equals require', specifier: named(node.moduleReference.expression), typeOnly: node.isTypeOnly, line: lineOf(node) });
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'require') {
      found.push({ form: 'require call', specifier: named(node.arguments[0]), typeOnly: false, line: lineOf(node) });
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      found.push({ form: 'dynamic import', specifier: named(node.arguments[0]), typeOnly: false, line: lineOf(node) });
    }
    if (ts.isImportTypeNode(node)) {
      const literal = ts.isLiteralTypeNode(node.argument) ? node.argument.literal : undefined;
      found.push({ form: 'type-position import', specifier: named(literal), typeOnly: true, line: lineOf(node) });
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

/** Whether an identifier names a property or a member rather than a value in scope. */
function namesAMember(node: ts.Identifier): boolean {
  const parent = node.parent;
  if (ts.isPropertyAccessExpression(parent)) return parent.name === node;
  if (ts.isQualifiedName(parent)) return parent.right === node;
  if (ts.isBindingElement(parent)) return parent.propertyName === node;
  if (
    ts.isPropertyAssignment(parent) ||
    ts.isPropertySignature(parent) ||
    ts.isPropertyDeclaration(parent) ||
    ts.isMethodDeclaration(parent) ||
    ts.isMethodSignature(parent) ||
    ts.isGetAccessorDeclaration(parent) ||
    ts.isSetAccessorDeclaration(parent) ||
    ts.isEnumMember(parent)
  ) {
    return parent.name === node;
  }
  return false;
}

/**
 * Whether a node is a type, and so names nothing at run time. The parser calls
 * every `ExpressionWithTypeArguments` a type, but it is one only in a heritage
 * clause that is not a class's `extends`: an interface's `extends` or a class's
 * `implements`. A class's `extends` names the value it inherits from, and
 * anywhere outside a heritage clause the node is an instantiation expression
 * (`setTimeout<[]>`), whose expression is a value.
 */
function isTypePosition(node: ts.Node): boolean {
  if (!ts.isTypeNode(node)) return false;
  if (!ts.isExpressionWithTypeArguments(node)) return true;
  if (!ts.isHeritageClause(node.parent)) return false;
  const classExtends = node.parent.token === ts.SyntaxKind.ExtendsKeyword && ts.isClassLike(node.parent.parent);
  return !classExtends;
}

/** Every value-position reference to a forbidden global, by name and line. */
function globalsOf(fileName: string, source: string): Array<{ name: string; line: number }> {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const found: Array<{ name: string; line: number }> = [];
  const lineOf = (node: ts.Node): number => file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;

  const visit = (node: ts.Node): void => {
    if (isTypePosition(node)) return;
    if (ts.isIdentifier(node) && FORBIDDEN_GLOBALS.has(node.text) && !namesAMember(node)) {
      found.push({ name: node.text, line: lineOf(node) });
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

/** Why a reference is forbidden, one reason per rule it breaks; empty when it is allowed. */
function reasonsAgainst(reference: ModuleReference): string[] {
  const reasons: string[] = [];
  if (reference.specifier.startsWith('node:')) reasons.push('names a Node built-in');
  if (/^(?:fs|path)(?:\/|$)/.test(reference.specifier)) reasons.push('names the bare fs or path module');
  if (/^\.\.\/corpus\/store(?:\.[jt]s)?$/.test(reference.specifier) && !reference.typeOnly) {
    reasons.push('value-imports the corpus store, which reads the filesystem; only `import type` may name it');
  }
  if (reference.form === 'require call' || reference.form === 'import-equals require') reasons.push('is a require( call');
  if (reference.form === 'dynamic import' || reference.form === 'type-position import') reasons.push('is an import( expression');
  if (!reference.typeOnly && !SIBLING.test(reference.specifier) && !VALUE_IMPORT_ALLOWLIST.includes(reference.specifier)) {
    reasons.push('is not on the value-import allowlist');
  }
  return reasons;
}

/** Every forbidden reference in one file, addressed by file and line: the module rules first, then the global rules. */
function violationsOf(fileName: string, source: string): string[] {
  const modules = referencesOf(fileName, source).flatMap((reference) => {
    const reasons = reasonsAgainst(reference);
    return reasons.length === 0
      ? []
      : [`${fileName}:${reference.line}: ${reference.form} '${reference.specifier}': ${reasons.join('; ')}`];
  });
  const globals = globalsOf(fileName, source).map(
    ({ name, line }) => `${fileName}:${line}: global '${name}': reaches ${FORBIDDEN_GLOBALS.get(name)}`,
  );
  return [...modules, ...globals];
}

/**
 * Allowlist entries that no reference value-imports. A type-only reference does
 * not count: the list admits value imports, and an entry only ever named by
 * `import type` admits nothing in use.
 */
function staleAllowlistEntries(allowlist: readonly string[], references: readonly ModuleReference[]): string[] {
  const valueImported = new Set(references.filter((reference) => !reference.typeOnly).map((reference) => reference.specifier));
  return allowlist.filter((entry) => !valueImported.has(entry));
}

/** A directory entry, reduced to what the completeness check reads. */
interface DirectoryEntry {
  name: string;
  isFile(): boolean;
  isDirectory(): boolean;
}

/**
 * Entries a scan of `*.ts` files would not read, other than directories (which
 * have their own check): any file not ending in `.ts`, and anything that is not
 * a regular file — except a name on the ignore list.
 */
function unscannedFiles(entries: readonly DirectoryEntry[]): string[] {
  // The reviewed ignore list, exactly: Finder's `.DS_Store`, which holds no
  // code and which .gitignore keeps out of the repository. Extending it is a
  // reviewed change — see the header.
  const ignored: readonly string[] = ['.DS_Store'];
  return entries
    .filter((entry) => !ignored.includes(entry.name))
    .filter((entry) => !entry.isDirectory() && !(entry.isFile() && entry.name.endsWith('.ts')))
    .map((entry) => entry.name)
    .sort();
}

/** Entries that are directories, which a one-level scan would pass over with everything in them. */
function subdirectories(entries: readonly DirectoryEntry[]): string[] {
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

/**
 * Sources, scanned: which files were read, what each names, and every
 * violation among them under its file's name. It takes values rather than a
 * directory, so the aggregation the real scan relies on runs over synthetic
 * sources too.
 */
function scanSources(files: ReadonlyArray<{ name: string; source: string }>): {
  scanned: string[];
  references: Map<string, ModuleReference[]>;
  violations: string[];
} {
  const references = new Map<string, ModuleReference[]>();
  const violations: string[] = [];
  for (const { name, source } of files) {
    references.set(name, referencesOf(name, source));
    violations.push(...violationsOf(name, source));
  }
  return { scanned: files.map(({ name }) => name), references, violations };
}

/** The directory, scanned: every `.ts` file in it, read and handed to `scanSources`. */
function scanVerificationDir(): ReturnType<typeof scanSources> {
  const names = readdirSync(verificationDir).filter((name) => name.endsWith('.ts')).sort();
  return scanSources(names.map((name) => ({ name, source: readFileSync(join(verificationDir, name), 'utf8') })));
}

const shape = ({ form, specifier, typeOnly }: ModuleReference) => ({ form, specifier, typeOnly });

// ---------------------------------------------------------------------------
// The scanner can fail: each forbidden form detected, each look-alike not
// ---------------------------------------------------------------------------

const STORE_REASON = 'value-imports the corpus store, which reads the filesystem; only `import type` may name it';
const OFF_LIST = 'is not on the value-import allowlist';

describe('the purity scanner detects every forbidden form', () => {
  it.each([
    ['a static import from a node: built-in', "import { readFileSync } from 'node:fs';", [`synthetic.ts:1: import from 'node:fs': names a Node built-in; ${OFF_LIST}`]],
    ['a type-only import from a node: built-in', "import type { Stats } from 'node:fs';", ["synthetic.ts:1: import from 'node:fs': names a Node built-in"]],
    ['a multi-line import from a node: built-in', "\nimport {\n  readFileSync,\n  writeFileSync,\n} from 'node:fs';", [`synthetic.ts:2: import from 'node:fs': names a Node built-in; ${OFF_LIST}`]],
    ['a static import from bare path', "import { join } from 'path';", [`synthetic.ts:1: import from 'path': names the bare fs or path module; ${OFF_LIST}`]],
    ['a static import from a subpath of bare fs', "import { readFile } from 'fs/promises';", [`synthetic.ts:1: import from 'fs/promises': names the bare fs or path module; ${OFF_LIST}`]],
    ['a side-effect import of a node: built-in', "import 'node:fs';", [`synthetic.ts:1: side-effect import 'node:fs': names a Node built-in; ${OFF_LIST}`]],
    ['a side-effect import of bare fs', "import 'fs';", [`synthetic.ts:1: side-effect import 'fs': names the bare fs or path module; ${OFF_LIST}`]],
    ['a re-export from a node: built-in', "export { join } from 'node:path';", [`synthetic.ts:1: export from 'node:path': names a Node built-in; ${OFF_LIST}`]],
    ['a require call', "const x = require('fs');", [`synthetic.ts:1: require call 'fs': names the bare fs or path module; is a require( call; ${OFF_LIST}`]],
    ['a require call of a computed name', 'const x = require(name);', [`synthetic.ts:1: require call '<computed>': is a require( call; ${OFF_LIST}`]],
    ['an import-equals require', "import fs = require('fs');", [`synthetic.ts:1: import-equals require 'fs': names the bare fs or path module; is a require( call; ${OFF_LIST}`]],
    ['a dynamic import inside a function', "async function f() {\n  await import('node:fs');\n}", [`synthetic.ts:2: dynamic import 'node:fs': names a Node built-in; is an import( expression; ${OFF_LIST}`]],
    ['a dynamic import of a sibling module', "const m = await import('./result');", ["synthetic.ts:1: dynamic import './result': is an import( expression"]],
    ['an import( in a type position', "type S = import('node:fs').Stats;", ["synthetic.ts:1: type-position import 'node:fs': names a Node built-in; is an import( expression"]],
    ['a value import of the corpus store', "import { loadCorpus } from '../corpus/store';", [`synthetic.ts:1: import from '../corpus/store': ${STORE_REASON}; ${OFF_LIST}`]],
    ['a mixed type and value import of the store', "import { type LoadedCorpus, loadCorpus } from '../corpus/store';", [`synthetic.ts:1: import from '../corpus/store': ${STORE_REASON}; ${OFF_LIST}`]],
    ['an inline type import of the store that is not import type', "import { type LoadedCorpus } from '../corpus/store';", [`synthetic.ts:1: import from '../corpus/store': ${STORE_REASON}; ${OFF_LIST}`]],
    ['a namespace import of the store', "import * as store from '../corpus/store';", [`synthetic.ts:1: import from '../corpus/store': ${STORE_REASON}; ${OFF_LIST}`]],
    ['a side-effect import of the store', "import '../corpus/store';", [`synthetic.ts:1: side-effect import '../corpus/store': ${STORE_REASON}; ${OFF_LIST}`]],
    ['a value re-export from the store', "export { loadCorpus } from '../corpus/store';", [`synthetic.ts:1: export from '../corpus/store': ${STORE_REASON}; ${OFF_LIST}`]],
    ['a value import of a module not on the allowlist', "import { loadPack } from '../knowledge/loader';", [`synthetic.ts:1: import from '../knowledge/loader': ${OFF_LIST}`]],
    ['an inline type import of an unlisted module, which is a value import', "import { type KnowledgePack } from '../knowledge/loader';", [`synthetic.ts:1: import from '../knowledge/loader': ${OFF_LIST}`]],
    ['a value re-export of an unlisted module', "export { loadPack } from '../knowledge/loader';", [`synthetic.ts:1: export from '../knowledge/loader': ${OFF_LIST}`]],
    ['a relative path that leaves the directory through ./', "import { loadPack } from './../knowledge/loader';", [`synthetic.ts:1: import from './../knowledge/loader': ${OFF_LIST}`]],
    ['an unlisted package', "import merge from 'lodash.merge';", [`synthetic.ts:1: import from 'lodash.merge': ${OFF_LIST}`]],
  ])('%s', (_name, source, expected) => {
    expect(violationsOf('synthetic.ts', source)).toEqual(expected);
  });
});

describe('the purity scanner does not flag look-alikes', () => {
  it.each([
    ["sign.ts's own type import of the store", "import type { LoadedCorpus } from '../corpus/store';"],
    ['a type-only re-export from the store', "export type { LoadedCorpus } from '../corpus/store';"],
    ["an object key named node, as accounting.ts has one", 'interface AccountableNode {\n  readonly path: string;\n  readonly node: z.ZodTypeAny;\n}'],
    ['a comment containing the word require', '// nothing here may require the filesystem\nconst a = 1;'],
    ['comments that spell the calls out', "// const x = require('fs');\n/* await import('node:fs') */\n/**\n * import { readFileSync } from 'node:fs';\n */\nconst a = 1;"],
    ['a string that spells a require call', "const s = \"require('fs') and import('node:fs')\";"],
    ['an identifier that starts with require', 'const h = requirementSha256(req);'],
    ['a method named import', "loader.import('node:fs');"],
    ['a relative module whose name is path', "import { a } from './path';"],
    ['a package import', "import { z } from 'zod';"],
    ['a type-only import of an unlisted module', "import type { KnowledgePack } from '../knowledge/loader';"],
    ['a value import of an allowlisted parent module', "import { sha256Hex } from '../corpus/hash';"],
    ['a value import of a sibling module', "import { canonicalJson } from './canonical';"],
  ])('%s', (_name, source) => {
    expect(violationsOf('synthetic.ts', source)).toEqual([]);
  });
});

describe('the purity scanner flags every forbidden global in a value position', () => {
  it.each([
    ['the clock through Date.now', 'const t = Date.now();', ["synthetic.ts:1: global 'Date': reaches the clock"]],
    ['the clock through new Date', 'const d = new Date();', ["synthetic.ts:1: global 'Date': reaches the clock"]],
    ['a class that extends Date', 'class Stamp extends Date {}', ["synthetic.ts:1: global 'Date': reaches the clock"]],
    ['a class expression that extends Date', 'const C = class extends Date {};', ["synthetic.ts:1: global 'Date': reaches the clock"]],
    ['the clock through performance', 'const t = performance.now();', ["synthetic.ts:1: global 'performance': reaches the clock"]],
    ['a timer through setTimeout', 'setTimeout(done, 10);', ["synthetic.ts:1: global 'setTimeout': reaches the clock"]],
    ['a timer through setInterval', 'setInterval(tick, 10);', ["synthetic.ts:1: global 'setInterval': reaches the clock"]],
    ['a timer through setImmediate', 'setImmediate(done);', ["synthetic.ts:1: global 'setImmediate': reaches the clock"]],
    ['an instantiation expression of setTimeout', 'const later = setTimeout<[]>;', ["synthetic.ts:1: global 'setTimeout': reaches the clock"]],
    ['the network through fetch', 'const response = await fetch(url);', ["synthetic.ts:1: global 'fetch': reaches the network"]],
    ['the network through XMLHttpRequest', 'const request = new XMLHttpRequest();', ["synthetic.ts:1: global 'XMLHttpRequest': reaches the network"]],
    ['the network through WebSocket', "const socket = new WebSocket('wss://example.invalid');", ["synthetic.ts:1: global 'WebSocket': reaches the network"]],
    ['the environment through process.env', 'const home = process.env.HOME;', ["synthetic.ts:1: global 'process': reaches the process environment"]],
    ['a typeof probe of process in a value position', "const onNode = typeof process !== 'undefined';", ["synthetic.ts:1: global 'process': reaches the process environment"]],
    ['a shorthand property that carries fetch', 'const io = { fetch };', ["synthetic.ts:1: global 'fetch': reaches the network"]],
    ['a shorthand destructuring that binds a local named fetch', 'const { fetch } = client;', ["synthetic.ts:1: global 'fetch': reaches the network"]],
    ['a destructuring that renames a property to a local named fetch', 'const { get: fetch } = client;', ["synthetic.ts:1: global 'fetch': reaches the network"]],
    [
      'a local binding that shadows fetch, matched by name and not by scope',
      "const fetch = (u: string) => u;\nfetch('x');",
      ["synthetic.ts:1: global 'fetch': reaches the network", "synthetic.ts:2: global 'fetch': reaches the network"],
    ],
  ])('%s', (_name, source, expected) => {
    expect(violationsOf('synthetic.ts', source)).toEqual(expected);
  });
});

describe('the purity scanner does not flag global look-alikes', () => {
  it.each([
    ['a property access named fetch', 'const body = client.fetch(request);'],
    ['an object key named date', "const row = { date: '2026-09-25' };"],
    ['an object key named Date', "const row = { Date: '2026-09-25' };"],
    ['a method named fetch', 'class Loader {\n  fetch(): void {}\n}'],
    ['an interface member named process', 'interface Job {\n  readonly process: string;\n}'],
    ['a destructured property renamed away from fetch', 'const { fetch: get } = client;'],
    ['a type annotation of Date', 'let signedOn: Date | undefined;'],
    ['typeof process in a type', 'type Environment = typeof process.env;'],
    ["an interface's extends of a type named Date", 'interface Stamp extends Date {}'],
    ["a class's implements of a type named WebSocket", 'class Socket implements WebSocket {}'],
    ['a string that names globals, bound to a local', "const clock = 'Date.now()';\nconst label = \"fetch\";"],
    ['a comment that names globals', '// Date.now() and fetch(url) are not called here\n/* process.env.HOME */\nconst a = 1;'],
    ['identifiers that contain a global name', 'const fetched = dated(processed);'],
  ])('%s', (_name, source) => {
    expect(violationsOf('synthetic.ts', source)).toEqual([]);
  });
});

describe('the allowlist check reports every entry no file value-imports', () => {
  const allowlist = ['zod', '../corpus/hash'];
  it.each([
    ['an entry no file names', ["import { z } from 'zod';"], ['../corpus/hash']],
    ['an entry named only by import type', ["import { z } from 'zod';", "import type { Digest } from '../corpus/hash';"], ['../corpus/hash']],
    ['none, when every entry is value-imported by some file', ["import { z } from 'zod';", "import { sha256Hex } from '../corpus/hash';"], []],
  ])('%s', (_name, sources, expected) => {
    const references = sources.flatMap((source, i) => referencesOf(`synthetic-${i}.ts`, source));
    expect(staleAllowlistEntries(allowlist, references)).toEqual(expected);
  });
});

describe('the directory check faults every entry a .ts scan would not read', () => {
  const file = (name: string): DirectoryEntry => ({ name, isFile: () => true, isDirectory: () => false });
  const link = (name: string): DirectoryEntry => ({ name, isFile: () => false, isDirectory: () => false });
  const directory = (name: string): DirectoryEntry => ({ name, isFile: () => false, isDirectory: () => true });

  it('reports a subdirectory, and neither a file nor a link beside it', () => {
    expect(subdirectories([file('sign.ts'), file('notes.md'), link('linked.ts'), directory('nested')])).toEqual(['nested']);
  });

  it('passes over .DS_Store, the one name on its ignore list, and still faults the .md, .mts and other dotfile beside it', () => {
    expect(
      unscannedFiles([file('sign.ts'), file('.DS_Store'), file('notes.md'), file('planted.mts'), file('.gitkeep')]),
    ).toEqual(['.gitkeep', 'notes.md', 'planted.mts']);
  });

  it('lists the .mts, .cts, .tsx, .js, other file and link, and neither a .ts file nor a directory', () => {
    expect(
      unscannedFiles([
        file('sign.ts'),
        file('types.d.ts'),
        file('planted.mts'),
        file('planted.cts'),
        file('planted.tsx'),
        file('planted.js'),
        file('notes.md'),
        link('linked.ts'),
        directory('nested'),
      ]),
    ).toEqual(['linked.ts', 'notes.md', 'planted.cts', 'planted.js', 'planted.mts', 'planted.tsx']);
  });
});

describe('the scan reports every violation among the sources it reads, under its file', () => {
  it('reports the forbidden import of one source, and nothing of the clean source beside it', () => {
    const scan = scanSources([
      { name: 'clean.ts', source: "import { z } from 'zod';" },
      { name: 'impure.ts', source: "import { readFileSync } from 'node:fs';" },
    ]);
    expect(scan.scanned).toEqual(['clean.ts', 'impure.ts']);
    expect(scan.violations).toEqual([`impure.ts:1: import from 'node:fs': names a Node built-in; ${OFF_LIST}`]);
  });
});

// ---------------------------------------------------------------------------
// The directory
// ---------------------------------------------------------------------------

describe('src/verification/ imports and references nothing impure', () => {
  const scan = scanVerificationDir();

  it('scans every .ts file in the directory, sign.ts and evidence-validity.ts among them', () => {
    const entries = readdirSync(verificationDir, { withFileTypes: true });
    // A subdirectory would escape a one-level scan silently; there is none.
    expect(subdirectories(entries)).toEqual([]);
    // Nor is there any file the `*.ts` scan would pass over.
    expect(unscannedFiles(entries)).toEqual([]);
    expect(scan.scanned).toEqual(
      entries.filter((entry) => entry.isFile() && entry.name.endsWith('.ts')).map((entry) => entry.name).sort(),
    );
    expect(scan.scanned).toContain('sign.ts');
    expect(scan.scanned).toContain('evidence-validity.ts');
    expect([...scan.references.keys()]).toEqual(scan.scanned);
  });

  it('sees the imports the real files hold, multi-line and type-only included', () => {
    // The positive control for the references the scan records: it reads real
    // declarations, including sign.ts's multi-line import of ./canonical and
    // its type-only import of the store, which it must not report. It is not
    // the violation list's control: that list is aggregated separately.
    const sign = (scan.references.get('sign.ts') ?? []).map(shape);
    expect(sign).toContainEqual({ form: 'import from', specifier: '../corpus/store', typeOnly: true });
    expect(sign).toContainEqual({ form: 'import from', specifier: '../corpus/evidence', typeOnly: false });
    expect(sign).toContainEqual({ form: 'import from', specifier: './canonical', typeOnly: false });
    expect((scan.references.get('evidence-validity.ts') ?? []).map(shape)).toEqual([
      { form: 'import from', specifier: '../corpus/evidence', typeOnly: false },
      { form: 'import from', specifier: '../corpus/store', typeOnly: true },
      { form: 'import from', specifier: './evidence-sets', typeOnly: false },
      { form: 'import from', specifier: './result', typeOnly: true },
    ]);
  });

  it('holds no allowlist entry that no file value-imports', () => {
    // A stale entry would widen what a new file may import without review.
    // This is also the allowlist's positive control over the real files:
    // every entry is seen value-imported, and none is reported below.
    expect(staleAllowlistEntries(VALUE_IMPORT_ALLOWLIST, [...scan.references.values()].flat())).toEqual([]);
  });

  it('finds no forbidden import or global in any file', () => {
    // The positive control for this empty list is the two-source scan above:
    // the same scanSources, handed a forbidden import, reports it.
    expect(scan.violations).toEqual([]);
  });
});
