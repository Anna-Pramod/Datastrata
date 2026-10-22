# Checkpoint — pilot readiness: the temporary access gate and the public routes made fit for a small hosted evaluation pilot, a container definition, and production smoke checks

Written on 2026-10-22 (UTC) by the implementer sessions of the pilot-readiness task, in a clean clone of `feature/opus55-subscription-migration` at HEAD `4dd19ed` ("Declare Node 24 as the runtime…"), and copied into the candidate worktree `/Users/vivin/Documents/DataStrata/b1b-opus55-candidate` only after verification. The user's authorisation of 2026-10-22: implement B2, B4 and B5; investigate B1 and B3 before implementing them; prepare the container and production smoke checks with synthetic data. Not authorised: container-runtime installation, deployment, public exposure, spending, private-data transfer, live-agent tests and Stage 1b. Every time below is UTC. Passing tests and smoke checks are not production readiness, and this checkpoint claims none.

- **Scope.** `frontend/web`, the repository root (`Dockerfile`, `.dockerignore`), `scripts/smoke-production.mjs`, the plan (`plans/2026-10-22-pilot-readiness.md`) and this checkpoint. **No file under `backend/` belongs to it** (`grep -ri csrd backend/engine/src/` = 7). No implementer committed anything: the user runs every `git add` and `git commit`.
- **Where the evidence is.** `side-session-notes/local_043075c1-dc26-44e4-b3a9-257ce611215c/2026-10-22T1005Z-pilot-readiness/`, with a `README.md` and a `MANIFEST.sha256`: the investigation (`investigation/`), the briefs (`briefs/`), each implementer's report, red and green logs and diff (`reports/`), every teeth log, the implementers' and the parent's (`teeth/`, the parent's prefixed `parent-`), the parent's reviews and runs (`logs/`), and the scripts (`scripts/`).

## What was found

- **Before this task** (the assessment `2026-10-22T0916Z-node24-and-pilot-path/pilot/HOSTED-PILOT-PATH.md`): the Stage 1a gate was built and verified for one process on loopback. Exposed publicly, anyone could lock every pilot user out with five wrong posts; any website could post sign-in or sign-out from a visitor's browser; request bodies were read without a limit; no security header was set; and the middleware's redirect origin behind a proxy was unverified.
- **How Next 15.5.28 builds redirects and origins** (investigation §B3, 66 of 66 combinations per variant, production and dev):
  - Middleware cannot redirect relatively: `NextResponse.redirect('/x')` throws, and a hand-built relative `Location` reaches the client as a 500.
  - `request.url` is built from the hostname Next was started with. `Host`, `X-Forwarded-Host`, `X-Forwarded-Port` and `Forwarded` are ignored; any `X-Forwarded-Proto` containing `https` turns the scheme to https. No open redirect existed, but a server bound to 127.0.0.1 behind a proxy would have sent browsers to `https://localhost:<port>`.
  - A redirect built from a configured origin read at runtime arrived exactly as built everywhere.
  - Route handlers pass a relative `Location` through untouched.
  - Next's middleware adapter re-parses an absolute `Location` with a parser that rewrites a `127.x` or `[::1]` host to `localhost` (`next-url.js`, `adapter.js`; read by the parent in the source). A configured loopback address would therefore move the browser to `localhost`; the validator refuses one. The smoke run's local start (`http://localhost:<port>` on a server bound to 127.0.0.1) observed the `Location` arrive absolute and exactly as configured.
  - The handler's comment that `X-Forwarded-Proto` "is not read" was wrong: Next folds it into `request.url`, so a client can add `Secure` to its own cookie, never remove it.
