# Authentication before increment 1b: the proposed custom design compared with a maintained library

**Status:** the note the accepted proposal requires before increment 1b (`2026-10-20-commercial-platform-proposal.md` §11, third clarification). It is not a proposal or a design: it builds, installs and changes nothing, and Stage 1b starts only when the user decides. Written 2026-10-21 (UTC) at HEAD `b9f0745`. Revised 2026-10-22 (UTC) in one bounded correction pass at the user's request: the pool claim, JWT revocation, the Node baseline, the framing of the recommendation and the Stage 1a key lesson.

**How to check it:** every claim about a library or a standard cites a source in §8 as [S*n*], read on 2026-10-21 (UTC), or re-read on 2026-10-22 where §8 says so. Source code was read at the release tag named. Anything no source settled is marked **unverified**, and an absence found only on the pages read is marked as such. The per-claim research records, with verbatim quotes, and the independent review report are in the working notes `side-session-notes/local_043075c1-dc26-44e4-b3a9-257ce611215c/2026-10-21T1903Z-authentication-comparison/`.

## 1. The baseline, as the proposal specifies it

| Id | Requirement | Proposal |
|---|---|---|
| R1 | Email and password, hashed with argon2id | §6.1 |
| R2 | Opaque server-side sessions in secure cookies, revocable one by one and per user | §6.1, §6.3 |
| R3 | Every session ended at once on role removal and on deactivation | §6.3 |
| R4 | Rate limits | §6.1 |
| R5 | Invitation only: staff create a tenant and invite its first owner | §6.1, §8 (1c), §9.3 |
| R6 | Email verification | §6.1 |
| R7 | TOTP mandatory for staff and tenant owners | §6.1 |
| R8 | Hashed one-time recovery codes | §6.3 |
| R9 | Staff who lose device and codes are recovered only by a recorded two-person procedure | §6.3 |
| R10 | Owners recover through verified email plus a recovery code; a single-owner tenant is warned | §6.3 |
| R11 | A lost device revokes all sessions and forces TOTP re-enrolment | §6.3 |
| R12 | Every recovery and revocation is an audit event in append-only tables | §6.1, §6.3 |
| R13 | Passkeys next; SSO through an OIDC client only on demand | §6.1, §6.2 |
| R14 | No third party in the trust path; EU residency | §6.2, §6.7 |
| R15 | RLS on `app.tenant_id` set per transaction; roles `migrator`, `app`, `worker`, `support`; plain SQL migrations, `pg`, no ORM | §6.1, §6.4, §6.5 |
| R16 | Tenant roles never hold staff roles; support reads tenant data only under a time-boxed, logged grant | §2, §6.4 |
| R17 | The `backend/platform` allowlist (`argon2`, `otplib` among eight); `frontend/web` gains no runtime dependency | §6.8 |
| R18 | Password reset, named by §6.2 as a cost the custom path owns | §6.2 |
| R19 | Lockout, likewise named by §6.2 | §6.2 |

§6.3's quarterly staff-account review is operational and outside the comparison.

## 2. The candidates

**Better Auth** is the one mature, maintained in-process library found that offers email and password, database sessions and TOTP for this stack: 1.7.12 (2026-10-20), MIT [S1, S3]. On 2026-07-07 its team announced it is "joining Vercel". The post says Vercel "shares our commitment to keeping auth open source, framework and platform agnostic", but not what the move means for governance [S4]. Every Better Auth reading below is pinned to 1.7.12.

**Auth.js (NextAuth v5) fails the baseline.** It has been maintained by the Better Auth team since 2025-09-22, for "security and critical fixes", and its own team recommends Better Auth "for most teams" [S28, S29]. Version 5 is still a beta (5.0.0-beta.32); npm's `latest` is 4.24.15 [S30]. Email-and-password users get JWT sessions only: a database strategy with only credentials is a start-up error [S31]. That alone mismatches R2's opaque server-side sessions. Separately, its docs say a JWT cannot be expired before its encoded expiry [S31]. Refusing one early would need a server-side revocation check on every request, which DataStrata would build. Its docs leave password hashing and reset to the developer, and the pages read offer no TOTP or recovery codes. Its passkeys are "experimental" [S31]. Its Postgres adapter stores session tokens unhashed and cannot revoke a user's sessions together [S32]. Seven advisories were published since 2023, four of them on 2026-07-20 [S33].

