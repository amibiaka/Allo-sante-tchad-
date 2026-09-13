# Allo Santé Tchad — Engineering and production-readiness assessment

**Review date:** 8 September 2026  
**Repository baseline:** `30b50fc`  
**Scope:** Architecture, authorization, privacy, reliability, data integrity, scalability, maintainability, testing, and operations.

## 1. Executive assessment

**This is a useful POC, but it is not ready for unattended production use with real patient information.** The main obstacle is not React, Supabase, or the absence of microservices. It is that important business and security rules are incomplete across the database policies, browser, and background jobs, and there is no reproducible automated test suite protecting them.

The architecture can be evolved incrementally. Keep the lightweight frontend and managed PostgreSQL backend. First repair authorization and patient access, make deployment reproducible, and establish meaningful tests. A wholesale rewrite would add risk without automatically resolving these issues.

| Area | Assessment |
|---|---|
| Design patterns | Reasonable POC foundation; contracts and domain boundaries need strengthening |
| Security | Release-blocking authorization and credential-handling defects |
| Privacy | Phone disclosure through tracking codes; overly broad professional access; incomplete retention |
| Stability | Network failures, concurrent authentication, uploads, and cleanup lack reliable recovery |
| Scalability | Suitable starting shape, but capped lists, repeated polling, and unbounded work need measurement and redesign |
| Maintainability | Two divergent app trees, handwritten infrastructure workflows, no static quality gates |
| Tests | No checked-in automated test suite or measurable coverage report found |
| Operations | No reproducible release pipeline, recovery evidence, or actionable job monitoring found |

### Scope and confidence

`app/` is treated as the main implementation because it contains newer features and migrations `07`–`09`. `allo-sante-tchad 3/` is a divergent older copy, not an identical backup. The actual Netlify deployment root and installed database migrations were not available for verification.

Findings below describe the repository, assuming the main SQL scripts and subsequent migrations are applied. **Code-confirmed** means visible in source; it does not mean exploited against a running database. **Reproduced** means exercised locally with synthetic inputs. **Verify** means deployment configuration or product policy must establish the actual exposure.

No live patient data was accessed, no live API was attacked, and no deployment or application behavior was changed. Comments in `07_durcissement.sql` describe existing real records; those counts are not independently verified. Treat the possibility of real use seriously despite the POC label.

## 2. Architecture and design patterns

### What is already sensible

- React pages are lazy-loaded, with shared components and a small dependency surface.
- `app/src/lib/db.js` is a facade over local and Supabase adapters. This is a useful separation between UI and persistence.
- Direct Supabase access can be appropriate when grants, RLS, and RPC authorization are complete. Browser controls must never be the security boundary.
- Database enums, foreign keys, indexes, security-definer RPCs, and protection triggers already exist.
- Private media storage, per-file size/MIME restrictions, client image compression, voice input, RTL, and low-bandwidth handling show attention to the operating context.
- `app/netlify.toml` includes CSP and other security headers. The service worker intentionally excludes cross-origin Supabase traffic.
- Migration `07` improves media authorization, restricts anonymous table access, closes direct patient inserts, and adds some rate limiting. These improvements should be retained and tested.

### Where the design needs to evolve

The facade dispatches string names without a typed interface. Large adapter files combine authentication, transport, reference caching, patient workflows, administration, and polling. Pages orchestrate multi-step uploads and record creation. Business rules are spread across UI checks, adapter transformations, RLS, and triggers, making it easy for the local demo and real backend to disagree.

**Recommended target:** a modular application, not microservices.

```text
React feature pages and accessible shared components
                 |
Typed use cases: submit request, respond, obtain contact, moderate
                 |
Repository interfaces + transport/session infrastructure
                 |
Supabase adapters / explicitly isolated demo adapters
                 |
PostgreSQL: authoritative authorization, invariants, transactions
                 |
Durable jobs: media cleanup, escalation delivery, reconciliation
```

Use feature boundaries such as `requests`, `prescriptions`, `directory`, `identity`, and `administration`. Move orchestration into testable use cases/hooks. Introduce TypeScript incrementally, starting with DTOs, adapter contracts, sessions, and workflow states. Generate or maintain database types and validate external data at runtime; types alone do not validate HTTP payloads.

