# Plan: pilot readiness for the temporary access gate (B1–B6)

**Status:** plan for one bounded pilot-readiness task, authorised by the user on 2026-10-22. Written 2026-10-22 (UTC) at HEAD `4dd19ed`.

**What the task is.** It makes the Stage 1a temporary access gate and the public routes fit for a small hosted evaluation pilot. That means cross-site protection, bounded request bodies, basic security headers and redirects to a trusted public origin. It also prepares a Node 24 container definition and local production smoke checks.

**What is NOT authorised:**
- deployment, public exposure or spending;
- installing a container runtime;
- transferring any private profile;
- Stage 1b (accounts, database, platform).

The gate stays temporary; increment 1c replaces it with accounts.

**Sources.**
- The assessment `side-session-notes/…/2026-10-22T0916Z-node24-and-pilot-path/pilot/HOSTED-PILOT-PATH.md` (blockers B1–B7).
- The Stage 1a design `docs/superpowers/specs/2026-10-20-stage-1a-claims-and-access-gate-design.md` (§2, §5) and its checkpoint.

## Global constraints

- **Evidence.** `docs/superpowers/TEST-EVIDENCE-STANDARD.md` governs every task. Each task carries a teeth check naming the defect it detects. The parent re-runs every teeth check itself and reads each failure message. Mutations are restored from a copy taken first, never with `git checkout`, and confirmed by hash.
- **Where code runs.** All code runs in a clean clone with its own dependencies (`npm ci --ignore-scripts`, Node 24.19.0, npm 11.17.0), under `env -i`. Nothing runs in the candidate, whose `node_modules` are links into `b1b-record`.
- **Data.** Synthetic data only. The private pilot profile is never read.
- **Dependencies.** No new runtime dependency (`frontend/web` gains none, proposal §6.8). The engine is untouched: `grep -ri csrd backend/engine/src/` stays at 7.
- **Existing behaviour holds.** The gate's existing behaviour and tests stay green:
  - browser and script sign-in and sign-out;
  - the fixed refusal bodies;
  - relative 303s from the route handlers;
  - a refusal for configuration or limit not counted by the limiter;
  - no secret or submitted value in any response or log.
- **Baselines.** Each task's baseline is the previous task's finishing count. At `4dd19ed` the frontend suite is 21 files / 423 tests and the engine suite 84 / 3310. B4 finished at 23 files / 466 tests (re-run by the parent).
- **Order of execution.** B4, then B3, B2, B5 and B6, one at a time in the one clean clone. B3 comes before B2 because B2 compares against the origin B3 introduces.
  At the user's request B6 then ran as two implementers at once, on disjoint files: B6a the container definition (`Dockerfile`, `.dockerignore`, the README's container section; no build) and B6b the smoke script (its own file, the builds and servers). The parent checked the commit split in a separate verification copy at the same time.
- **File headers.** Every new source file opens with a JSDoc block saying why it exists.

## Design decisions (B4, B5, B6)

- **B4: bounded bodies, read once.** One helper reads a request body within a byte limit. It refuses without reading when `Content-Length` declares more than the limit, and otherwise counts the streamed bytes, stopping as soon as the count exceeds the limit. Each route then parses only the bounded bytes, keeping its existing parser, so its behaviour on bodies within the limit does not change.
  - **Limits:** `/api/pilot-access` 4 KiB; `/api/check` 8 KiB; `/api/contact` 32 KiB (a 5,000-character message at up to 4 bytes per UTF-8 character, plus the other fields).
  - **Refusal:** 413 with `Cache-Control: no-store` and a fixed body in each route's existing style.
  - **The sign-in route** follows the gate's refusal conventions: a script gets `413 {"error":"too_large"}`; a browser gets a relative 303 to `/pilot-access?reason=too_large`, whose sentence comes from the fixed reason map. A too-large sign-in is refused before the limiter and never charged to it.