**Lucia is no longer a library.** It was deprecated in March 2025 and is now a reference file of hashed-token database sessions plus a guide. On 2026-07-29 its author also deprecated Arctic and every Oslo package except `@oslojs/encoding`, including the TOTP package `@oslojs/otp` [S34].

**The other candidates are separate services.** The Next.js guide lists twelve libraries, mostly hosted [S35]. Every self-hostable open-source option checked runs as a separate service with its own server and schema: SuperTokens, Ory Kratos, Stack Auth (now Hexclave), Logto, ZITADEL, authentik and Hanko [S38]. They fall under §6.2's Keycloak exclusion. One other in-process library, theAuth, lists email and password and TOTP (database sessions not confirmed). It was first published to npm in June 2026, has one maintainer, and tests Postgres "by hand, not in CI" [S39].

**Nothing found changes §6.2's exclusion of hosted providers.** The one hosted element met is Better Auth Infrastructure, a paid add-on holding audit logs and requiring an API key [S27]. The library does not need it, and using it would put a third party in the trust path (R14).

## 3. What each approach leaves with DataStrata

### 3.1 Custom, as §6.1–§6.3 specify

- **Recovery.** DataStrata builds all of it:
  - reset, with single-use expiring tokens stored securely [S45];
  - verification;
  - recovery codes;
  - the lost-device path;
  - owner recovery;
  - the two-person staff procedure.

  OWASP lists support contact with "a rigorous process in place to verify their identity" among MFA reset options, and treats factor replacement as high-risk, with an out-of-band notice [S45]. The two-person rule meets that, but only as a procedure DataStrata runs.
- **Maintenance.** DataStrata owns every line, the schema and its migrations, which fit §6.5 unchanged. The third-party surface is the allowlist, and it moved this year:
  - **Node baseline.** CI runs Node 20 (`.github/workflows/checks.yml`), which has been end-of-life since 2026-04-30. Node's guidance is that "Production applications should only use Active LTS or Maintenance LTS releases" [S42]. The baseline therefore moves to a supported line whichever argon2 binding is chosen. Node 24 LTS (end of life 2028-04-30) is proposed [S42]; the Stage 1a suite and demonstration server already ran on Node v24.19.0 (checkpoint, "Checks", "Demonstration").
  - **`argon2`.** Version 0.45.0 dropped Node 18 and 20 and is tested only on Node 22 and later [S40]. `@node-rs/argon2` ships prebuilt per-platform packages with no install script, and its defaults equal OWASP's minimum (19 MiB, t=2, p=1) [S41, S45]. Node's `crypto.argon2` (v24.7.0) is a raw key-derivation function only and is absent from Node 22 and 20 [S42]. Whether `argon2`'s prebuilt binary loads under the project's `npm ci --ignore-scripts` installs is **unverified**.
  - **`otplib`.** Version 13 (January 2026) is "a complete rewrite with breaking changes" after six years at 12.0.1. It is maintained (13.5.0, 2026-08-21); replay protection is the caller's job through `afterTimeStep` [S43].
  - **Later.** Passkeys and SSO later add `@simplewebauthn/server` and the OpenID-certified `openid-client` [S47].
- **Security.** DataStrata chooses and tests every defence:
  - the hash parameters;
  - token storage;
  - cookies;
  - CSRF;
  - the limiter and lockout;
  - TOTP verification, where RFC 6238 says the verifier "MUST NOT accept the second attempt of the OTP" [S44];
  - audit writes;
  - the session check before every read (§5).

  Few outside reporters will read its code. The Next.js guide prefers a library "for increased security and simplicity" [S35].

### 3.2 Better Auth 1.7.12