Keep the custom hash router if its small scope remains justified, but test malformed URLs, navigation, focus, and recovery. Keeping handwritten authentication has a much higher maintenance cost: use a maintained auth client, or explicitly own refresh locking, retry bounds, cross-tab synchronization, callback handling, recovery, and security tests. Measure bundle cost rather than relying on comments about SDK weight.

Do not introduce Kubernetes, distributed services, database sharding, or a global state framework without measured need.

## 3. Prioritized security and privacy findings

Priority: **P0** blocks real-data release; **P1** required before expanding a controlled pilot; **P2** planned hardening. Owners are suggested responsibilities, not existing team assignments.

### SEC-01 — Tracking codes disclose phone numbers and are weak bearer credentials — P0

**Code-confirmed.** `app/supabase/01_installation.sql:375` (`remplir_code`) creates codes from the patient's phone number plus two letters. `backendSupabase.js` includes `code` in both request and prescription selections. Therefore a professional who can read a case can recover its phone number **before** the contact RPC's engagement check. Removing `contact_tel` from SELECT does not protect the same information embedded in `code`.

The 21-letter suffix has only **441 combinations**, confirmed locally. Tracking RPCs expose medical descriptions, location information, notes, and responses; `annuler_demande` uses the same credential to cancel a request. A reader with the code also has this anonymous patient capability.

Failed lookups are limited by digits extracted from the code, rather than requester identity. An attacker can lock a known patient out after 12 wrong attempts. Alphabetic fallback codes have no numeric limiter key. Codes use PostgreSQL `random()`, not a cryptographic token generator. These controls do not make a short phone-derived credential adequate.

**Fix:** separate a public reference from a cryptographically random, high-entropy patient access token. Do not return patient tokens to professionals. Store a hash of the token, support expiry/revocation, and use a separate or stronger authorization check for cancellation. Provide an accessible recovery flow. Apply layered request throttling without making a patient's phone number the sole global lockout key. Migrate existing links deliberately.

**Acceptance:** ordinary case reads never disclose phone-derived identifiers or patient tokens; guessed references reveal nothing; one requester cannot lock out a patient; cancellation requires the intended capability. **Owner:** backend/security.

### SEC-02 — Response insertion does not authorize access to the target case — P0

**Code-confirmed; live execution not performed.** `01_installation.sql:889` (`rep_depot`) checks only that `pro_id = mon_pro()` or the caller is an administrator. `:920` (`repord_depot`) only compares the pharmacy ID to `mon_pro()`. Neither verifies the caller's right to the target case; the prescription insert does not establish that the caller is a pharmacy.

`maj_statut_demande` (`:432`) runs with definer privileges and changes the target request based on that inserted response. `contact_demande` and `contact_ordonnance` (`:1009`, `:1029`) treat the response as authorization to disclose patient contact information. With a known target UUID, an out-of-area professional can potentially create the qualifying response and use those privileged paths. UUID secrecy is not authorization. Testing must use insert without `return=representation`, because SELECT restrictions can hide a writable path.

**Fix:** authorize target visibility, active account, verified professional role, geographic/recipient scope, allowed action, and case state within an atomic response operation. Recheck authorization inside contact RPCs. Restrict direct table writes accordingly. Scope administrators too.

**Acceptance:** negative tests with known cross-zone UUIDs cannot insert responses, read contacts, or change state; non-pharmacies cannot answer prescriptions. **Owner:** backend/security.

### SEC-03 — Self-declared professionals can expand their own patient-data access — P0

**Code-confirmed.** `mon_pro`, `mes_zones`, and `dem_lecture_pro` accept `provisoire` professionals. `pro_creation` permits self-owned records and `pro_maj` permits owners to update their records. The protection trigger does not protect professional `type`, `ville_id`, or `province_id`. `professionnels.profil_id` is indexed but not unique.

A user can declare a professional identity and location, change locations, or create multiple professional records to expand coverage. Request reads do not restrict profession type. Email confirmation verifies mailbox control, not clinical credentials. In addition, `mon_pro`, `mes_zones`, and professional read policies do not consistently require `profils.actif`; disabling the profile in the UI does not reliably revoke database access. Probation expiry depends on a scheduled status update rather than a time check on access.