- **B5: headers on every response.** A site-wide header set comes from `next.config.mjs` `headers()`:
  - `Content-Security-Policy: frame-ancestors 'none'`, with `X-Frame-Options: DENY` for older agents;
  - `X-Content-Type-Options: nosniff`;
  - `Referrer-Policy: strict-origin-when-cross-origin`;
  - `Strict-Transport-Security: max-age=31536000`, without `includeSubDomains` or `preload`, so nothing outside this host is committed. Browsers ignore it over plain HTTP (RFC 6797 §8.1), so local use is unaffected. The app sends it whatever the host does; if the chosen host adds its own, one of the two is removed at deployment.
  - `poweredByHeader: false`, so no response says `X-Powered-By: Next.js`.

  The gate's own `Cache-Control` and `Vary` must be unchanged. Next's router processes the config's header routes before the middleware and merges the middleware's own headers over them (`next/dist/server/lib/router-utils/resolve-routes.js`: the route list puts `fsChecker.headers` before `middleware`; middleware headers are written into the same `resHeaders`), so the set is expected on middleware responses without a middleware change. Whether config headers reach middleware-generated responses is verified on a production build, and the middleware adds the same set itself if they do not.
- **B6: container and smoke checks.** A container definition builds the standalone artifact from a clean checkout on Node 24 and runs it as a non-root user with `NODE_ENV=production`. It contains no secret or profile: the secret comes from the host's secret store, and a profile, if ever, from a mounted path. A smoke script runs the standalone server in production mode on a free loopback port with synthetic values and checks the routes, the gate, the cookie attributes, the B5 headers, the B4 limits and the B2 refusals. No container runtime is installed, so building the image is a stated verification gap.

## Task B4: request-body limits

**Behaviour.**
- `lib/request-body.ts` provides `readBodyWithin(request, limitBytes)`. It returns either `{ ok: true, bytes }` or `{ ok: false, reason: 'too_large' }`.
  - A `Content-Length` that parses as an integer above the limit is refused without the stream being read.
  - Otherwise the stream is read incrementally. Reading stops (the reader is cancelled) once the count exceeds the limit, which is then refused.
  - A null body gives empty bytes. Exactly `limitBytes` is allowed.
  - A declared length smaller than the real body does not defeat the streamed count.
- Each of the three routes parses only the bounded bytes with its existing parser (a new `Request` over the bytes with the original `Content-Type` is acceptable), and answers 413 as decided above.

**Tests.**
- Unit tests for the helper:
  - a declared-over-limit body whose stream is never pulled;
  - an undeclared (chunked) stream over the limit, cancelled;
  - a lying `Content-Length`;
  - at the limit, and one byte over.
- Route tests:
  - 413 per route, on both paths;
  - sign-in too-large for a script and for a browser;
  - too-large not charged: after six too-large posts, a wrong passphrase still gets 401, not 429;
  - positive controls that normal sign-in, check and contact still work.

**Teeth.** Each must turn the named tests red, and the failure must name them:
- T4a: the `Content-Length` pre-check removed;
- T4b: the streamed count removed (read all);
- T4c: a too-large sign-in charged to the limiter;
- T4d: `/api/check` reverted to the unbounded `request.json()`.

## Task B5: security headers

**Behaviour.** The header set above is present:
- on every page and route response of a production build;
- on the middleware's `/dashboard` refusals (303, 401, 503), alongside their unchanged `Cache-Control: private, no-store` and `Vary: Cookie`;
- on the allowed `/dashboard` page.

**Tests.**
- A unit test of the declared header list, exact names and values, read from the config.
- A production-build check (part of the B6 smoke script) that reads real responses.

**Teeth.**
- T5a: one header removed from the config. The unit test fails, and the smoke check fails naming that header.
- T5b: if the middleware needs to add the set, the middleware's addition removed. The smoke check fails on a `/dashboard` refusal.

## Task B6: container definition and production smoke checks

**Behaviour.**
- **`Dockerfile`** and **`.dockerignore`** at the repository root.
  - A build stage on a pinned Node 24 base: `npm ci`, then the web build producing `.next/standalone`.
  - A runtime stage: a non-root user, the standalone tree, `.next/static` copied beside the server, `NODE_ENV=production`, `PORT` and `HOSTNAME=0.0.0.0`, and the start command `node server.js` from `frontend/web` (the layout `scripts/standalone-harness.mjs` uses).
  - `.dockerignore` excludes `node_modules`, `.next`, `.git`, `*.tsbuildinfo` and any env or secret file.