- **Recovery.**
  - **Password reset** is enumeration-safe, single-use and consumed inside a transaction. Tokens are stored plain by default (`storeIdentifier: "hashed"` is opt-in), and other sessions survive a reset unless `revokeSessionsOnPasswordReset` is set [S8, S9].
  - **Email verification** uses stateless JWTs, not single-use [S10].
  - **TOTP backup codes** are stored reversibly: encrypted by default, or plain, or through a custom `{ encrypt, decrypt }` pair. There is no hashing branch, and a server-only `viewBackupCodes` returns the codes decrypted. The docs give the default as `"plain"`, which contradicts the source [S22].

  DataStrata still builds hashed recovery codes outside the plugin (R8), the two-person procedure (R9), owner recovery (R10) and the lost-device path (R11). Disabling 2FA replaces only the current session [S22].
- **Maintenance.**
  - **Cadence:** four minor lines shipped in twelve months, 1.4 (2025-11-22), 1.5 (2026-03-01), 1.6 (2026-04-06) and 1.7 (2026-08-18), followed by twelve 1.7 patches by 2026-10-20 [S1].
  - **Breaking changes:** 1.7.0 carried a long breaking-change list. Versions 1.7.0 to 1.7.2 required a new `account.issuer` column, and 1.7.3 removed the requirement [S2].
  - **Support:** `SECURITY.md` says "We only support the latest version of Better Auth.", although npm still carries a `release-1.6` line (1.6.33, 2026-09-14) [S5, S1].
  - **Dependencies:** 17 runtime dependencies, including `kysely`, `jose` and `zod ^4.5.4` [S1]. The repository locks `zod` 3.25.76, the engine's only runtime dependency (`package-lock.json`).
  - **Schema:** its CLI emits SQL for review or applies DDL itself [S20]. `migrator` can still apply it, but each upgrade's schema delta becomes DataStrata's to stage under expand-and-contract.
- **Security.**
  - **Hashing:** the default is scrypt (N=16384, r=16, p=1), not one of OWASP's listed settings, compared with `===` [S7, S45]. It can be replaced by argon2id [S8].
  - **Sessions:** random 32-character tokens are stored and looked up as issued; the cookie carries the token HMAC-signed with the app secret [S11, S14]. A database read alone therefore yields no usable cookie unless the secret is also taken. How the signature is checked in its `better-call` dependency is **unverified**.
  - **Revocation:**
    - The cookie cache is off by default; while it is on, "revoked sessions may remain active on other devices" until it expires [S12, S13].
    - `banUser` revokes all of a user's sessions. `setRole`, member removal and member role changes revoke none [S24, S25].
    - The optional admin plugin's impersonation creates a real session for the target user under an `impersonate` permission [S24].
  - **Cookies and CSRF:** cookies are `HttpOnly` and `SameSite=Lax` [S14]. `Origin` is checked on cookie-carrying writes, and Fetch Metadata guards the "sign-in and sign-up email routes" [S14, S15].
  - **Rate limits:** on in production only, held in process memory by default, keyed on `x-forwarded-for` and path. There is no password lockout [S16, S17].
  - **TOTP:** no record of the step used is kept, so an accepted code is accepted again within its window. The issue is open. One fix was closed unmerged to "avoid schema changes in the v1.x line", and a second awaits review [S22, S23].
  - **2FA enforcement:** the plugin has no option to make 2FA mandatory. Enforcing it needs an enrolment gate and hooks, because the plugin gates only credential sign-in, not passkey, OAuth or magic link [S22].
  - **Audit:** no audit log is offered in the docs read, and database after-hooks run after commit [S18].
  - **Database access:** it accepts a supplied `pg` Pool, a Kysely instance (with the caller setting its `transaction` flag) or a dialect, and issues its queries through Kysely [S19]. Its Postgres docs do not discuss transactions or per-request connections [S19]. Whether its queries can run inside DataStrata's transaction-scoped tenant context (`app.tenant_id` set per transaction, R15) is **unverified**.
  - **Middleware:** its middleware example "only checks for the existence of a session cookie" [S21].
  - **Advisories:** the repository has published 37 advisories: 3 critical, 22 high, 9 moderate and 3 low, 27 of them in 2026 [S6].
    - **Timing:** measured from the main stable `better-auth` patched version, sixteen appeared the day their fix shipped and the longest gap was 113 days. Report-to-fix times are not public [S6].
    - **Outside the baseline:** by our reading of their titles, 25 concern features the baseline would not enable at first: SSO, the OAuth/OIDC provider, SCIM, Stripe, API keys, device authorisation, magic link and OAuth sign-in, secondary storage and the multi-session plugin.
    - **Inside the baseline:** twelve fall in parts it would use: rate limiting (GHSA-44jh, -p6v2, -x732), 2FA with the cookie cache (-xg6x), invitations (-fmh4), passkeys (-4vcf), origin and redirect checks (-36rg, -vp58, -hjpm, -8jhw), an error page (-9x4v) and a start-up fault (-569q). Four of the twelve were published in 2026.
    - **GHSA-fmh4** stays open on 1.6.14 and later unless `requireEmailVerificationOnInvitation: true` is set [S6, S25].