**Fix:** separate registration from approval to read patient information. Define verification and assignment rules, prevent self-approval of scopes/type changes, enforce account-active and expiry predicates centrally, and use explicit professional memberships if multiple practices are legitimate.

**Acceptance:** pending, disabled, expired, and suspended identities cannot access patient information; a self-edit cannot expand scope. **Owner:** backend + operations/product.

### SEC-04 — Actual login passwords persist in localStorage after logout — P0

**Code-confirmed.** In `backendSupabase.js`, `connecter` calls `poserCleLocale(saisi, motDePasse)`. This stores an entered password, not just a session token. `deconnecter` clears session tokens but not `ast.cle.*`. Keys normalize identifiers by stripping non-digits, so email addresses can collide on the same storage key.

An XSS vulnerability or access to the browser profile can expose reusable credentials. Shared-phone logout leaves a credential behind. Tokens are also stored in localStorage, increasing the impact of an XSS defect; this review did not establish an exploitable XSS path. OWASP advises against storing sensitive information in localStorage. [OWASP HTML5 security guidance](https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html)

**Fix:** stop persisting passwords and recovery secrets; remove legacy entries during migration. Use a deliberate session model, clear appropriate sensitive device state on logout, implement account recovery, and require stronger authentication/MFA for administrators. If using HttpOnly cookies via a backend, also implement CSRF protection; cookies alone are not the whole solution. Assess credential reset needs if real users used this flow.

**Acceptance:** browser storage contains no reusable password before or after logout; email identities cannot collide; recovery and administrator authentication are tested. **Owner:** identity/frontend.

### SEC-05 — Internal professional fields remain readable to authenticated users — P0

**Code-confirmed under the expected Supabase authenticated table grants.** `07_durcissement.sql` restricts professional SELECT columns only for `anon`. `pro_lecture_publique` also applies to `authenticated`, allowing reads of provisional/verified professionals. Signed-in callers can request internal fields such as `note_admin`, `profil_id`, and `verifie_par` directly, regardless of the frontend's public selection.

**Fix:** separate public directory fields from private moderation data, or implement explicit grants and authorized RPCs/views for each audience. Ensure views preserve intended authorization. Test all roles, not only anonymous access. Grants and RLS must both be checked. [Supabase RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security)

**Acceptance:** ordinary authenticated accounts cannot select internal moderation fields. **Owner:** backend/security.

### SEC-06 — Administrator scope and audit integrity are inconsistent — P1

**Code-confirmed.** `01_installation.sql` uses broad `est_admin()` access for profile reads, response reads, neighborhood writes, reports, and the administrative journal. `journal_admin_pol` is `FOR ALL`, allowing admins to modify/delete audit records and submit arbitrary actor fields. Frontend `journaliser` is best-effort and only called for some actions. This contradicts the README's blanket statement that local administrators only see and modify their own area.

**Fix:** establish an explicit role/resource/action matrix. Apply geographic scope wherever required; document any intentional national permissions. Generate audit events transactionally on the server, derive the actor from trusted identity, and make the journal append-only to application roles. Include contact/media access and sensitive changes without logging full clinical payloads.

**Acceptance:** cross-area operations are denied or explicitly approved by policy; administrative actions cannot erase their evidence. **Owner:** backend/security.

### SEC-07 — Phone verification badge can be true at creation — P1

**Code-confirmed.** `professionnels.numero_confirme` defaults to `true` (`01_installation.sql:144`). `forcer_provisoire` does not force it false during insert. Migration `07` protects it on UPDATE only. A new unverified professional can therefore retain or explicitly supply a confirmed-number flag.

**Fix:** default to false and force untrusted inserts to false; allow confirmation only through a verified administrative or OTP process. Retest both INSERT and UPDATE. **Owner:** backend.

### SEC-08 — Anonymous abuse and media ownership are insufficiently constrained — P1

**Code-confirmed.** Migration `07` limits submissions using caller-supplied phone numbers or a shared city quota. Rotating numbers bypasses the per-number limit; filling a city quota can deny legitimate submissions. Anonymous storage upload has filename, MIME, and per-file size restrictions, but no application-level upload quota or reservation tied to a submission.

