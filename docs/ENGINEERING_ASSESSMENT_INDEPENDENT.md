# Allo Santé Tchad — Independent engineering & production-readiness assessment

**Review date:** 9 September 2026
**Repository baseline:** `a10e15c` (`app/` tree; `allo-sante-tchad 3/` is the confirmed-dead POC copy, see [`DEPLOYMENT_SOURCE_CHECK.md`](DEPLOYMENT_SOURCE_CHECK.md))
**Scope:** vulnerabilities, architecture, authorization, privacy, reliability, data integrity, scalability, maintainability, testing, operations.
**Method:** this is a from-scratch review. It does not build on, cite, or assume the conclusions of the existing [`ENGINEERING_ASSESSMENT.md`](ENGINEERING_ASSESSMENT.md) in this same folder (baseline `30b50fc`, five commits behind). Every finding below is traced to a specific file and line I read directly in this session, plus one real dependency-audit run (`npm audit`, via a temporary lockfile that was deleted afterward — no files were left behind). Where the two documents reach the same conclusion independently, that convergence is itself useful signal; where they diverge, trust the line numbers over either document's prose.

---

## 1. Executive summary

The engineering is more careful than most POCs: writes go through `SECURITY DEFINER` RPCs instead of raw inserts, contact phone numbers are protected by column-level `REVOKE`/`GRANT` (not just RLS), media moved from a blanket "any soignant" policy to a case-linked one, polling backs off by network/visibility, and a three-layer cache (localStorage → service worker → Netlify edge function) was added in the last few commits specifically to keep the public geography endpoint from being a cheap target. That craftsmanship is real and worth preserving.

Against that, this review independently found **two self-service authorization bypasses that let an unverified professional read patient data outside their own zone**, and **one hardening migration that silently broke anonymous abuse-reporting while the UI still claims success**. None of these require credentials beyond a free, unverified sign-up; one requires no sign-up at all. Combined with a security-relevant migration (`07_durcissement.sql`) that the README's own setup instructions never tell an operator to run, **a deployment that follows this repository's documented install steps ships in a materially weaker state than the code the project has already written to fix that.**

| Area | Verdict |
|---|---|
| Vulnerabilities | Two P0 authorization bypasses, one P1 silent-failure regression, one P1 documented-but-real DoS, one P2 config-validation gap |
| Architecture | Sound layering (facade, RPC-mediated writes, adaptive caching); the facade's string-keyed dispatch has zero compile-time contract between the two backends, and I found a live example of that gap |
| Authorization | RLS is used correctly as the enforcement layer in most places, but two policies check the wrong row (self-owned) instead of the right one (target zone), and one migration's grant list has a gap that RLS alone can't cover |
| Privacy | Phone-derived tracking codes, 30-day media retention, and consent gating are real; the lockout mechanism trades attacker-lockout for patient-lockout by design (documented, not hidden) |
| Reliability | Voice attachments fail silently on upload; the patient-facing poll is the one poll in the app that isn't network-adaptive; an admin-only demo-mode function is referenced by name with no build-time check that it exists |
| Data integrity | A submitted `quartier_id` is never checked against the submitted `ville_id` before insert; CSV export of admin-visible patient free text is not formula-injection-safe |
| Scalability | Fixed, unpaginated caps (200/300 rows) on every list; the new edge-cached geography endpoint is a genuine, well-reasoned improvement |
| Maintainability | No lockfile, no CI, no tests, no `.gitignore` (confirmed directly); two application trees still coexist in the repo pending cleanup |
| Testing | Zero automated tests. The one manual SQL script that exists checks 13 things; the README's narrative claims 23 database checks and "28 browser verifications" that have no corresponding artifact in the repo |
| Operations | Both scheduled Netlify functions return HTTP 200 with `ok:false` on missing configuration — a misconfigured production deploy's cron jobs report "success" forever with nothing to alert anyone |

**Bottom line:** don't put real patient data behind this deployment until the two authorization bypasses in §3 are closed and the install docs match the hardened schema. Everything else here is real but survivable for a supervised pilot.

---

## 2. Vulnerabilities

Ranked by exploitability and blast radius. "Code-confirmed" means I read the exact lines cited and traced the logic myself; I ran no live requests against any deployed instance.