## 4. Fit, requirement by requirement

**Native** means the library does it as configured; **plugin** means an official plugin does it; **build** means DataStrata writes it; **conflict** means the library's behaviour contradicts the requirement and must be bypassed or replaced; **unverified** means no source settled the fit. A cell that departs only from a proposal preference (§6.1's no-ORM choice, §6.8's allowlist) says so; it is not a security finding.

| Id | Custom | Better Auth 1.7.12 | Auth.js v5 beta |
|---|---|---|---|
| R1 | Build on `argon2` | Native by replacement; default scrypt [S7, S8] | Build [S31] |
| R2 | Build | Native; tokens unhashed in the table, signed in the cookie [S11, S14] | Conflict: credentials sign-in is JWT-only, not an opaque server-side session [S31] |
| R3 | Build | Build: role and member changes revoke nothing; `banUser` does [S24, S25] | Build: refusing a JWT before expiry needs a server-side revocation check on every request [S31] |
| R4 | Build | Native with configuration (Postgres store, trusted proxies) [S16, S17] | Build |
| R5 | Build | Plugin and build: `disableSignUp`; inviting needs a member, so the staff flow is built server-side; one option must be set [S8, S25] | Build |
| R6 | Build | Native; not single-use [S10] | Build (its email provider is magic-link sign-in) [S31] |
| R7 | Build on `otplib` 13 | Plugin and build: no mandatory option; replay accepted [S22, S23] | Build (none in the docs read) [S31] |
| R8 | Build | **Conflict**: reversible by design [S22] | Build |
| R9 | Build | Build | Build |
| R10 | Build | Build on the native reset [S8] | Build |
| R11 | Build | Build, with the admin plugin's `revokeUserSessions` [S22, S24] | Build |
| R12 | Build | Build: after-hooks follow commit; the hosted log conflicts with R14 [S18, S27] | Build |
| R13 | Build on SimpleWebAuthn, `openid-client` [S47] | Plugin [S26] | Passkeys experimental; OAuth/OIDC providers native [S31] |
| R14 | Native | Native without Infrastructure [S27] | Native |
| R15 | Native | **Unverified**: accepts a supplied pool or Kysely instance; fit with the transaction-scoped tenant context not shown. Preference: Kysely and its own schema against §6.1's no-ORM choice [S19, S20] | Workable (`@auth/pg-adapter` uses `pg`) [S32] |
| R16 | Build | Plugin and build: separate role stores; the grant is built; impersonation left uninstalled, or blocked (**unverified**) [S24] | Build |
| R17 | Within it (pin `otplib` 13) | Preference: outside §6.8's allowlist (17 runtime dependencies, `zod` 4) unless the user amends it [S1] | Preference: outside the allowlist (new dependencies) [S30] |
| R18 | Build | Native: enumeration-safe, single-use; hashed storage and session revocation are opt-in [S8, S9] | Build [S31] |
| R19 | Build | Build: no password lockout; the limiter is per address and path [S16] | Build |

## 5. Lessons from Stage 1a that bear on the choice

These come from the checkpoint (`CHECKPOINT-stage-1a-claims-and-access-gate.md`) and the design.