Creation RPCs accept caller-supplied media paths without proving upload ownership. Because storage reads are granted through linked cases, attaching a known foreign object path to a case the attacker can read can undermine media scoping. The filename is not an authorization capability.

**Fix:** issue short-lived, constrained upload reservations, validate ownership when attaching media, enforce per-request/account/network and aggregate storage budgets, reconcile orphan uploads, and validate file content where needed. Preserve an emergency fallback when throttled. Bound public RPC work, including `stats_publiques(p_jours)`. **Owner:** backend/platform.

### SEC-09 — Retention and consent do not cover the full data lifecycle — P1

**Code-confirmed gap; governance details require verification.** `purger_medias` clears media references, but phone numbers, descriptions, notes, location, responses, auth metadata, and local device history remain. Form copy hardcodes 30 days while server retention is configurable. The adapter sends `consentement: true` rather than carrying a versioned consent record from the form. Existing UI consent is useful, but there is no recorded notice version or granular policy history.

**Fix:** define retention by data category, including backups, logs, auth metadata, exports, and browser state. Record consent/notice version and time as appropriate, document recipient disclosure and user-initiated WhatsApp sharing, and implement deletion/correction workflows. Obtain jurisdiction-specific advice about hosting, health information, minors, and controller/processor responsibilities; this assessment makes no legal compliance determination. **Owner:** product/privacy + backend.

### SEC-10 — Browser admin gate is not a security control — P2

**Code-confirmed.** `VITE_ADMIN_GATE_CODE` is compiled into frontend code and compared in `pages/admin/Admin.jsx`; the result is stored in sessionStorage. The hidden route and gate are discoverable/bypassable. Actual protection must remain in authentication and the database.

**Fix:** remove security claims around this gate; use server-enforced authorization and MFA. Validate that only a publishable/anonymous key enters the browser: `cleValable` accepts JWT-shaped strings without rejecting privileged service-role JWTs. No actual service-role secret was found in the inspected application files. **Owner:** identity/platform.

## 4. Reliability and data-integrity findings