### V1 — P0 — A professional can silently relocate/reclassify themselves to read any zone's patient data

**Code-confirmed.** `pro_maj` is the only RLS policy governing a professional's own record:

```sql
create policy pro_maj on professionnels for update to authenticated
  using (profil_id = auth.uid() or public.admin_couvre(ville_id, province_id))
  with check (profil_id = auth.uid() or public.admin_couvre(ville_id, province_id));
```
— [`supabase/01_installation.sql:836-839`](../supabase/01_installation.sql)

For a self-owned row, `WITH CHECK` is satisfied by `profil_id = auth.uid()` alone — the *new* `ville_id`/`province_id`/`type` values are never examined. The self-edit protection trigger `proteger_statut_pro` (originally `01_installation.sql:704-721`, tightened in `07_durcissement.sql:158-175` to also lock `numero_confirme`) freezes `statut`, `probation_fin`, `verifie_par`, `verifie_le`, `service_officiel`, `numero_confirme`, `demo`, `note_admin`, and `profil_id` against self-edits — but **not** `ville_id`, `province_id`, or `type`.

On the client, `majPro()` forwards a `villeCode`/`type` patch straight through with no re-verification (`src/lib/backendSupabase.js:633-651`), and it's wired to the professional's own "Profil" tab (`src/pages/pro/TableauPro.jsx:404-426`, `ProfilPro`) — an ordinary, self-service UI element, not an admin tool.

Zone-based read access is keyed purely on the professional's *current* `ville_id`:

```sql
create policy dem_lecture_pro on demandes for select to authenticated
  using (
    public.admin_couvre(ville_id, province_id)
    or exists (select 1 from professionnels p
      where p.profil_id = auth.uid() and p.statut in ('provisoire','verifie')
        and (p.ville_id = demandes.ville_id or (demandes.escalade_le is not null and p.province_id = demandes.province_id))))
```
— [`supabase/01_installation.sql:853-866`](../supabase/01_installation.sql), mirrored for prescriptions in `ord_lecture` at `01_installation.sql:897-908`.

**Path to exploit:** register as any professional type with a phone number (`VITE_INSCRIPTION_LIBRE`, no vetting — `src/lib/backendSupabase.js:489-561`), wait out the trivial `provisoire` window (the account is `en_ligne` and reads-enabled immediately), then from the profile screen change `villeCode` to any city. `dem_lecture_pro`/`ord_lecture` immediately grant that account every open case in the new city. Repeat for every city in the country in under a minute each.

This directly contradicts the security property the README states as verified: *"Un administrateur de ville ne voit et ne modifie **que** sa ville... C'est vérifié dans la base"* ([`README.md:348-351`](../README.md)) — the claim is true for admins, but there is no equivalent enforcement for an ordinary professional's own zone assignment, and zone assignment is what actually gates read access.