1. **Charge an attempt before comparing it.** A burst got through until attempts took turns (checkpoint, "Found while building the gate"). Better Auth fixed the same class in its Postgres limiter (GHSA-44jh: the Kysely adapter in 1.7.0, `better-auth` in 1.7.7) [S6]. On either path, a limiter needs a concurrent-burst test.
2. **A forwarded address is whatever the client writes** (checkpoint, "What was decided"; design §5). Better Auth keys on `x-forwarded-for` unless `trustedProxies` is set [S16, S17]. Either path is configured against the real proxy.
3. **In-memory limiters are per process and empty on restart** (design §2, §5). Better Auth's default store is one of them [S16]. With two machines (§6.7), the limiter belongs in Postgres.
4. **A signing key derived from a shared passphrase allows offline guessing (I2).** The gate's key was one HMAC over the passphrase handed to participants, so a captured token let its holder test guesses offline, outside the limiter (checkpoint; design §5). Signed tokens are not unsafe in themselves; the weakness was where the key came from. For 1b, session tokens are random and no key is derived from a shared or low-entropy secret. Better Auth signs its cookie with the app secret [S14].
   - **Hashing at rest is a separate defence.** Keeping only a token's hash means a database read alone yields nothing usable. That is Lucia's reference design [S34]; Better Auth stores the token as issued [S11].
5. **Framework behaviour decided two outcomes**, and no library removes either: Next rewrites a loopback host to `localhost`, and cookies are not scoped by port (checkpoint; design §5).
6. **A cross-site post reaches a cookieless sign-in** (design §5). Better Auth's Fetch Metadata check covers its email sign-in and sign-up [S14]. A custom build checks `Origin` and `Sec-Fetch-Site` on every state-changing route.
7. **Middleware is a first line only** (design §5; checkpoint, "Found by the demonstrations"). Next's guide puts secure checks in a data access layer [S35]. CVE-2025-29927 bypassed middleware on 15.x before 15.2.3 [S37].
8. **Wiring needs its own tests.** A fail-open middleware body passed all 46 tests (checkpoint). No library tests DataStrata's wiring.
9. **Custom security code is costly to verify.** The gate's six files (902 lines) took:
   - 298 tests, summed from the checkpoint's per-file counts;
   - about 57 of Stage 1a's 69 mutation checks;
   - a share of a whole-change final review (0 Critical, 2 Important, 11 Minor) and of one fix wave (checkpoint, "What landed", "Teeth checks").

   The 1b baseline is several times that surface. That is a judgement, not a measurement.

## 6. Recommendation

**A conditional architectural recommendation: keep §6.2's custom authentication only if 1b's design meets the conditions below and they are verified, with independent review before release. This note does not depart from §6.2.**

**What it rests on.**

- **Two documented concerns with Better Auth 1.7.12**, both confirmed in its source:
  - recovery codes are stored reversibly and cannot be hashed (R8);
  - TOTP has no mandatory option, and an accepted code is accepted again within its window, with the fix not yet merged (R7) [S22, S23].

  Either can be worked around by building beside the plugin: hashed codes outside it, an enrolment gate, a replay record. Once those parts are built, the library no longer supplies the parts of the baseline that matter most for privileged accounts.
- **An architectural fit, not a demonstrated security advantage.** The proposal's model ends sessions and writes the audit row in the same transaction as the role change. It keeps only token hashes at rest and runs under RLS with a per-transaction tenant context. A custom build can follow that model directly. Better Auth's role changes revoke nothing and its after-commit hooks do not share the transaction, so R3 and R12 are built on either path [S18, S24, S25]. Whether its supplied pool can serve the tenant context is **unverified** (§3.2).
- **Preferences, which are the user's to weigh and are not security findings:**
  - §6.1's no-ORM choice against Kysely;
  - §6.8's allowlist against 17 runtime dependencies and a second `zod` major;
  - the maintenance load of a library that supports only its latest version and shipped four minor lines in twelve months [S1, S5].

**What cuts the other way.** Better Auth's verified strengths are real:

- an enumeration-safe, single-use reset;
- `Origin` and Fetch Metadata checks;
- per-path sign-in limits;
- pluggable argon2id;
- passkey and SSO plugins;
- outside scrutiny that has found and fixed real defects [S6].