| ID / Priority | Evidence and consequence | Required change and acceptance |
|---|---|---|
| REL-01 / P1 | **Reproduced:** `netlify/functions/purge-medias.mjs` increments list offsets while deleting earlier results. With 250 expired files it deletes 150 and leaves 100. | Use a stable deletion worklist/cursor or repeatedly fetch a safe first batch. Tests with more than two pages must delete every eligible object. |
| REL-02 / P1 | **Reproduced:** Storage list HTTP 503 still returns `ok: true`; deletion failures are ignored. References are cleared before deletion succeeds. Both scheduled functions return HTTP 200 for several error cases. | Durable cleanup state with retries, truthful error status, structured metrics, and alerts. Retain evidence until deletion succeeds; test partial failures and restarts. |
| REL-03 / P1 | `backendSupabase.js` has no shared token-refresh lock; concurrent callers can refresh the same token. HTTP 401 recursively calls `requete` after refresh without a retry bound. | Single-flight refresh, bounded retry, cross-tab synchronization, and explicit session expiry. Simulate concurrent calls, refresh failure, and repeated 401. |
| REL-04 / P1 | Most fetch calls have no deadline or abort signal. Poll callbacks are not awaited; `try/catch` around an async callback does not catch its rejection. | Central transport with timeout, cancellation, typed errors, safe retry/backoff, and one in-flight poll per resource. Avoid automatic write retries without idempotency. |
| REL-05 / P1 | Uploads and record creation are separate operations in `DemandeAide.jsx` and `Ordonnance.jsx`. There is no server idempotency key. A committed submission whose response is lost can be duplicated on retry. | Client operation ID + database uniqueness; resumable submission status and orphan reconciliation. An ambiguous retry returns the original case. Disabled buttons already help ordinary double-clicks but cannot solve network ambiguity. |
| REL-06 / P1 | `DemandeAide.jsx:59` and `Ordonnance.jsx:50` silently ignore voice upload failure. Voice may contain the patient's only description. | Clearly show failed attachment state; allow retry or explicit submission without it. Never present a voice-only report as fully delivered after losing its recording. |
| REL-07 / P1 | Tracking pages turn network errors into `null`/“not found”, discarding previous information. Reference initialization swallows failures and the facade discards its degraded diagnostic. | Distinguish unavailable, forbidden, missing, stale, and loading. Preserve last confirmed state with a freshness indicator and retry action. |
| REL-08 / P0 | `config.js` automatically selects demo mode when production configuration is missing/invalid. `vite.config.js` strips console warnings. A broken deployment can simulate successful submissions locally. | Explicit demo build/environment; fail production builds/startup checks when configuration is invalid. Verify production calls a real configured backend before release. |
| REL-09 / P1 | `App.jsx` uses Suspense without a React error boundary. `router.jsx` calls `decodeURIComponent` on untrusted route input; malformed encoding throws. `net.js` accesses localStorage without protection. | Route/app error boundaries, safe route parsing, resilient storage abstraction, useful recovery UI. Existing `secours.js` startup recovery does not replace render-error handling. |
| REL-10 / P1 | Creation RPCs validate consent and urgency but lack comprehensive text/category/contact/location/media validation. Nullable and individually valid geo foreign keys can be inconsistent with one another. | Runtime schemas + database bounds/invariants, coherent city/province/neighborhood assignment, valid pharmacy targets, coordinate limits, and meaningful content rules. Reject inconsistent data at the API boundary. |
| REL-11 / P1 | `maj_statut_demande` can set a request resolved without an explicit transition/assignment check. Responses have no operation deduplication; multiple professional records make `mon_pro() LIMIT 1` ambiguous. | Model allowed state transitions and ownership explicitly, transact commands, record events, and enforce appropriate uniqueness. Concurrent responders must produce a defined outcome. |
| REL-12 / P1 | `07` revokes all anonymous table privileges then restores no INSERT on `signalements`; `backendSupabase.signaler` still inserts directly and catches failure. | Restore a narrowly validated reporting path, preferably an abuse-controlled RPC. Anonymous reporting must succeed while forged status/moderator fields fail. |
| REL-13 / P1 | `escalader_urgences` only sets `escalade_le`, widening visibility. There is no durable notification/delivery/acknowledgment workflow. `en_ligne` is a stored boolean with no demonstrated heartbeat expiry. | Define what “escalated” and “available” promise. If active dispatch is required, use an outbox, retries, delivery tracking, acknowledgment deadlines, and an operational fallback. Expire availability based on activity. Do not equate a link click or `appelle` response with a completed call. |
| REL-14 / P2 | Media recorder setup can fail after microphone acquisition; image decoding is unbounded before scaling; repeated recordings/previews require careful URL/track cleanup. | Add guaranteed cleanup on errors/unmount, input pixel/size limits, and device tests for unsupported formats, denied permission, low memory, and navigation during acquisition. Verify prescription text remains legible after compression. |

## 5. Scalability and performance

| Finding | Recommendation |
|---|---|
| Directory/admin queries cap at 200–300 rows; request feed caps at 200 and prescription feed at 100. No pagination is exposed. Active requests beyond the limit can disappear from view. | Cursor pagination with deterministic tie-breakers, explicit “more results”, and separate urgency queues. Verify the oldest unhandled urgent case remains discoverable. |
| Entire feeds and nested responses are repeatedly fetched. Patient pages poll every 10–12 seconds; professional polling does not await completion. | Deduplicate, stop/slow when hidden or offline, use jitter/backoff, fetch summaries first and detail on demand. For illustration, 1,000 clients polling every 10 seconds generate about 100 polling requests/second before other calls; this is a scenario, not a measured capacity limit. |
| Mostly individual indexes exist; RLS contains correlated subqueries. `upper(code)` lookups do not naturally use the ordinary code index. Public statistics aggregate source rows on each call. | Measure representative queries with `EXPLAIN (ANALYZE, BUFFERS)` using realistic roles/data. Add workload-specific compound/partial/expression indexes, normalized token lookups, and cached/bounded aggregates where justified. |
| All reference rows are loaded in one request per table and cached for seven days; there is no explicit paging or reference version. | Check actual API row caps, paginate complete reference loads, version data, and load geography progressively. Test larger datasets beyond configured server row limits. |
| Cleanup scans at most 50 pages per folder and runs under serverless execution limits. | Bounded resumable batches with cursor/work-state, job locking/idempotency, runtime budgets, lag alerts, and cost tracking. |
| `limiter` deletes old entries during every submission and uses shared city counters. | Move routine cleanup to maintenance, benchmark contention, and avoid turning a hot city row into a bottleneck. |
| `check-size.mjs` excludes lazy pages even though the lazy home route is required for first usable display; scripts/icons and service-worker downloads are not fully modeled. | Enforce measured cold/warm navigation budgets, including the home chunk and critical requests, on representative low-end devices and slow networks. Distinguish initial UI transfer from background precache. |
| `public/sw.js` uses a manually maintained version and immediately activates new workers; install tolerates failed precaches. | Generate a release version and asset manifest, scope cache cleanup, ensure an offline shell is complete, bound caches, and test interrupted upgrades/rollback/open tabs. Do not cache patient APIs if future endpoints share the origin. |

