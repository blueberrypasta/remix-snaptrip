# Site audit improvements — 2026-10-24

This release is based on production main f4c288d. The menu-review feature in PR35 is independent and not included.

## Implemented
- GitHub Pages HTTPS enforcement enabled and HTTP301 verified separately from the code release.
- No mount geolocation request. Photo analysis uses EXIF, previously permitted/cached device location, or no coordinates. Nearby and taste actions can request location explicitly.
- Photo request singleflight, cancellation/AbortSignal, request ownership guards, recoverable localized errors and same-file retry. Failed/canceled analyses do not deduct credits from the client flow. Server accounting remains a separate boundary.
- Mobile zoom enabled; larger hero/nearby copy, responsive priority hero image and explicit nearby opt-in explanation.
- npm-pinned EXIF2.3.0 and html2canvas1.4.1 imported only on demand. EXIF fallback timeout and 20MB photo input guard. Share capture ref repaired.
- Result, guide, about, history, login and taste code load on interaction. Taste import errors offer retry.
- Selected local SVG symbols replace the external Material Symbols font. Apache2 license included; gps_fixed/photo_off/sculpture/spark use equivalent symbols because the named upstream files do not exist.
- Removed unused Plus Jakarta Sans/Noto Serif KR font requests and unused Google GenAI SDK. Dependency lock includes compatible security patches.
- Baseline CSP meta before scripts, analytics script hash, object/base/form restrictions and referrer policy. GA page_location excludes query/fragment (including OAuth callback codes).

## Validation
- npm run build; npm run lint; node --experimental-strip-types --test tests/*.test.mjs.
- Six UI scenarios exercise actual App/Welcome React rendering against synthetic service fixtures: no startup location, photo without location, same-file failure/retry with exactly one charge, cancellation with deliberately late response, concurrent photo selection, and file conversion failure. These complement the pre-existing server/service tests and16 new Gemini proxy boundary checks; do not claim live provider/mobile camera QA.
- npm audit --omit=dev: zero reported vulnerabilities at this lock. Full dependency audit retains three moderate findings in Tailwind3's build-time selector parser chain; a Tailwind4 migration is outside this release.
- Initial main JS ~496KB/~150KB gzip vs pre-change public ~585KB/~178KB gzip. Deferred libraries/fonts are additional savings, not included in that comparison. No claimed CWV scores.

## Remaining infrastructure work
GitHub Pages does not give this application a custom-response-header configuration. CSP meta cannot set frame-ancestors; HSTS, nosniff, Permissions-Policy, frame protections and immutable asset cache need an appropriate host/edge configuration. No fake _headers file is presented as effective.

Supabase dashboard access was restored through the existing GitHub login on2026-10-25 and the actual generic Gemini proxy was reviewed. The new `supabase/functions/gemini-proxy/index.ts` accepts only gemini-3.1-flash-lite, bounds streamed bodies to3MiB, permits text/image/audio parts and Google Search only, caps output4096 tokens with minimal thinking, times out upstream calls, sanitizes errors and uses server-held keys. The public anon credential remains a guest app credential, not user identity. Previously issued valid anon JWTs can differ from the server default; alternate anon credentials are checked against Supabase Auth settings and cached for10minutes (max4), rather than rejecting them by raw string mismatch. Invalid roles/project refs are rejected before verification.

`20261025_gemini_proxy_budget.sql` adds service-role-only atomic DB request budgets: caller20/minute and100/day, global120/minute and250/day, fixed UTC windows. HMAC caller labels avoid raw IP storage; forwarded-header trust is platform-dependent, while the global cap does not depend on caller identity. Attempts are counted before the upstream call and are not refunded. Database failure fails closed. This bounds request attempts, not billed dollars or the UI's10-photo guest quota. The migration and transaction/rollback smoke test passed (caller burst/global daily enforcement, anon/authenticated execute false, RLS true). Gemini thinking-level compatibility was checked against Google's official Gemini3 developer guide.

The Qloo in-memory burst limiter remains separate infrastructure work; its existing database guest quota is preserved. Account/photo-specific transactional quotas and provider-side monetary budgets remain follow-ups. Browser storage is not a security boundary.

On 2026-10-25 Josh confirmed handling the prompt and Ego Lite task23 resumed. Verified390px and desktop home, zero initial geolocation calls, no horizontal overflow, correctly drawn SVGs, no CSP violations in the tested flow, taste modal open/close/Escape, synthetic photo failure→same-file retry→one local credit deduction, actual html2canvas PNG download, and simulated location-denial fallback. Native physical camera/OAuth/OS share sheet and real-photo AI responses remain unverified. UI scenarios used synthetic provider fixtures; one minimal real text request separately returned200 with {"ok":true}. Live invalid model400 and unrelated origin403 also passed after deployment. Fixed the external-symbol viewport origin and added the observed GA collection endpoints before release.

## Deployment sequence and rollback
1. Apply `supabase/migrations/20261025_gemini_proxy_budget.sql`, then run a transaction/rollback-only cap smoke test. Do not spend real provider requests to load-test caps.
2. Deploy `supabase/functions/gemini-proxy/index.ts` to the existing function, keeping its gateway setting. Confirm persisted source and valid existing public credential with one bounded text request; verify forbidden model/origin before upstream. Backups live in the project raw/slaptrip/20261025-gemini-proxy-before.ts (no hardcoded keys detected).
3. Merge tested frontend and verify Pages deployment assets plus browser home/CSP/no unsolicited location. If server smoke fails, restore the saved function source through the same editor; do not disable the quotas to hide failures. Database migration is additive; leaving its unused table/function is safe during rollback.
4. Do not label HTTP cache/header policies fixed from CSP meta. Update the SlapTrip Wiki and Drive instructions with actual deployment state and remaining work.

References: https://ai.google.dev/gemini-api/docs/gemini-3 (minimal thinking for3.1FlashLite); no model-ID upgrade in this release.