Custom code has none of that scrutiny. Stage 1a showed what verifying it costs (§5.9), and the Next.js guide recommends a library [S35]. The recommendation therefore holds only under the conditions below; if they cannot be met, the choice re-opens. Auth.js and Lucia are not viable (§2).

**Conditions on the custom path**, as inputs to the 1b design rather than a design:

- **Session tokens.** Random, at least 128 bits, stored only as SHA-256. Revocation deletes rows inside the transaction that removes a role or deactivates an account, together with its audit row (R2, R3, R12).
- **TOTP.** `otplib` 13, storing each user's last accepted time step (RFC 6238 §5.2) [S43, S44].
- **Recovery codes.** Hashed, single-use, consumed by a conditional write.
- **Limiter and lockout.** In Postgres, charged before comparison, counted per account and per trusted client address, proved by a burst test. OWASP ties lockout to the account [S45].
- **CSRF.** `Origin` and `Sec-Fetch-Site` checked on every state-changing authentication route.
- **Session checks.** Middleware checks cookie shape only. A data-access-layer check runs before every read and in every server function [S35, S36].
- **Reset and verification tokens.** Hashed, single-use and expiring.
- **Cookies.** A `__Host-` cookie, `HttpOnly`, `SameSite=Strict` or `Lax` [S45], with relative redirects.
- **Independent review as a release condition.** The authentication code is reviewed independently before release (Stage 5), because few outside reporters will otherwise read it. How the review is obtained, and any cost, is the user's decision; this note authorises no expenditure.
- **A supported Node baseline.** Node 24 LTS is proposed (§3.1, §7).

**What DataStrata keeps either way:**

- authorisation, including the rule that no tenant role resolves a staff route;
- tenancy: RLS, the four roles and the per-transaction context, with a policy design for the global authentication tables [S46];
- audit;
- recovery procedures;
- incident response: advisory monitoring, patching, mass revocation and secret rotation;
- email delivery;
- the tests;
- Next.js upgrades. Next 16 runs `proxy` on Node only [S36]. Whether Next 15's maintenance ends about now or in late 2027 is **unverified** [S36].

**What would change it.** Any of these re-opens the comparison:

- A customer requires SAML before Stage 4 (see the third disagreement below).
- Better Auth ships replay-safe TOTP, hashed backup codes and revocation on role change, and its fit with the transaction-scoped tenant context is shown.
- Independent review before release cannot be arranged.
- A condition above proves impractical in 1b's design.
- Self-serve signup, social login or magic links enter scope (§9.3).

**Where the proposal and the sources disagree:**

- §6.2 calls the primitives "small and well understood". The Next.js guide recommends a library [S35], and this year the primitives moved: `argon2` dropped Node 20, `otplib` was rewritten and Oslo was deprecated [S40, S43, S34]. They are small, but keeping them current is not free.
- §6.3's hashed recovery codes are stricter than OWASP, which asks only that codes be single-use [S45]. The note keeps the proposal's choice.
- §6.2 says a customer's SSO requirement before Stage 4 is "the point to add it, not to change the foundation", and §6.1 plans an OIDC client. SAML is not OIDC, and Better Auth's SSO plugin covers it, with five advisories [S26, S6]. So the note treats a SAML requirement as a reason to re-open the choice.
- Better Auth's docs call Node-runtime middleware experimental before Next 16 [S21]. Next.js says it was stable from 15.5.0 [S36]. The note follows Next.js.

## 7. Decisions for the user

1. **Keep §6.2 under the conditions of §6 (the conditional recommendation), or adopt Better Auth.** Adopting it amends §6.1's Authentication and Persistence rows and §6.8. R3, R5, R7–R12, R16 and R19 would still be built on top of it.
2. **A supported Node baseline, whichever argon2 binding is chosen; Node 24 LTS proposed** [S42]. CI runs Node 20, which has been end-of-life since 2026-04-30. Then 1b's design chooses the binding: `argon2` (tested on Node 22 and later) or `@node-rs/argon2` [S40, S41]. This note changes no CI file or dependency.
3. **Pin `otplib` to major 13 in §6.8** [S43].
4. **Independent review of the authentication code as a release condition.** Identified here; this note authorises no expenditure.