Define expected active users, peak submissions, record growth, attachment storage, and acceptable response times before sizing infrastructure. Load tests should combine real RLS roles, nested feeds, uploads, tracking, and cleanup. Do not claim national-scale readiness from a small demo database.

## 6. Maintainability, deployment, and operations

### MNT-01 — Two divergent applications create deployment ambiguity — P1

`app/` and `allo-sante-tchad 3/` differ across source, SQL, configuration, and assets. The older tree lacks migrations `07`–`09`. Select one authoritative application, archive the other through version control after verifying deployment usage, and add a root README defining the build root. Avoid applying fixes to only one active copy.

### MNT-02 — Installation instructions omit security migrations — P0

`app/README.md:43` tells operators to install `01`–`03`, later use `04`–`06`, and disable email confirmation. It does not include `07`–`09` in that setup sequence. A fresh install following the README misses hardening and conflicts with the newer email flow.

Use ordered, versioned migrations with a migration ledger; test fresh creation and upgrades. Do not rerun the old baseline against hardened deployments: it recreates broader policies and replaces functions. Separate seeds/demo data from migrations and use environment guards for destructive cleanup. Add schema/grant drift checks and assertions for every sensitive table/function/storage policy. Correct the comments in `07` claiming `CREATE OR REPLACE FUNCTION` resets permissions: PostgreSQL documents that replacement preserves ownership and permissions. Explicit revokes remain useful, but the explanation is wrong. [PostgreSQL CREATE FUNCTION documentation](https://www.postgresql.org/docs/current/sql-createfunction.html)

### MNT-03 — Builds and dependency state are not reproducible — P1

No lockfile, CI workflow, test script, lint configuration, typecheck, `.env.example`, or `.gitignore` was found in the tracked project. Dependencies use version ranges. Node's package engine constraint and deployment runtime are not a single pinned toolchain.

Commit a lockfile, use deterministic installs, pin a supported runtime consistently, add an environment template containing placeholders only, and ignore secrets/build artifacts/dependencies. Configure dependency and secret scanning, license inventory, routine updates, and required review checks. No dependency vulnerability count is asserted: installed versions and an audit were unavailable.

### MNT-04 — Production configuration is scattered — P1

CSP `connect-src` hardcodes a particular Supabase origin while application configuration is environment-driven. A new project can build correctly and have its API blocked by CSP. The security headers are Netlify-specific; alternative hosting needs equivalent configuration. Duplicate manifest header blocks also merit a deployed-header check.

Validate environment/schema compatibility and generate or verify CSP against the selected backend. Explicitly configure development, staging, production, redirects, email callback URLs, SMTP, auth throttles, backup tier, scheduling, and secrets access. A public Supabase project URL or publishable key is not itself a secret.

### MNT-05 — Missing operational evidence — P1

No checked-in service objectives, monitoring configuration, incident/runbook process, backup restoration rehearsal, or release rollback procedure was found. External configuration may exist; it must be verified.

Add redacted error monitoring and correlation IDs, API latency/error dashboards, database/storage/cost alerts, scheduled-job heartbeats, escalation lag and cleanup backlog alerts, and a named responder. Define recovery time and recovery point objectives; test restoring both database and storage plus policy/configuration state. Use synthetic staging data and restricted preview environments. Avoid clinical details, phone numbers, passwords, and patient tokens in logs.

### MNT-06 — Accessibility, localization, and browser support need validation — P1/P2

`components/base.jsx` provides useful roles and large targets, but `Champ` relies on an optional `id`; many callers do not connect label and input. Errors lack systematic `aria-describedby` linkage. The modal does not trap focus or restore it to the invoker. Some pages nest buttons in anchors. Route changes do not establish a consistent focus/announcement pattern.

Add keyboard/screen-reader tests, focus handling, semantic controls, contrast/reflow checks, and visible error association. Test FR/AR/EN and the explicitly experimental transliteration mode with local reviewers. Validate critical emergency wording and geographic data with responsible domain owners. Keep translation key and placeholder parity checks. `replaceAll` and other runtime APIs are used despite older browser targets; transpilation targets alone do not provide API polyfills. Establish an actual supported-device matrix.

## 7. Test coverage assessment and required strategy

**There are not enough reproducible tests.** No `*.test.*`/`*.spec.*` files, automated test runner, coverage configuration, or CI gate was found. This is **zero checked-in automated test evidence found**, not a measured 0% line-coverage result. Production behavior and deployed configuration were not tested.

`supabase/06_verification.sql` contains 13 installation checks and is useful, but does not prove policy behavior across roles/actions. The README describes 23 PostgreSQL and 28 browser checks; their executable tests, fixtures, and results are not present. Those claims cannot serve as regression protection. `check:size` is a performance utility, not functional coverage.

### Evidence gathered in this review

| Check | Result |
|---|---|
| Repository inventory and comparison | Two divergent application trees; main app has later migrations; no tracked automated suite/lockfile/CI found |
| Syntax checks | `node --check` passed for both scheduled functions and the main service worker |
| Cleanup with mocked Storage API | 250 old objects → 150 deleted, 100 incorrectly left behind |
| Cleanup with mocked list HTTP 503 | Returned HTTP 200 JSON containing `ok: true` |
| Tracking suffix calculation | 21 × 21 = 441 possible phone suffixes |
| Production build / browser E2E / measured bundle | Not run: dependencies and build outputs absent; no dependency installation performed |
| PostgreSQL/Supabase policy execution | Not run: no configured disposable database; `psql` unavailable |
| Deployed permissions, auth settings, backups, headers | Not verified; deployment access not part of this review |

The cleanup experiment imported the existing function, substituted `globalThis.fetch`, and used only synthetic objects and a dummy `example.invalid` origin. The mock modeled offset pagination over the remaining object list and removed names on DELETE. It made no network requests and changed no application files.

### Required automated layers

| Layer | Critical cases | Gate |
|---|---|---|
| Database authorization integration | Anonymous, pending/verified/disabled/expired professionals, non-pharmacy, pharmacy, city/province/super admin; same/cross/null geography; known target UUIDs; SELECT/INSERT/UPDATE/DELETE and RPC paths; private media and token isolation | Every defined allow/deny case passes using client-equivalent roles, not just the SQL owner/service role |
| Domain/unit | Validation, contact normalization, token handling, workflow transitions, refresh concurrency, retry/idempotency, route parsing, translation parity | Cover security and workflow branches; failures block merge |
| Adapter contract | Same public interface and result/error shapes across local and Supabase adapters; missing methods and divergent auth behavior | Both adapters satisfy documented contracts; demo cannot stand in for RLS testing |
| Component/integration | Failed voice/photo upload, validation, no duplicate submission, stale/error states, session expiry, storage denial, modal/label accessibility | Assert user-visible outcomes, not implementation details |
| End-to-end | Patient submission → authorized professional response → patient follow-up; prescription flow; sign-up/confirmation/recovery/logout; admin scope; FR/AR; slow/offline/reconnect; update/rollback | Run against isolated Supabase with synthetic fixtures |
| Job integration | 0/100/250+ expired files, partial list/delete failures, retries, duplicate invocation, timeout, reference/object reconciliation, escalation boundary times | No skipped objects, false success, or duplicate destructive effects |
| Migration/deployment | Fresh install, upgrade from baseline, grant drift, required secrets absent, correct CSP origin, demo exclusion, rollback compatibility | Release cannot proceed on configuration/schema mismatch |
| Performance/resilience | Expected peak users, large feeds, nested responses, intermittent network, out-of-order responses, low-memory media handling | Meet agreed latency, payload, error-rate, and job-lag budgets |

Set a first coverage target after creating the suite: for example, at least 80% branch coverage in critical domain/transport modules, with every documented authorization rule and workflow transition explicitly tested. This is a proposed gate, not existing coverage. A high percentage cannot compensate for missing negative authorization tests.

### First regression scenarios to implement

1. A professional in city A submits a response to a known city B request without asking for a returned row: denied; no status/contact side effect.
2. A non-pharmacy answers a known prescription: denied.
3. Ordinary professionals request internal directory fields: denied.
4. Disabled/provisional/unapproved identities and self-edited scopes cannot gain patient access.
5. Patient telephone/token never appears in professional-safe request fields.
6. A new professional cannot set or inherit a confirmed-phone badge.
7. Signing out removes credentials; logging in with two emails cannot collide in browser storage.
8. Expired-file cleanup removes all 250 fixtures and reports storage failures accurately.
9. A timed-out committed submission retried with the same operation ID returns the same case.
10. A voice-only request with failed upload cannot silently become a successful empty report.
11. Production with invalid/missing backend configuration fails instead of entering demo mode.
12. Fresh database installation includes hardening and allows legitimate anonymous abuse reporting.

## 8. Remediation roadmap and release gates

### Stage A — Establish a safe baseline

**Owners:** engineering lead, backend/security, deployment owner.

Confirm the live deployment root, migration ledger, effective grants/policies, and whether real users/data exist. Resolve SEC-01 through SEC-05, REL-08, and MNT-02. Address self-issued verification and administrative scope while building the role matrix. If real data is in use, prioritize containment and an evidence-based exposure review; source defects do not prove an actual breach.

**Exit:** patient capabilities and contacts are isolated, unauthorized response side effects are impossible, raw passwords no longer persist, production cannot silently simulate submissions, and fresh installation reproduces the hardened state.

### Stage B — Make the controlled pilot reliable

**Owners:** backend, frontend, QA, platform.

Fix cleanup, transport/session handling, idempotency, upload reconciliation, state transitions, privacy lifecycle, and reporting. Add deterministic builds, typed contracts, database tests, critical E2E tests, monitoring, and rollback/restore runbooks. Clarify what escalation actually delivers and who responds.

**Exit:** critical workflows survive injected network/storage failures; authorization regression suite passes; job failures alert an owner; recovery has been demonstrated with synthetic data.

### Stage C — Prove readiness to grow

**Owners:** engineering lead, platform, product/operations.

Add pagination, query optimization backed by measurements, bounded background work, realistic load tests, accessibility/device validation, localization review, and operational capacity planning. Agree latency and availability objectives and validate them under expected peak conditions.

**Exit:** no outstanding P0 issues, P1 issues resolved or explicitly accepted with narrow scope/owner/expiry, realistic capacity evidence, reproducible releases, and an operationally tested incident response process.

### Concrete production checklist

- [ ] One authoritative app tree and documented deployment root.
- [ ] Versioned migrations reproduce schema, grants, functions, and storage policies from scratch and through upgrades.
- [ ] All security findings have regression tests and reviewed fixes.
- [ ] Verified identities and centrally enforced scopes control patient access.
- [ ] High-entropy patient capabilities are independent of telephone numbers and professional case references.
- [ ] No raw passwords/recovery secrets persist in browser storage.
- [ ] Upload/submit/retry/cleanup workflows recover correctly after partial failure.
- [ ] Production config is validated and demo mode is explicitly isolated.
- [ ] Deterministic CI build, lint/type checks, critical tests, secret/dependency scanning, and performance gates pass.
- [ ] Error/job monitoring, ownership, backup restore, and rollback are demonstrated.
- [ ] Retention, consent wording, recipient access, and local emergency operations are reviewed by their responsible owners.
- [ ] Accessibility, supported phones/browsers, low-bandwidth behavior, and core translations are verified.

The recommended investment is targeted hardening plus testable boundaries. The current stack is capable of supporting the next stage; its security and operational guarantees need to become explicit, reproducible, and demonstrable.