- **Which client address can be trusted** (investigation §B1): Next 15 gives the app no peer address, and every client-address header reaches the app as written unless only an overwriting proxy can reach the app's port. Caddy overwrites by default, nginx does not, Fly and Cloudflare are unverified on spoofing and have bypass paths.
- **Found in review.**
  - The plan's own T3a was defective as worded: once `decideResponse` returns an absolute URL, `new URL(path, request.url)` at the adapter changes nothing. The implementer showed it; the parent's T3a mutates where the origin comes from.
  - The plan's T3d could not reach the middleware or sign-in suites, because `http://127.0.0.1` is also refused by the plain-http rule; an `https://127.0.0.1` row was added.
  - B2's first wording claimed a request with neither `Origin` nor `Sec-Fetch-Site` "is not a browser's" and "cannot carry a visitor's cookie". That is not established (an older browser, or one whose headers an extension or proxy strips, can send such a post); corrected by the parent at the user's instruction (see Decided).
  - The plan's first B1 proposal said both "an attempt over the ceiling is answered 429 without a comparison" and "the correct passphrase within the rate always succeeds". Corrected at the user's instruction: no design without a trusted client identity guarantees the correct passphrase succeeds (see B1 below).
  - In production, `Vary` on the middleware's 401 and 503 is `Cookie, Accept-Encoding` (Next's compression), and the allowed `/dashboard` page carries the page's own `Vary`, not the middleware's `Vary: Cookie`; `Cache-Control: private, no-store` survives. Pre-existing.
  - `/` and `/check` are prerendered with `Cache-Control: s-maxage=31536000`. Pre-existing; a CDN in front could hold them, and their headers, for a year.
- **Found about the work itself.** One implementer's restore failed mid-task (an unquoted zsh variable holding several paths is not word-split). The parent verified integrity before relying on anything (`logs/31-parent-B2-review.md`). A first T4c teeth spec of the parent's missed its target on indentation; the mutation tool refused to run it rather than report a colour.

## What was decided