- **`scripts/smoke-production.mjs`** builds the standalone artifact (reusing the harness's exported build and isolation where possible), starts it with `NODE_ENV=production`, `HOSTNAME=127.0.0.1` and a free loopback port, a synthetic sentinel secret, `DATASTRATA_PUBLIC_ORIGIN=https://pilot.example.test` (a reserved test name, standing for the public origin a proxy would serve) and no profile, and checks each of the following, printing PASS or FAIL per check:
  - `/`, `/check`, `/contact` and `/pilot-access` answer 200;
  - `POST /api/check` answers its golden-shaped result;
  - `/dashboard` without a session is refused: 401 to a script, and to a browser a 303 whose `Location` is exactly `https://pilot.example.test/pilot-access?reason=no_session` with no header, then with each of `Host: evil.example`, `X-Forwarded-Host: evil.example` and `X-Forwarded-Proto: https`;
  - sign-in with the sentinel, sent as a browser sends it (`Origin: https://pilot.example.test`, `Sec-Fetch-Site: same-origin`), issues `ds_pilot_access` with `Secure`, `HttpOnly`, `SameSite=Strict` and `Path=/dashboard`, by a relative 303 to `/dashboard`;
  - `/dashboard` with that cookie answers 200 with the labelled synthetic profile;
  - sign-out, sent as a browser sends it, clears the cookie;
  - the B5 headers are on each response read, and no `X-Powered-By`;
  - oversize posts get 413 on the three routes, declared and streamed;
  - cross-site sign-in and sign-out posts (`Origin: https://evil.example`; and `Sec-Fetch-Site: cross-site` without `Origin`) are refused 403, and are not charged: a wrong passphrase afterwards gets 401, not 429.

  It then restarts the server without `DATASTRATA_PUBLIC_ORIGIN` and checks that the gate fails closed: `/dashboard` answers 503 naming the variable, and sign-in answers 503. It stops its server on exit, on failure too.

**Tests.** The script is the check. It is run on Node 24 in the clean clone and its output recorded verbatim. The sentinel scan of the build (no sentinel value in `.next/`, no access-variable name in client output) is re-run.

**Teeth.**
- T6a: the cookie's `Secure` decision forced off in production. The smoke check fails naming `Secure`.
- T6b: one B5 header removed. The smoke check fails naming it (shared with T5a).

**Verification gap, stated up front.** No container runtime is installed, and installing one is not authorised. The image is not built or run here. Its definition is checked by reading it against the harness's start-up layout.

## Tasks B2 and B3 (and the B1 decision)

Specified after the investigation (`side-session-notes/…/2026-10-22T1005Z-pilot-readiness/investigation/INVESTIGATION.md`, written against `4dd19ed` and Next 15.5.28). What it observed, and what this plan relies on:

- **Middleware cannot redirect relatively.** `NextResponse.redirect('/x')` throws, and a hand-built relative `Location` from middleware reaches the client as a 500 in every mode (B3.1, B3.2).
- **`request.url` is not the public origin.** In middleware and route handlers it is built from the hostname Next was started with. It ignores `Host`, `X-Forwarded-Host`, `X-Forwarded-Port` and `Forwarded`, and takes its scheme from any `X-Forwarded-Proto` containing `https` (B3.3). No open redirect exists today, but the redirect the gate sends depends on an undocumented relativisation, and in the likely deployment (app bound to `127.0.0.1` behind Caddy) it sends browsers to `https://localhost:PORT/...`.
- **A configured origin works everywhere.** `NextResponse.redirect(new URL(path, configuredOrigin), 303)` reached the client exactly as built in 66 of 66 combinations (11 header sets × 6 server modes), with the origin read from `process.env` at runtime (B3.5).
- **Route handlers pass `Location` through untouched,** so their relative 303s are correct behind any proxy and stay as they are (B3.2).
- **Next exposes no peer address,** and every client-address header passes through as the client wrote it when the app is reached directly (B1.1, B1.2, B3.4).

One more fact, read from the same source by the parent and not exercised by the investigation, decides a validation rule. The middleware adapter re-parses an absolute `Location` with Next's URL parser, which rewrites any `127.x.x.x` or `[::1]` host to `localhost` (`dist/server/web/next-url.js:15-18`, `dist/server/web/adapter.js:338-354`). A configured `http://127.0.0.1:3000` would therefore reach the browser as `http://localhost:3000/...`, the same move off the host the Stage 1a design records. A loopback address is refused as a value; local use writes `localhost`. The B6 smoke run checks the hosted form (`https://pilot.example.test`) on a production build.

### Task B3: redirects to the configured public origin

**The variable.** `DATASTRATA_PUBLIC_ORIGIN`: the origin browsers use to reach the site, for example `https://pilot.example.org`, or `http://localhost:3000` on one machine. It is server-only (never `NEXT_PUBLIC_`), read by name as `process.env.DATASTRATA_PUBLIC_ORIGIN` for each request, like the secret, and so taken from the server's environment at start.

**Validation, in a new pure module `frontend/web/lib/public-origin.ts`** (no imports, Edge-safe). It exports `PUBLIC_ORIGIN_ENV` and `readPublicOrigin(value)`, which returns `{ ok: true, origin }` or `{ ok: false, problem }`. A value is usable only when all of these hold:
- it is set;
- it parses as a URL whose `origin` is exactly the value, so there is no surrounding whitespace, path, trailing slash, query, fragment or userinfo, the host is lower-case and a default port is not written;
- the scheme is `https:`, or `http:` with the host `localhost`;
- the host is not a loopback address (`127.0.0.0/8`, `[::1]`), for the reason above.

Each problem names the variable, says what form is wanted, and never prints the value, as the access module's problems do.

**Required wherever the gate is used, in every mode.** There is no fallback to `request.url` in development. This was chosen over a development-only fallback because:
- one rule is tested once and behaves the same locally and hosted;
- it removes the Stage 1a `localhost` move for local use too;
- the B2 check needs a trusted origin in every mode;
- an operator who configures the gate already sets its secret.

The cost is one more variable for a local run (`DATASTRATA_PUBLIC_ORIGIN=http://localhost:3000`, with the browser opened at that address). The README says so.

**The middleware.**
- It reads the variable by name beside the two access variables.
- An unusable origin makes the gate fail closed: every `/dashboard` request, including one with a valid session, is answered 503 `text/plain` with the existing first line, then the access module's problems (if any), then the origin's problem. It keeps `Cache-Control: private, no-store` and `Vary: Cookie`.
- A refused browser navigation is a 303 to the absolute URL `<origin>/pilot-access?reason=<reason>`, built from the validated origin and passed to `NextResponse.redirect` as it is.
- Nothing in the middleware reads `request.url` any more; `decideResponse` is handed the origin result instead of the URL, and stays a pure function from which the whole policy is tested.
- 401 and 200 are unchanged. The matcher is unchanged.

**The sign-in route.**
- Its environment record gains the variable.
- An unusable origin is answered as unconfigured (503 `{"error":"unconfigured"}` to a script, a relative 303 to `/pilot-access?reason=unconfigured` to a browser). This happens before the body is read and before the limiter, and is never charged.
- Its success and refusals keep their relative `Location`.

**The sign-out route.** Unchanged by B3: it gains the variable only for B2.

**The dashboard page.** Unchanged. The origin governs redirects and cross-site judgement, not who may read the record; the page's own decision stays the access module's.

**Documentation.**
- The middleware's and the handler's module comments say why the origin is configured rather than derived.
- The handler's comment that `X-Forwarded-Proto` "is not read" is corrected: Next itself folds it into `request.url`, so a client can add `Secure` to its own cookie, and production sets `Secure` regardless. Behaviour is unchanged.
- `frontend/web/README.md` documents the variable:
  - local use: `http://localhost:<port>`, and open that address;
  - hosted use: the `https` origin, which is the only public hostname, with the proxy redirecting any other name (for example `<app>.fly.dev`) to it;
  - never set Next's undocumented `experimental.trustHostHeader`.

**Tests.**
- `readPublicOrigin`, called directly, one case per rule:
  - usable: `https://` with and without a port, and `http://localhost` with and without a port;
  - refused: unset; empty; surrounding whitespace; a trailing slash; a path; a query; a fragment; userinfo; an upper-case scheme or host; an explicit `:443` on `https`; `http://` on a host other than `localhost`; `http://127.0.0.1:3000`; `https://127.0.0.1`; `http://[::1]:3000`; a non-HTTP scheme; a bare host.
  - Every problem names the variable and contains no part of the value. Test values must not occur in the remedy text, so this check can fail.
- `decideResponse`:
  - a denied browser request gets the exact absolute `Location` on the configured origin;
  - an unusable origin gives 503 for denied, allowed and unconfigured decisions alike, with the problems in the stated order;
  - 401 and 200 are unchanged.
- Through `middlewareWith`, with a request whose URL is `http://localhost:3000/dashboard`:
  - the `Location` is the configured origin's, under none of, and each of, `Host: evil.example`, `X-Forwarded-Host: evil.example` and `X-Forwarded-Proto: https`;
  - without the variable, every request gets 503 naming it. As a positive control, the same request with the variable is answered 303 or 200.
- A source check: `middleware.ts` no longer reads `request.url`, and reads the variable by name.
- Sign-in: an unusable origin is answered 503 or `unconfigured`, with no body read, no limiter asked or charged and no comparison. The control: the same request with a usable origin is read and compared.
- The existing gate tests stay green, with the variable added to their configured environments.

**Teeth.** Each must turn the named tests red, and the failure must name them:
- T3a: the redirect's origin taken from the request URL again while the configured value is usable. The exact-`Location` tests fail. (As first worded, "`new URL(path, request.url)` at the adapter", this mutant changed nothing once `decideResponse` returns an absolute URL, because an absolute URL ignores its base; the implementer showed it with a run in which only a source check went red. The mutation must change where the origin comes from.)
- T3b: an unusable origin treated as usable (for example, the middleware falls back to `request.url`, or answers the decision as before). The fail-closed tests fail.
- T3c: the exact-origin rule removed (any parsable URL accepted, its `origin` used). The trailing-slash, path, query, fragment, userinfo and case cases fail.
- T3d: the loopback-address rule removed. The `127.0.0.1` and `[::1]` cases fail. (`http://127.0.0.1` is still refused by the plain-http rule, so the middleware and sign-in suites need an `https://127.0.0.1` row for T3d to reach them.)
- T3e: `http:` accepted on any host. The `http://` non-localhost case fails.
- T3f: the sign-in's origin check removed. The sign-in fail-closed test fails, because a session is issued.

**Production check.** This is the B6 smoke run, as specified there: the exact `Location` under crafted proxy headers, and the 503 when the variable is absent.

### Task B2: cross-site sign-in and sign-out refused

**The rule.** `lib/public-origin.ts` gains `sameOriginVerdict({ origin, secFetchSite }, publicOrigin)`, a pure function over the two header values (each a string or null) and the validated origin (a string, or null when none is usable). It returns which of three cases applies, so tests name the case:
- **`Origin` present.**
  - With a usable origin: allowed only if `Origin` equals it exactly. A different scheme, host or port, a trailing slash, the string `null` (an opaque origin) or two joined values are refused.
  - With no usable origin (sign-out only, below): allowed only if `Sec-Fetch-Site` is `same-origin`.
- **`Origin` absent, `Sec-Fetch-Site` present:** allowed only if it is exactly `same-origin`. `same-site` (a sibling subdomain), `cross-site`, `none` and anything else are refused.
- **Neither present:** allowed, as a compatibility exception. Scripts and `curl` send neither header, and refusing them would break scripted sign-in; the limiter and the passphrase still apply to them.
  - **Its assumption.** Current versions of the major browsers send `Origin` on every POST, so a post with neither header does not come from them. This is an assumption about the pilot's browsers, not something the request proves.
  - **Where it fails.** An older browser, or one whose headers an extension or an intermediary proxy strips, can send a post with neither. Another site can drive such a post, and it carries whatever cookies that browser holds for this host. It is let through unjudged.
  - **What such a post can do.** It cannot carry the session cookie, which is scoped to `/dashboard` and so never sent to these routes. Through sign-in it still needs the passphrase and is counted by the shared limiter, which any client can already spend directly (B1). Through sign-out it can clear that browser's session cookie.
  - **Decided explicitly:** the exception stays, evaluators are asked to use a current browser, and the README says so. (Corrected 2026-10-22 after review; the first wording claimed such a request could not be a browser's or carry a cookie.)

**The sign-in route.**
- The check comes after B3's origin check and before the body is read: unusable origin (503), then cross-site (403), then too large (413), then the configuration, limiter and comparison as now.
- A cross-site request is refused with 403 in the gate's conventions: `{"error":"cross_site"}` with `no-store` to a script, and a relative 303 to `/pilot-access?reason=cross_site` with no cookie to a browser.
- It is logged `pilot-access: refused (403)` and nothing else.
- Its body is never read, the limiter is neither asked nor charged, and no comparison runs.
- Browser sign-in from the site itself (`Origin` equal to the configured origin, `Sec-Fetch-Site: same-origin`) works as before.

**The sign-out route.**
- It reads the variable and the two headers, plus `Accept` for the refusal's form, and still no secret and no body.
- A usable origin is compared as above. With an unusable one, sign-out still works on a misconfigured server for a browser that sends `Sec-Fetch-Site: same-origin`, and refuses an `Origin` it cannot judge otherwise.
- A cross-site sign-out is refused like the sign-in's (403 / relative 303 to `cross_site`), without a `Set-Cookie`, so the cookie is not cleared.
- A same-origin or header-less sign-out clears the cookie as before.

**The access page.** The reason map gains `cross_site`, worded "That request did not come from this site, so it was refused." That makes ten reasons; the page comment's count follows.

**Tests.**
- `sameOriginVerdict`, called directly with inputs the routes cannot produce, so each conjunct can fail alone (evidence standard, failure mode 4): every row of the rule above, with and without a usable origin.
- Sign-in:
  - cross-site by `Origin`, and by `Sec-Fetch-Site` alone, gets 403 to a script and a 303 to `cross_site` to a browser;
  - its recorded stream is never pulled, beside the same stream pulled for a same-origin request;
  - the limiter is not asked, not charged and nothing is compared, beside a same-origin wrong passphrase that is asked, charged and compared;
  - through the exported `POST`: six cross-site posts, then a same-origin wrong passphrase gets 401, not 429;
  - same-origin browser sign-in sets the cookie; `Sec-Fetch-Site: same-origin` alone works; a request with neither header works;
  - the log line;
  - no submitted value in any answer.
- Sign-out:
  - cross-site gets no `Set-Cookie`, beside same-origin and header-less sign-outs that clear it;
  - with an unusable origin: `Sec-Fetch-Site: same-origin` clears, and `Origin` without `Sec-Fetch-Site` is refused.
- The source checks on header reads are updated to allow exactly the new reads, and still forbid every client-address header.

**Teeth.** Each must turn the named tests red, and the failure must name them:
- T2a: the verdict always allows. The sign-in and sign-out cross-site tests fail.
- T2b: the `Origin` comparison removed, so only `Sec-Fetch-Site` is judged. A cross-site `Origin` without `Sec-Fetch-Site` is allowed and its test fails.
- T2c: the `Sec-Fetch-Site` rule removed (an absent `Origin` is allowed). The `Sec-Fetch-Site: cross-site` tests fail.
- T2d: a cross-site sign-in charged to the limiter. The not-charged tests fail.
- T2e: the check moved after the body is read. The never-pulled test fails.

### B1: the client address and the limiter (not implemented; a decision for the user)

**What was found** (investigation §B1).
- Next 15.5.28 gives the app no peer address. Every client-address header (`X-Forwarded-For`, `X-Real-IP`, `Fly-Client-IP`, `CF-Connecting-IP`) reaches the app as the client wrote it whenever the app can be reached other than through an overwriting proxy.
- A per-client limiter key is therefore trustworthy only on a host where nobody but such a proxy can reach the app's port. That is a property of the chosen host and its configuration, which the app cannot check from inside.
- Caddy overwrites by default and nginx does not. Fly and Cloudflare are unverified on spoofing, and both have bypass paths: Fly's 6PN and WireGuard, and Cloudflare's direct access to the origin.

**What the gate does today.** One shared key, five wrong passphrases per rolling fifteen minutes, then 429 for everyone without a comparison. Anyone who can reach `POST /api/pilot-access` can refuse everyone, the authorised person included, by sending a wrong passphrase about every three minutes. The refusal outlasts the attack by up to fifteen minutes. Adequate for a local or screen-shared pilot; not for public exposure.

**One statement that holds for every option.** Without a client identity the app can trust, no design guarantees that the correct passphrase always succeeds. Any bound that is shared by everyone and enforced before the comparison can be held exhausted by an attacker, and while it is exhausted every attempt is refused before it is compared, the correct one included. The options differ only in how much traffic that takes, how long the refusal outlasts the attack, and what bounds guessing instead.

**The options.**

| | Option | What is refused before comparison | Remaining attacker-induced denial | What bounds guessing | Depends on the host? |
|---|---|---|---|---|---|
| A | Keep as is | every attempt, after five failures in fifteen minutes | **A trickle.** About one wrong post every three minutes refuses everyone, for as long as it continues plus up to fifteen minutes. | five per fifteen minutes globally, about 2^17 per year | No |
| B | Shared throttle without a lockout, plus a generated secret (investigation (ii)+(iii)) | every attempt that arrives while the shared budget (for example one comparison per second, burst five) is used up | **A steady stream.** Sending faster than the budget refills keeps it used up. While that continues, a correct passphrase gets 429 unless it happens to take a freed slot; an attacker sending well above the rate takes nearly every slot. At one per second that is about 86,400 requests a day. The refusal ends within the burst's refill time of the attack stopping. No failure is remembered, so there is no lockout to wait out. | the rate (about 2^25 per year at one per second) and, chiefly, the secret's ~128 bits | No |
| C | Compare every attempt, plus a generated secret, with only a resource bound | only attempts beyond a bound on comparisons in progress or waiting (for example 32), which protects memory and latency | **A flood.** A comparison costs two HMAC-SHA-256 operations and a key import, well under a millisecond, so keeping the bound full needs a sustained flood. This is the same volumetric denial any public endpoint faces, and it belongs to the host's proxy or CDN rate limit. Below that, a correct passphrase is compared and succeeds whatever came before it. | the secret alone: at 10^4 guesses per second for a year (about 2^38), success has probability about 2^-90 against 128 bits | No |
| D | Per-client key behind a verified proxy, on top of A, B or C | as the option underneath, counted per client address | **Targeted only.** An attacker must exhaust a victim's own key. That is impossible without the victim's address, unless trust is misconfigured, in which case the attacker writes any address and gets unlimited keys. | per address, so the total scales with the attacker's address pool | **Yes:** the trust condition must be verified with a forged-header probe on the deployment |

In B and C the generated-secret rule is not optional. It must be at least 22 characters from the base64url alphabet, as `node -e "console.log(crypto.randomBytes(16).toString('base64url'))"` prints (32 hex characters also pass). Anything else is a configuration problem naming the variable. The rule holds only the generator's form, because entropy cannot be measured. It also narrows I2 (offline guessing from a captured token), whatever the limiter. Every secret issued so far must then be rotated.

**Why none is implemented here.**
- A is today's behaviour.
- B and C replace a stated security property, the global five-attempt bound, with protection from secret entropy (and, in B, a rate). They force rotation of every issued secret and change the design text and the tests that state the bound. That is the user's call.
- D needs the host decision.
- No option is needed for a local or screen-shared pilot.

**The decision asked of the user** (presented separately in the hand-back):
- **Before any public exposure:** choose B or C. C is recommended: the denial an attacker can still cause becomes a flood the host's proxy can absorb, rather than a stream anyone can sustain from one machine.
- **After a host is chosen and its trust condition is probed:** optionally add D.
- **For a local or screen-shared pilot:** A, no change.

**If B or C is approved, each is specified as follows** (behaviour only; a fresh task with its own teeth).
- **Both.**
  - The secret rule above.
  - A failure is never remembered beyond the rate in B, and not at all in C.
  - The refusal stays 429 / `limited`, without a comparison and without being charged. The page's sentence changes to "Too many sign-in attempts are arriving. Try again shortly."
  - The waiting queue is bounded, and an attempt beyond the bound is answered 429 at once.
  - The design text and the README state the remaining denial as in the table.
- **B.** A token bucket shared by everyone, with a rate and a burst, consumed by every attempt that reaches the comparison.
- **C.** No bucket. Only the bound on comparisons in progress or waiting.
- **Teeth.**
  - A correct passphrase refused after many failures, while the budget (B) or the bound (C) has room, fails a test.
  - An attempt refused for the budget or the bound that is nonetheless compared fails a test.
  - An unbounded queue fails a test.
  - A secret of the wrong form accepted fails a test.
  - In B, an attempt over the rate that is admitted fails a test.