### Separate maintenance item, not part of this comparison

- **The exposure.** The lockfile resolves `next` 15.5.23 and `sharp` 0.34.5. GHSA-2464-fhr4-w9xw (CVE-2026-96889, Critical, published 2026-10-14) affects `next` 15.5.27 and earlier when it runs on glibc-based Linux. It is patched in 15.5.28, and the stated workaround is `sharp` 0.35.5 or later [S37].
- **Scope.** It applies whichever authentication path is chosen.
- **Action.** This note changes nothing. The patch is the user's to schedule, before any deployment or `next build` from a clean checkout.

## 8. Sources (read 2026-10-21, UTC, except where a re-read on 2026-10-22 is marked)

Better Auth source files are at `https://github.com/better-auth/better-auth/blob/v1.7.12/<path>`.

- S1. npm `better-auth`: https://registry.npmjs.org/better-auth (versions, release times, dist-tags, 1.7.12 `dependencies`)
- S2. https://better-auth.com/changelog; https://www.better-auth.com/docs/guides/1-7-upgrade-guide
- S3. `LICENSE.md` at v1.7.12
- S4. "Better Auth is joining Vercel", 2026-07-07: https://better-auth.com/blog/better-auth-joins-vercel
- S5. `SECURITY.md` at v1.7.12
- S6. Repository advisories, pages 1–4: https://github.com/better-auth/better-auth/security/advisories (each at `…/advisories/<GHSA id>`), with publication dates set against S1's release times
- S7. `src/password.node.ts` at `@better-auth/utils` v0.5.0: https://github.com/better-auth/utils/blob/v0.5.0/src/password.node.ts
- S8. https://www.better-auth.com/docs/authentication/email-password; https://www.better-auth.com/docs/reference/options; `packages/core/src/types/init-options.ts`
- S9. `packages/better-auth/src/db/verification-token-storage.ts`; `packages/better-auth/src/api/routes/password.ts`
- S10. `packages/better-auth/src/api/routes/email-verification.ts`
- S11. `packages/better-auth/src/db/internal-adapter.ts`
- S12. https://www.better-auth.com/docs/concepts/session-management
- S13. https://www.better-auth.com/docs/reference/options (cookie cache default)
- S14. `packages/better-auth/src/cookies/index.ts`; https://www.better-auth.com/docs/reference/security
- S15. `packages/better-auth/src/api/middlewares/origin-check.ts`
- S16. `packages/better-auth/src/api/rate-limiter/index.ts`; https://www.better-auth.com/docs/concepts/rate-limit
- S17. `packages/core/src/utils/ip.ts`
- S18. https://www.better-auth.com/docs/concepts/hooks; https://www.better-auth.com/docs/concepts/database
- S19. `packages/kysely-adapter/src/dialect.ts`; https://www.better-auth.com/docs/adapters/postgresql (both re-read 2026-10-22)
- S20. https://www.better-auth.com/docs/concepts/cli; `packages/better-auth/src/db/get-migration.ts`
- S21. https://www.better-auth.com/docs/integrations/next
- S22. `packages/better-auth/src/plugins/two-factor/index.ts`, `…/backup-codes/index.ts`, `…/totp/index.ts`, `docs/content/docs/plugins/2fa.mdx`; `src/otp.ts` at `@better-auth/utils` v0.5.0
- S23. https://github.com/better-auth/better-auth/issues/10387; https://github.com/better-auth/better-auth/pull/11259 (closed unmerged 2026-09-17); https://github.com/better-auth/better-auth/pull/11833 (open)
- S24. `packages/better-auth/src/plugins/admin/routes.ts`, `…/admin/access/statement.ts`; https://www.better-auth.com/docs/plugins/admin
- S25. `packages/better-auth/src/plugins/organization/routes/crud-org.ts`, `crud-invites.ts`, `crud-members.ts`; https://www.better-auth.com/docs/plugins/organization
- S26. https://www.better-auth.com/docs/plugins/passkey; https://www.better-auth.com/docs/plugins/sso; https://registry.npmjs.org/@better-auth/passkey/latest; https://registry.npmjs.org/@better-auth/sso/latest
- S27. https://better-auth.com/docs/infrastructure/introduction; https://better-auth.com/docs/infrastructure/getting-started; https://better-auth.com/docs/infrastructure/plugins/audit-logs; https://better-auth.com/products
- S28. "Auth.js joins Better Auth", 2025-09-22: https://www.better-auth.com/blog/authjs-joins-better-auth
- S29. Auth.js team announcement, 2025-09-26: https://github.com/nextauthjs/next-auth/discussions/13252
- S30. https://registry.npmjs.org/next-auth
- S31. https://authjs.dev/getting-started/authentication; https://authjs.dev/getting-started/authentication/credentials; https://authjs.dev/reference/core/errors; https://authjs.dev/concepts/session-strategies; https://authjs.dev/getting-started/authentication/webauthn
- S32. https://authjs.dev/getting-started/adapters/pg; `packages/adapter-pg/src/index.ts` and `packages/core/src/adapters.ts` in `nextauthjs/next-auth` on `main` (no commit pinned)
- S33. https://github.com/nextauthjs/next-auth/security/advisories (GHSA-7r7x-4c4q-c4qf, -v64w-49xw-qq89, -5jpx-9hw9-2fx4, -7rqj-j65f-68wh, -x445-f3h2-j279, -xmf8-cvqr-rfgj, -8fpg-xm3f-6cx3)
- S34. https://github.com/lucia-auth/lucia (README; `code/auth_session.ts` on `main`); https://github.com/lucia-auth/lucia/discussions/1714; https://pilcrowonpaper.com/blog/18 (2026-07-29); https://registry.npmjs.org/@oslojs/otp/latest
- S35. https://nextjs.org/docs/app/guides/authentication; https://nextjs.org/docs/15/app/guides/authentication
- S36. https://nextjs.org/blog/next-15-5; https://nextjs.org/blog/next-16; https://nextjs.org/docs/app/guides/upgrading/version-16; https://nextjs.org/docs/app/api-reference/file-conventions/proxy; https://nextjs.org/support-policy
- S37. https://github.com/advisories/GHSA-f82v-jwr5-mffw (CVE-2025-29927); https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw; the repository's `package-lock.json`
- S38. https://github.com/supertokens/supertokens-core; https://github.com/ory/kratos; https://docs.stack-auth.com/docs/others/self-host; https://github.com/logto-io/logto; https://github.com/zitadel/zitadel; https://docs.goauthentik.io/core/architecture/; https://github.com/teamhanko/hanko
- S39. https://github.com/glincker/theauth; https://registry.npmjs.org/@glinr/theauth
- S40. https://registry.npmjs.org/argon2; https://github.com/ranisalt/node-argon2 (README; v0.45.0 release notes)
- S41. https://registry.npmjs.org/@node-rs/argon2; https://github.com/napi-rs/node-rs/tree/main/packages/argon2
- S42. https://nodejs.org/docs/latest-v24.x/api/crypto.html; https://nodejs.org/docs/latest-v22.x/api/crypto.html; https://nodejs.org/docs/latest-v20.x/api/crypto.html; https://github.com/nodejs/Release and https://nodejs.org/en/about/previous-releases (both re-read 2026-10-22)
- S43. https://registry.npmjs.org/otplib; https://github.com/yeojz/otplib (README; `packages/totp/README.md`)
- S44. RFC 6238 §5.2: https://www.rfc-editor.org/rfc/rfc6238
- S45. OWASP Cheat Sheets (Password Storage, Multifactor Authentication, Forgot Password, Session Management, Authentication): https://cheatsheetseries.owasp.org/cheatsheets/
- S46. https://www.postgresql.org/docs/current/ddl-rowsecurity.html; https://www.postgresql.org/docs/current/functions-admin.html
- S47. https://registry.npmjs.org/openid-client/latest; https://openid.net/certified-open-id-developer-tools/; https://registry.npmjs.org/@simplewebauthn/server/latest