**Fix:** in `proteger_statut_pro`, freeze `ville_id`, `province_id`, and `type` the same way `statut` is frozen for a self-edit; route legitimate relocation through an admin-approved path (it's a rare event, not a hot one).

**Acceptance:** a `provisoire` professional's `PATCH` with a different `ville_id`/`province_id`/`type` is silently reverted by the trigger, not applied; negative test with a real cross-city `villeCode` payload confirms no visibility change follows.

---

### V2 — P0 — Anonymous fresh installs following the README ship without the hardening migration

**Code-confirmed.** The README's own setup sequence (`README.md`, "Étape 3 — Installer les tables et les données") lists exactly three files to run in order: `01_installation.sql`, `02_donnees_geo.sql`, `03_donnees_demo.sql` (`README.md:46-51`). It then says *"Les autres fichiers du dossier servent plus tard"* and names only `04_effacer_demo.sql`, `05_creer_administrateur.sql`, and `06_verification.sql` (`README.md:52-55`). **`07_durcissement.sql`, `08_villes_departements.sql`, and `09_confirmation_email.sql` are never mentioned anywhere in the README** — I searched the full 381-line file for their filenames and found none.

What a deployer misses by not running `07_durcissement.sql`:

- The *original* media storage policy in `01_installation.sql:672-677` lets **any** authenticated professional read **any** file in the `medias` bucket:
  ```sql
  create policy "lecture soignants" on storage.objects for select
    to authenticated using (bucket_id = 'medias' and (public.est_admin() or public.mon_pro() is not null));
  ```
  Only `07_durcissement.sql:26-38` replaces this with a policy scoped to files actually linked to a case the caller can already see. `07`'s own commit header calls this *"LA FAILLE PRINCIPALE"* — the primary flaw — and states it let any registered (unverified, self-service) professional download every prescription photo and voice message in the country. That description was written by whoever authored the migration about the exact state a from-README install is still in.
- `01_installation.sql` never revokes the default Postgres/Supabase grants that hand `anon` blanket privileges on every `public` table. `07_durcissement.sql:87` does this (`revoke all on all tables in schema public from anon;`) and its own comment explains why it matters: *"TRUNCATE n'est pas soumis aux politiques RLS"* — TRUNCATE isn't subject to row-level security at all, so RLS being correct is not sufficient on a fresh `01`-`03` install; only `anon` lacking the underlying grant is.
- `professionnels.note_admin`/`profil_id`/`verifie_par` remain selectable by anonymous callers via `select=*` until `07_durcissement.sql:71-77` column-restricts the grant.

None of this is exotic to find — it's the difference between the two SQL files sitting in the same `supabase/` folder the README already points at, just not all of them.

**Fix:** treat `01`–`09` as one ordered install unit in the docs (or better, in the SQL itself via a single entry-point script), and extend `06_verification.sql`'s automated checks to assert the specific things `07` fixes (the media policy's exact shape, `anon`'s revoked table-level grants) so a fresh install fails loudly instead of shipping quietly weaker.

**Acceptance:** running only the files the README currently lists, then `06_verification.sql`, surfaces a failing check for the media policy and for `anon`'s table grants.

---

### V3 — P1 — Anonymous abuse reports silently fail and the UI reports success anyway

**Code-confirmed; this is a self-inflicted regression from the hardening pass itself, not a pre-existing gap.** `07_durcissement.sql:87` revokes all privileges from `anon` on every `public` table, then re-grants exactly: `SELECT` on `provinces`/`villes`/`quartiers`/`numeros_urgence`/`reglages`, `INSERT` on `quartiers`, and a column-scoped `SELECT` on `professionnels` (`07_durcissement.sql:89-100`). **There is no `grant insert on public.signalements to anon` anywhere in the repository.**

The `sig_depot` RLS policy (`01_installation.sql:924-925`, `for insert to anon, authenticated with check (true)`) is necessary but not sufficient: PostgREST also needs the underlying table grant, which `anon` no longer has after `07`. `signaler()` does a direct table `POST`, not a `SECURITY DEFINER` RPC (unlike `creer_demande`/`creer_ordonnance`, which bypass this problem entirely because they run with the function owner's privileges):

```js
export async function signaler({ cibleType, cibleId, motif, detail }) {
  try {
    await requete('/signalements', { methode: 'POST', corps: { cible_type: cibleType, cible_id: cibleId, motif, detail: detail || null } })
    return true
  } catch { return false }
}
```
— [`src/lib/backendSupabase.js:374-382`](../src/lib/backendSupabase.js)

It will now receive a `42501` permission-denied from PostgREST for any anonymous (not-logged-in) caller and return `false`. But the UI never checks that return value:

```js
const envoyer = async () => {
  await db.signaler({ cibleType: 'professionnel', cibleId: pro.id, motif, detail }).catch(() => {})
  setEnvoye(true)
}
```
— [`src/pages/Annuaire.jsx:156-159`](../src/pages/Annuaire.jsx)

**Net effect:** since `07_durcissement.sql` (5 September 2026, per its own header), an ordinary visitor flagging a fake or abusive professional listing from the public directory sees a green "your report was sent" confirmation while nothing reaches the database. A **logged-in** professional's report still works, because `07` only revoked `anon`'s grants, not `authenticated`'s — which is exactly the kind of asymmetry that suggests an oversight rather than a decision: every other anonymous write-path in that same migration (`quartiers` suggestions) was explicitly re-granted; this one wasn't.

**Fix:** `grant insert on public.signalements to anon;` and make `envoyer()` only set `envoye(true)` when `signaler()` actually returns `true`.

**Acceptance:** an anonymous `POST /signalements` succeeds and produces a row; the UI shows an error state when `signaler()` returns `false`.

---

### V4 — P1 — Any signed-in account can read private moderation notes on any professional

**Code-confirmed.** `pro_lecture_publique` grants row-level `SELECT` to both `anon` and `authenticated` for any professional whose `statut` is `provisoire` or `verifie` — i.e., nearly every listed one (`01_installation.sql:824-826`). Column access is a *separate* gate from row access, and `07_durcissement.sql:71-77` only narrows it for `anon`:

```sql
revoke select on public.professionnels from anon;
grant select (id, type, nom, ... , created_at) on public.professionnels to anon;
```

`authenticated` is never touched by an equivalent revoke/grant pair anywhere in the codebase, so it keeps Supabase's default (unrestricted-column) grant. Since RLS row-visibility and column-grant are independent checks, **any signed-in account — including a `provisoire` professional who registered thirty seconds ago** — can request `?select=note_admin,profil_id,verifie_par` on any professional row and receive it. `note_admin` is documented in the schema comment at `01_installation.sql:138` and in `07`'s own header (`07_durcissement.sql:65-69`, *"note de moderation... Lisible par quiconque avec la cle publique"*) as private moderation text — the fix note explicitly says this should not be true for the public key, but the same reasoning applies unchanged to any authenticated key, and nothing enforces that.

**Fix:** apply the identical column-scoped grant `07` gives `anon` to `authenticated` as well; a professional's legitimate access to their *own* privileged fields already comes through `SEL_PRO_ADMIN` gated by ownership/`pro_lecture_privee`, so this closes the gap without removing anything real.

**Acceptance:** an authenticated non-admin `select=note_admin` request against any professional's row returns no such column.

---

### V5 — P1 — Tracking-code lockout is attacker-controllable and blocks the real patient too (documented tradeoff, still worth listing under "vulnerabilities")

**Code-confirmed; explicitly acknowledged in the README, not hidden.** `suivi_bloque`/`suivi_echec` key the 12-attempts-per-hour lockout exclusively on the digits inside the *code itself* — i.e., the patient's own phone number (`01_installation.sql:469-490`). The code's structure (phone + 2 letters from a 21-letter alphabet, confirmed by counting `alphabet := 'ACDEFGHJKLMNPQRTUVWXY'` at `01_installation.sql:378`) means 441 combinations per known number. `annuler_demande` shares the identical gate (`01_installation.sql:557-565`).

Anyone who knows a patient's phone number — not the tracking code, just the number, which is far easier to come by — can burn through 12 wrong guesses in well under a minute and lock that *patient's own correct code* out for the rest of the hour, because the counter has no concept of "requester," only "which code's phone digits were tried." The README states this tradeoff plainly: *"un attaquant peut aussi bloquer l'accès d'un patient pour le reste de l'heure"* (`README.md:337-338`). I list it here because it's a real, reachable denial-of-service against a specific named person in an emergency-response tool, and because Turnstile is already wired into the auth screens (`src/lib/backendSupabase.js:407-467`) but not into `suivre_demande`/`annuler_demande`, which is a natural place to slow automated guessing without touching the lockout key at all.

**Fix (if revisited):** add a requester-side rate limit (IP/session) in addition to the phone-derived key, so an attacker's guesses cost *them* something before they cost the patient anything; or lengthen the suffix, as the README itself suggests (3 letters = 9,261 combinations, "one line" to change).

---

### V6 — P2 — The anon-key format check validates shape, not privilege

**Code-confirmed.** `cleValable()` accepts any JWT-shaped string (`eyJ...`) or `sb_publishable_...` string without decoding it to check the `role` claim:

```js
const cleValable = (v) => {
  const s = String(v || '').trim()
  if (!s || GABARIT.test(s)) return ''
  if (/^eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/.test(s)) return s
  if (/^sb_publishable_[A-Za-z0-9_-]{10,}$/.test(s)) return s
  return ''
}
```
— [`src/lib/config.js:28-34`](../src/lib/config.js)

The README lists `VITE_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` in the same environment-variable table (`README.md:66-74`), visually similar in format and length. If an operator pastes the wrong one into the `VITE_` (client-bundled) slot, nothing in the code catches it — the full-privilege key would ship to every browser, silently.

**Fix:** decode the JWT payload's `role` claim at config time and refuse to treat a `service_role` token as a valid anon key, even though it's shape-valid.

---

## 3. Architecture

The shape is right for what this is: a lazy-loaded React SPA behind a single facade (`src/lib/db.js`) that dynamically imports one of two same-shaped backend modules (`backendLocal.js` for the fully-client-side demo, `backendSupabase.js` for production) based on whether valid Supabase credentials were found at boot. Writes to the two most sensitive tables (`demandes`, `ordonnances`) never go through a raw `INSERT` — they go through `SECURITY DEFINER` RPCs (`creer_demande`/`creer_ordonnance`) specifically so PostgREST's `RETURNING`-triggers-`SELECT`-RLS problem doesn't leave an anonymous submitter's own request invisible to them (the comment at `01_installation.sql:1113-1126` explains this exact failure mode and why the RPC exists). That's a genuinely non-obvious fix, done correctly.

The place the architecture is thinnest: `db.js`'s dispatch is a flat list of string names (`NOMS` array, `src/lib/db.js:37-51`) forwarded to whichever backend module happens to be loaded, with no shared interface or type checking that both modules actually implement the same surface. This isn't hypothetical — `db.reinitialiser()` is called from the admin settings screen (`src/pages/admin/sections.jsx:657`) and is in the dispatch list, but **`backendSupabase.js` has no `reinitialiser` export at all**. It's harmless today only because the calling button is gated behind `MODE_DEMO` (which forces `backendLocal.js`, which presumably does implement it, to be the loaded module) — but nothing would catch it if that gate were ever removed or a new demo-only method were added and called from a screen that isn't actually demo-gated.

Recent additions read as deliberate and well-reasoned, not bolted on: the three-layer reference-data cache (browser `localStorage` for 7 days → service worker cache-first-with-refresh → Netlify edge function with `s-maxage=3600, stale-while-revalidate=86400` → Supabase origin as last resort, `src/lib/backendSupabase.js:121-161`, `netlify/edge-functions/reference.js`, `public/sw.js`) exists specifically so a public, unauthenticated, rarely-changing dataset doesn't cost a database round-trip on every page load or become a cheap target for a scraper — and if the edge function is unreachable, it explicitly falls back to the exact old Supabase path rather than failing (`refEdge()`'s `.catch(secours)`, `backendSupabase.js:130-137`).

## 4. Authorization

The model is city/province/national scoping (`admin_couvre`) layered under a professional's own zone match (`dem_lecture_pro`, `ord_lecture`), enforced in Postgres via RLS rather than trusted to the client — which is the right default. Where it breaks is precisely where a policy checks "is this the caller's own row" instead of "is this the *target* the caller is claiming authority over" — which is exactly V1 above: `pro_maj`'s `WITH CHECK` treats "I own this row" as sufficient permission to change *what the row claims about itself* (its zone, its clinical type), when those specific fields are the ones that grant *other* privileges downstream. The fix pattern used correctly everywhere else in this schema — an explicit trigger denylist on self-edit (`proteger_statut_pro`, `proteger_role`) — simply has an incomplete field list.

The second authorization-shaped gap is V4: RLS answers "which rows," GRANT answers "which columns," and the codebase's own hardening pass only closed the column question for one of the two roles that can reach the same row-permissive policy.

One thing worth crediting: `adminMajDemande`/`adminMajPro`/`adminMajNumero` all check `if (!l?.length) throw new Error('HORS_PERIMETRE')` after a `PATCH` (`src/lib/backendSupabase.js:765-773`, `739-750`, `848-854`) — because an out-of-scope `PATCH` returns `200` with an empty array rather than a `403`, and the code explicitly guards against an admin believing a no-op succeeded. That's the same failure class as V3, handled correctly here.

## 5. Privacy

Contact numbers are protected in the database, not just the UI — `01_installation.sql:985-1002` programmatically revokes table-level `SELECT` on `demandes`/`ordonnances` and re-grants it column-by-column, explicitly excluding `contact_tel`/`contact_whatsapp`, with a comment warning future maintainers that any newly added column must be explicitly re-granted or it silently becomes unreadable. `contact_demande`/`contact_ordonnance` (`01_installation.sql:1009-1048`) are the only path to the real number, and they re-check engagement (`en_route`/`appelle`/`whatsapp`) at call time rather than trusting a client-side flag.

Retention is real and automated: `purger_medias` (`01_installation.sql:601-616`) nulls `image_url`/`vocal_url` after a configurable window (default 30 days), and the separate `purge-medias.mjs` Netlify function deletes the underlying Storage objects on its own nightly schedule. Consent is a required boolean checked server-side inside `creer_demande`/`creer_ordonnance`, not just rendered as a checkbox.

The tracking-code design (phone number + 2 letters) trades memorability for a small credential space, and the README is candid about that tradeoff (see V5) rather than presenting it as flawless. What the README doesn't cover: **the code itself is the phone number**, cosmetically obscured by two letters — anyone who can read a case's `code` field (which the professional-facing selects, `SEL_DEM`/`suivre_demande`'s JSON, all include) can trivially recover the patient's phone number by stripping the trailing two letters, before any engagement check ever runs. Removing `contact_tel` from every `SELECT` doesn't protect the same digits sitting in a different column.

## 6. Reliability

**R1 — An unguarded `decodeURIComponent` in the router can blank-screen the app with no recovery UI.** `correspond()` calls `decodeURIComponent(c[i])` on each path segment with no `try/catch` (`src/lib/router.jsx:61`), inside a loop `App.jsx` runs synchronously on every render (`src/App.jsx:54-65`). `App.jsx` wraps its routes in `<Suspense>` only — there is no React error boundary anywhere in the tree. A malformed percent-encoding in the URL fragment (a corrupted share link, a manually edited hash) throws during render and has nothing to catch it. (`public/secours.js` is a *load-time* recovery script per the service worker's own comments — it helps when the app fails to boot at all, not when it's already running and a later navigation throws.)

**R2 — Voice-recording upload failures are swallowed with no visible state, for the one input channel this app calls indispensable.** Both submission flows wrap the voice upload in a `try/catch` that does nothing on failure:
```js
if (f.vocal?.blob) {
  try { vocalChemin = (await db.televerser(f.vocal.blob, 'vocaux')).chemin } catch { /* on n'echoue pas pour un vocal */ }
}
```
— [`src/pages/DemandeAide.jsx:59`](../src/pages/DemandeAide.jsx), identically at [`src/pages/Ordonnance.jsx:50`](../src/pages/Ordonnance.jsx). The README calls voice input "indispensable pour les personnes qui ne lisent pas" (`README.md:1-4` context, and repeated in `src/components/medias.jsx:1-3`). For exactly that user, on exactly the network conditions this app targets, a failed upload produces a case with no description and no visible sign anything was lost.

**R3 — The patient-facing poll is the one poll in the app that isn't network-adaptive.** `DetailSuivi` polls on a flat `setInterval(charger, 10000)` regardless of tab visibility, connection type, or online state (`src/pages/Suivi.jsx:63`). Contrast with the professional-side realtime helper, which explicitly adapts cadence to `document.visibilityState`, `navigator.connection.effectiveType`, and `navigator.onLine` (`src/lib/backendSupabase.js:948-981`) — built, by the code's own comments, specifically for "reseaux mobiles tchadiens." The patient is the more bandwidth-constrained of the two audiences, not the less.

**R4 — Escalation only widens read access; nothing pushes anything to anyone.** `escalader_urgences` (`01_installation.sql:570-585`) does exactly one thing: sets `escalade_le = now()` on overdue level-1 requests, which changes what `dem_lecture_pro` allows a province-wide professional to see. There is no outbox, no notification, no delivery confirmation — a newly-eligible professional only learns about the escalated case at whatever cadence their own tab's poll happens to be running. "Rediffusée à toute la ville" (`README.md:176-178`) describes the RLS effect accurately; it doesn't describe anything that actively reaches a soignant who isn't already looking at their screen.

**R5 — The escalation and media-purge cron jobs run independently, with no shared state, on different schedules, touching overlapping data with no reconciliation.** `escalade.mjs` runs every 5 minutes; `purge-medias.mjs` runs once nightly at 02:00 UTC (`netlify.toml`, `[functions."escalade"].schedule` / `[functions."purge-medias"].schedule`). `purge-medias.mjs` first clears the DB reference (`purger_medias` SQL RPC) and only then deletes the actual Storage object, scanning by the *object's* `created_at`, not by joining back to the row that referenced it (`netlify/functions/purge-medias.mjs`). If either half fails independently — which the function's own return shape allows (see Operations, §10) — a row can say "no media" while the file persists past retention, or the reverse. There's no reconciliation pass anywhere that checks the two states agree.

## 7. Data integrity

**A submitted `quartier_id` is never checked against the submitted `ville_id` before insert.** `creer_demande`/`creer_ordonnance` (`01_installation.sql:1127-1173`, unchanged in this respect by `07_durcissement.sql:221-311`) take `(p->>'quartier_id')::int` directly from client-supplied JSON with no `exists (select 1 from quartiers where id = ... and ville_id = ...)` check. The client normally resolves a consistent pair (`quartierId(v.id, p.quartierNom)` in `src/lib/backendSupabase.js:165-166`), but the RPC itself doesn't enforce it — a buggy client state, a stale cached zone, or a direct API call can produce a request whose displayed neighborhood belongs to a different city than the one dispatch actually uses for zone-matching. That's not an authorization bypass (RLS matches on `ville_id` only), but it's a real way for a responding professional to be shown the wrong part of town for a physical emergency.

**CSV export of patient-authored free text is not formula-injection-safe.** `versCSV`'s escaping only quotes values containing a comma, semicolon, quote, or newline (`src/lib/format.js:29-38`); it does not neutralize a leading `=`, `+`, `-`, or `@`. The admin demand export explicitly includes `lieu_texte` — patient-authored free text — as a column (`src/pages/admin/sections.jsx:43-54`, `{ titre: 'lieu', valeur: 'lieu_texte' }`). A patient's location description beginning with one of those characters becomes a live formula when an administrator opens the exported file in Excel or LibreOffice.

**Unknown category values degrade to raw translation keys on screen, not an error.** `categories` accepted by `creer_demande` is any string array with no check against the known `CATEGORIES` list (`src/lib/config.js:88-100`); the i18n lookup falls back to returning the untranslated key itself when nothing resolves (`src/lib/i18n.jsx:56-58`, `if (v === undefined) return chemin`). Low severity — cosmetic, not a crash — but worth a validation pass at the RPC boundary rather than trusting the client's own enum.

## 8. Scalability

Every list-returning function I read caps out at a fixed number with no pagination exposed to the caller: `annuaire` and `adminPros` at 300 (`src/lib/backendSupabase.js:256`, `:730`), `demandesZone` and `adminDemandes` at 200 (`:660`, `:753`), `ordonnancesZone` at 100 (`:684`). Past the cap, an item simply disappears from the list rather than being reachable via a "load more" — including, in principle, an old unhandled urgent case buried under 200 newer ones, since `demandesZone`'s ordering is `niveau.asc,created_at.desc` (newest-first within a level, not oldest-unhandled-first).

The polling model refetches the entire capped feed on every tick rather than a delta: `abonnerDemandes`'s callback is just "re-run whatever function was passed," and its first parameter is literally named `_zone` with the underscore-prefix convention for "intentionally unused" (`src/lib/backendSupabase.js:948`) — a visible trace of zone-scoped delta-polling having been considered and not built.

The one clear scalability *improvement* in the current codebase is the reference-data caching chain described in §3 — it's a well-targeted fix for the specific load pattern (a rarely-changing, publicly-readable dataset hit on every cold load) rather than a generic cache-everything approach, and its own comment explains the threat model it was built for (a scraper hammering a public Supabase URL) rather than just performance.

## 9. Maintainability

Confirmed directly in this session:

- **No lockfile** (`package-lock.json`/`yarn.lock`/`pnpm-lock.yaml`) is present or tracked; `npm audit` cannot run without generating one first (it says so explicitly: `npm error audit This command requires an existing lockfile`).
- **No `.gitignore`** exists anywhere in the repository, and `node_modules/` (present locally, `git ls-files app/node_modules` returns zero tracked files) is excluded from git only by nobody having run `git add -A` yet — not by any enforced rule.
- **No CI configuration** (`.github/workflows` or equivalent) and **no test files** (`*.test.*`/`*.spec.*` — a repository-wide search returns none) exist.
- **Two application trees** (`app/` and `allo-sante-tchad 3/`) still coexist in the working tree as of this review; `DEPLOYMENT_SOURCE_CHECK.md` in this same folder already confirmed via live response headers that Netlify builds `app/` exclusively, so the older copy is safe to remove, but it hasn't been yet.
- I generated a temporary lockfile solely to run `npm audit`, then deleted it — see the actual numbers below rather than "not run."

**Real dependency audit result (2 known vulnerabilities, both dev-only tooling):**
```
esbuild  <=0.24.2   moderate   dev server accepts requests from any website and returns the response
vite     <=6.4.2    high       path-traversal in optimized-deps .map handling; server.fs.deny bypass (Windows);
                                depends on the vulnerable esbuild
```
Both are `vite`/`esbuild` — build tooling, not runtime dependencies — so they affect a developer's local dev server, not the deployed production bundle. Still worth a `vite` major-version bump; the fix is available but breaking (`vite@8`).

The facade's string-dispatch pattern (`src/lib/db.js:37-51`) is the specific mechanism behind the `db.reinitialiser()` gap noted in §3 — a concrete instance, not a hypothetical one, of the two backend modules being able to silently diverge with nothing catching it before runtime.

## 10. Testing

**Zero automated tests exist in this repository** — confirmed by a repository-wide search for `*.test.*`/`*.spec.*`, which returns nothing, and by the absence of any test runner in `package.json`'s scripts or dependencies.

`supabase/06_verification.sql` is a real, useful artifact: 13 numbered, automatically-scored checks (`select n as "#", case when ok then 'OK' else 'A FAIRE' end as etat, ...` over a 13-row CTE) that a fresh installer is told to run. But the README's narrative claims exceed what that script — the only checking artifact in the repo — actually contains: *"23 contrôles de sécurité y sont passés"* and *"28 vérifications, zéro erreur console"* for a manual FR/AR browser walkthrough (`README.md:358-367`). I read `06_verification.sql` in full; it has 13 checks, not 23, and there is no fixture, script, or recorded result anywhere in the repo corresponding to the claimed 28 browser verifications. The 13 real checks are good and should stay; the gap between what's claimed and what's reproducible is itself worth closing, independent of whether the underlying manual testing actually happened once.

## 11. Operations

**Both scheduled Netlify functions report success on failure.** `escalade.mjs` and `purge-medias.mjs` both return `Response.json({ ok: false, raison: '...' })` when required environment variables (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) are missing — and `Response.json` defaults to HTTP 200 when no status is specified. Netlify's own scheduled-function dashboard has nothing to distinguish this from a real success: the function ran, returned 200, and the body says `ok:false`, which nothing outside the function body is reading. A production deployment that's missing `SUPABASE_SERVICE_ROLE_KEY` (an easy slip — it's the seventh of seven environment variables in the README's setup table, and the most consequential to get right) would have its urgent-case escalation and its 30-day media purge both silently no-op forever, with the operational dashboard showing green the entire time.

No CI/CD pipeline, no monitoring or alerting configuration, and no backup/restore runbook exist in the repository (confirmed by the same searches noted in §9) — this doesn't mean none of that exists in the Netlify/Supabase dashboards themselves (which I have no access to and make no claim about), only that none of it is checked into version control or otherwise reviewable here.

---

## 12. What to fix first

1. **V1 and V2** — close the self-relocation gap in `proteger_statut_pro`, and fold `07`–`09` into the documented install sequence (plus extend `06_verification.sql` to catch a from-README install that skipped them). Nothing else in this document matters if either of these stays open on a deployment that holds real patient data.
2. **V3 and V4** — both are one-line grant fixes (`grant insert on signalements to anon`; mirror `professionnels`'s column grant onto `authenticated`) plus, for V3, making the UI honor the actual return value instead of assuming success.
3. **R2** — surface voice-upload failure to the patient before they leave the screen believing their description was sent.
4. **Operations §11** — make the two scheduled functions fail loudly (non-200, or a separate heartbeat check) when required configuration is absent, so a misconfigured production deploy doesn't run silently degraded indefinitely.
5. Everything else here (V5, V6, R1/R3/R4/R5, §7's data-integrity notes, §8's pagination, §9's tooling gaps, §10's test coverage) is real and worth scheduling, but none of it is the reason to hold back a supervised pilot the way items 1-2 are.
