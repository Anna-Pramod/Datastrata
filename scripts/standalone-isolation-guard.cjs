/**
 * Enforces the isolation validity rule, rather than assuming it.
 *
 * Design §9.1: the standalone deployment test is valid *only* when the server
 * process cannot resolve runtime files from the source checkout. Running the
 * artifact from a directory outside the repository makes that true by
 * construction — but "true by construction" is exactly the kind of negative
 * observation TEST-EVIDENCE-STANDARD failure mode 7 is about. An absolute path
 * baked into the build (Next embeds `outputFileTracingRoot` and `turbopack.root`
 * verbatim into `server.js`), a stray `process.env`, or a symlink would each
 * silently restore the masking condition the test exists to remove, and the
 * request would still return 200.
 *
 * So the rule is enforced: preloaded with `--require`, this wraps the filesystem
 * entry points a runtime file read can go through and throws
 * `IsolationViolationError` naming the offending path the moment anything under
 * DATASTRATA_FORBIDDEN_ROOT is touched. A request that succeeds under this guard
 * succeeded without the repository.
 *
 * The guard is itself proved to fire, by a positive control in
 * `scripts/test-standalone.mjs`, before it is trusted to stay silent.
 */

'use strict';

const forbiddenRoot = process.env.DATASTRATA_FORBIDDEN_ROOT;
if (forbiddenRoot) {
  const fs = require('node:fs');
  const path = require('node:path');

  // Through the real path, not the given one. `os.tmpdir()` on macOS hands back
  // `/var/folders/…` while `process.cwd()` inside the server reports the resolved
  // `/private/var/folders/…`, so a literal prefix comparison matches nothing and the
  // guard falls silent over a directory it was aimed straight at — failure mode 7
  // inside the guard itself. The positive control in `test-standalone.mjs` is what
  // caught it, which is the whole reason that control is not optional.
  let root = path.resolve(forbiddenRoot);
  try {
    root = fs.realpathSync(root);
  } catch {
    /* a root that does not resolve cannot be read from either */
  }
  const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep;

  const isForbidden = (p) => {
    if (typeof p === 'string') {
      const resolved = path.resolve(p);
      return resolved === root || resolved.startsWith(rootWithSep);
    }
    if (Buffer.isBuffer(p)) return isForbidden(p.toString());
    if (p instanceof URL) return p.protocol === 'file:' && isForbidden(p.pathname);
    return false;
  };

  const violate = (fnName, p) => {
    const err = new Error(
      `IsolationViolationError: fs.${fnName} reached the source checkout at ${String(p)}. ` +
        'The standalone server must resolve every runtime file from its own artifact; a ' +
        'request answered with the repository reachable is not deployment evidence.',
    );
    err.name = 'IsolationViolationError';
    throw err;
  };

  // Every entry point a runtime file read in this application can go through:
  // the engine loader uses readFileSync/existsSync, Next uses open/stat/readdir
  // and the promises API, and `require` of a traced file goes through openSync.
  const guarded = [
    'readFileSync', 'existsSync', 'openSync', 'statSync', 'lstatSync', 'readdirSync',
    'accessSync', 'realpathSync', 'createReadStream',
    'readFile', 'open', 'stat', 'lstat', 'readdir', 'access', 'realpath',
  ];

  for (const name of guarded) {
    const original = fs[name];
    if (typeof original !== 'function') continue;
    fs[name] = function (...args) {
      if (isForbidden(args[0])) violate(name, args[0]);
      return original.apply(this, args);
    };
  }

  for (const name of ['readFile', 'open', 'stat', 'lstat', 'readdir', 'access', 'realpath', 'opendir']) {
    const original = fs.promises[name];
    if (typeof original !== 'function') continue;
    fs.promises[name] = function (...args) {
      if (isForbidden(args[0])) violate(`promises.${name}`, args[0]);
      return original.apply(this, args);
    };
  }
}