- **B4: bounded request bodies.** `lib/request-body.ts` reads a body within a byte limit: a `Content-Length` over the limit is refused unread; otherwise the streamed bytes are counted and the reader cancelled once the count passes the limit. Limits: sign-in 4 KiB, check 8 KiB, contact 32 KiB. A body over the limit is 413 with `no-store` and a fixed body in each route's shape; the sign-in's is `too_large` in the gate's conventions and is never charged to the limiter.
- **B3: one configured public origin.** `DATASTRATA_PUBLIC_ORIGIN`, server-only, read by name per request, validated by `lib/public-origin.ts`: exactly an origin as a browser writes one; `https`, or `http` on `localhost` only; never a loopback address. **Required wherever the gate is used, in every mode** (chosen over a development-only fallback: one rule, the same behaviour locally and hosted, and it removes Stage 1a's `localhost` move). An unusable origin fails the gate closed: every `/dashboard` request, a valid session's included, is 503 naming the variable, and sign-in is 503 / `unconfigured`, before the body is read and never charged. The middleware builds its 303 from the validated origin and reads no `request.url`. Route handlers keep their relative `Location`. Locally: `http://localhost:<port>`, and open the site at that address.
- **B2: cross-site sign-in and sign-out refused.** `sameOriginVerdict`: with `Origin`, it must equal the configured origin exactly; without it, `Sec-Fetch-Site` must be `same-origin`; a refusal is 403 / `cross_site` (a relative 303 for a browser), checked on sign-in after the origin and before the body, never charged; a refused sign-out clears nothing. **A request with neither header is allowed as a compatibility exception** for scripts and `curl`, and the limiter and the passphrase still apply to it. It rests on an assumption, not a guarantee: current major browsers send `Origin` on every POST. An older browser, or one whose headers an extension or proxy strips, can send neither; another site can then drive such a post unjudged. It cannot carry the session cookie (scoped to `/dashboard`); through sign-in it can spend the shared limiter as any direct client can; through sign-out it can clear that browser's session. Evaluators are asked to use a current browser (README).
- **B5: headers on every response.** `poweredByHeader: false`, and one `headers()` rule for every path: `Content-Security-Policy: frame-ancestors 'none'`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Strict-Transport-Security: max-age=31536000` (no `includeSubDomains`, no `preload`; ignored over plain HTTP). Next applies config headers before the middleware and lays the middleware's over them, so no middleware change was needed (production-verified).
- **B1: not implemented; a decision for the user.** See "B1" below.
- **B6: a container definition and a production smoke check.** `Dockerfile` (two stages on `node:24.19.0-bookworm-slim` pinned by its multi-arch index digest `sha256:a9f5f7c9…29df`, read from Docker Hub at 2026-10-22T14:37:59Z; `npm ci --ignore-scripts`; the harness's own build and hygiene checks; runtime files root-owned, only `.next/cache` writable; `USER node`; `HOSTNAME=0.0.0.0`, `PORT=3000`, `NODE_ENV=production`; no secret, origin or profile in the image) and `.dockerignore`. `scripts/smoke-production.mjs` builds the standalone artifact through the harness, isolates it read-only except `.next/cache` (the image's permissions), and starts it three times with a constructed environment (synthetic secret, never a profile): the hosted origin, no origin (fail closed), and the local `http://localhost:<port>` form. It is not part of `npm test`. Neither builds or runs an image.
- **Commit grouping.** B4, B3 and B2 share `lib/pilot-access-handler.ts` and `test/pilot-access-route.test.ts`, so they are committed together rather than split by hunk; B5, B6 and the documentation are separate commits. Each intermediate commit was checked green on its own (`logs/50-`, `51-commit-split-state*.log`).

## B1: the limiter, stated for the decision

Without a client identity the app can trust, **no design guarantees that the correct passphrase always succeeds**: any bound that is shared by everyone and enforced before the comparison can be held exhausted by an attacker, and while it is, every attempt is refused before it is compared, the correct one included. The options differ in how much traffic that takes:

| | Option | Remaining attacker-induced denial |
|---|---|---|
| A | Keep as is (5 failures / 15 min, shared) | A trickle: about one wrong post every three minutes refuses everyone, plus up to fifteen minutes after it stops |
| B | Shared throttle without lockout, plus a generated ~128-bit secret | A steady stream faster than the budget (e.g. one per second, about 86,400 requests a day) refuses everyone while it lasts; no lockout tail |
| C | Compare every attempt, plus a generated secret, with only a resource bound | A flood large enough to keep the bound on in-flight comparisons full; below that, a correct passphrase always gets compared and succeeds |
| D | Per-client key behind a verified proxy (after the host decision) | Targeted only, unless trust is misconfigured |

The plan specifies B and C for a yes. Recommended before any public exposure: C. For a local or screen-shared pilot: A.

## What landed

New (11):
- `frontend/web/lib/request-body.ts`, `lib/public-origin.ts`;
- the tests `request-body` (20), `public-api-body-limits` (10), `public-origin` (100) and `security-headers` (9);
- `Dockerfile`, `.dockerignore`, `scripts/smoke-production.mjs`;
- the plan and this checkpoint.

Modified (11):
- `middleware.ts`, `lib/pilot-access-handler.ts`, `next.config.mjs`;
- `app/api/check/route.ts`, `app/api/contact/route.ts`, `app/api/pilot-access/route.ts`, `app/api/pilot-access/sign-out/route.ts`;
- `app/pilot-access/page.tsx` (a comment);
- `README.md`;
- `test/middleware.test.ts` (67 to 101 tests) and `test/pilot-access-route.test.ts` (136 to 204).

Frontend suite: 21 files / 423 tests at `4dd19ed`, then 23 / 466 after B4, 24 / 576 after B3, 24 / 655 after B2 and **25 / 664** after B5. B6 adds no test file: its check is the smoke script. Engine: 84 / 3310 throughout. `grep -ri csrd backend/engine/src/`: 7.

## Teeth checks

The parent re-ran every task's teeth itself, with its own mutations (specs in `teeth/specs/`, logs `teeth/parent-*.log`). Its runner copies the file first, refuses a mutation that does not match exactly once, shows the diff, runs, restores from the copy and confirms the restore by sha256. Every restore matched. Each failure was read, and each names the intended assertion.

| Task | ID | Mutation (the parent's) | Red |
|---|---|---|---|
| B4 | T4a | declared-length pre-check removed | 7 / 466: `pulls` expected 0 |
| B4 | T4b | streamed count removed (`arrayBuffer()`) | 23 / 466 |
| B4 | T4c | too-large sign-in charged to the limiter | 2 / 466: `limiter.recorded` not empty; `expected 429 to be 401` |
| B4 | T4d | `/api/check` back to unbounded `request.json()` | 3 / 466 |
| B3 | T3a | redirect origin taken from the request URL while the configured value is usable | 19 / 576: exact-`Location` checks |
| B3 | T3b | an unusable origin falls back to the request's | 16 / 576: `expected 200/303/401 to be 503` |
| B3 | T3c | exact-origin rule removed | 30 / 576 |
| B3 | T3d | loopback rule removed | 10 / 576 |
| B3 | T3e | `http` accepted on any host | 7 / 576 |
| B3 | T3f | sign-in's origin check disabled | 13 / 576: a session issued where 503 was expected |
| B2 | T2a | verdict always allows | 57 / 655 |
| B2 | T2b | `Origin` branch disabled | 42 / 655 |
| B2 | T2c | `Sec-Fetch-Site` branch always allows | 27 / 655 |
| B2 | T2d | cross-site sign-in charged | 2 / 655 |
| B2 | T2e | check moved after the body read | 4 / 655: never-pulled `expected 2 to be +0` |
| B2 | T2g | sign-out ignores its configured origin | 2 / 655: `expected 403 to be 303` |
| B5 | T5a | `Referrer-Policy` removed | 3 / 664 |
| B5 | T5a2 | `poweredByHeader: true` | 1 / 664 |
| B5 | T5a3 | HSTS gains `includeSubDomains` | 3 / 664 |
| B6 | P6a | sign-in route's production flag forced off | smoke 3 FAIL, each `Secure absent` (the sign-ins; sign-outs unaffected) |
| B6 | P6b | `X-Frame-Options` removed from the config | smoke 51 FAIL, each `X-Frame-Options absent` |
| B6 | P6e2 | the streamed count ignored in `readBodyWithin` | smoke 5 FAIL: streamed oversize sign-ins issued a session (`303, not 413`), `/api/check` 200 and `/api/contact` 503 instead of 413, and the log counts |
| B6a | P1 / P2 | `**/*.profile.json` removed / `backend/engine/knowledge` excluded | `.dockerignore` checker FAIL (2) / FAIL (23) |

Three of the parent's own first attempts failed to land or proved nothing, and were set aside, not counted:
- T4c's first spec missed on indentation, and the mutation tool refused it.
- P6e's first mutant failed the build's type check, which is a failure for the wrong reason.
- P1's first run planted nothing, so its pass was vacuous.

The implementers' own teeth are in `teeth/B*-T*.log`; each was re-done by the parent as above rather than accepted from a report.

## Checks

Run by the parent on the final change (`logs/75-parent-final-verification.md`), on Node 24.19.0 / npm 11.17.0 under `env -i`:
- **Tests and typecheck.** `npm test`: frontend 25 files / 664 tests, engine 84 / 3310. `npm run typecheck`: both workspaces exit 0. `grep -ri csrd backend/engine/src/`: 7.
- **`npm run test:standalone`.** Phase 1 (liveness in isolation) and phase 2 (agreement, with its negative control) pass. This ran in a verification copy proved identical to the clean clone: same HEAD, the same 21 changed files by sha256, the same status.
- **`node scripts/smoke-production.mjs`: 116 checks, 116 PASS.**
  - **Hosted start.** Every page and route answers. `/dashboard` refuses without a session: 401 to a script, and to a browser a 303 to exactly `https://pilot.example.test/pilot-access?reason=no_session`, unchanged under `Host`, `X-Forwarded-Host` and `X-Forwarded-Proto` set by the client.
  - **Sign-in and sign-out.** A browser-shaped sign-in issues `ds_pilot_access` with `Secure`, `HttpOnly`, `SameSite=Strict`, `Path=/dashboard`, `Max-Age=43200`. The session opens the labelled synthetic profile, and sign-out clears it.
  - **Cross-site posts** are refused 403 and not charged.
  - **Oversize bodies** get 413 on all three routes, declared and streamed (the status arrived while the client was still sending; no reset).
  - **Headers.** The five headers are on every response read, and there is no `X-Powered-By`.
  - **Fail-closed start.** Without `DATASTRATA_PUBLIC_ORIGIN` the gate answers 503 naming it, a valid session included.
  - **Local start.** `http://localhost:<port>` gives the absolute `http://localhost:<port>/pilot-access?reason=no_session`. A browser that opened `127.0.0.1` is refused as cross-site.
  - **Artifact.** It is read-only except `.next/cache`, and the cache stayed empty.
- **Sentinel scan** of that build (2,202 files): no synthetic sentinel value anywhere under `.next`, and no access-variable name in client output. Both positive controls fired.
- **The intermittent Google Fonts build failure recurred once** (`next/font`, `loader.js:122`) on the first smoke attempt. The CSS probe straight after saw 96 font URLs, all with a font-file extension. No cause is asserted; the run was repeated and passed.

## Not verified

- **The container image has never been built or run.** No container runtime is installed, and installing one is not authorised. The `Dockerfile` was checked only by reading it against the harness, and `.dockerignore` by a reimplementation of Docker's matching rules (`reports/B6a-report.md` lists what only a build and a run would show).
- No real reverse proxy, CDN or TLS was involved. HTTPS end to end, Fly's or Cloudflare's header handling, and the B1 trust conditions are unverified.
- No real browser was driven: not `Secure` on `http://localhost` in Safari, and not what a browser does with the cross-site 303.
- The smoke run is macOS on loopback. The image would be Linux on `0.0.0.0`, with root-owned files rather than removed write bits.
- B1's limiter is unchanged and was not tested beyond showing that refusals are not charged to it.

## Carried forward

- **Decisions for the user** (the hand-back states them, with what each changes):
  - **B1**, the limiter (above).
  - **Audience.** Who uses the pilot and how many named people. A shared passphrase suffices only for a handful of named evaluators of one company viewing their own profile; anything wider puts accounts (increment 1c) first.
  - **Data.** Which profile a hosted pilot serves, and whether it may leave this machine. Private-profile transfer is not authorised.
  - **Host, region and domain**, which also decide B1's option D and HSTS ownership.
  - **Budget:** hosting, a container tool or a CI image build, and an external review.
  - **Approval of public exposure, and the legal pages** (imprint, privacy notice), which are not assessed.
- **Before any exposure**, beyond those decisions:
  - build and run the image on a machine with a container runtime;
  - a forged-header probe on the deployment;
  - a production-mode demonstration over HTTPS against the deployed origin (the smoke script has no `--url` mode yet);
  - evaluators told to use a current browser and to open exactly the configured origin.
- **Hosting notes.**
  - `/` and `/check` are prerendered with `s-maxage=31536000`, so a CDN would need a purge after a header change.
  - Make the configured origin the only public hostname, redirecting others at the proxy.
  - Never set `experimental.trustHostHeader`.
  - Run a single instance (the limiter is in memory).
  - Values given by `--env-file` are visible to `docker inspect`.
  - The base-image digest pin freezes Debian's security rebuilds until it is re-pinned.
- **Smaller items.**
  - A refused sign-out logs the same line as a refused sign-in.
  - An aborted body upload now gives a 500 (the client has gone; nothing is charged).
  - The allowed `/dashboard` page keeps Next's `Vary`, not `Vary: Cookie`, and `no-store` still holds.
  - The smoke script restates test-standalone's `/api/check` acceptance rather than sharing it.
  - The build context still carries `.claude`, `.thumbnail`, `frontend/screenshots` and `frontend/prototypes`; none of them reaches the final image.
  - Builds fetch Google Fonts live; self-hosting the fonts would remove the intermittent failure's exposure.
- **Superseded Stage 1a limitations** (the historical design and checkpoint stay as written):
  - the `localhost` move on loopback redirects (B3);
  - cross-site posts to sign-in and sign-out (B2);
  - unbounded request bodies, D12 (B4);
  - no security headers (B5).
