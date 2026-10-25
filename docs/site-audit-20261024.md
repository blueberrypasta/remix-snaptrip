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
- Six UI scenarios exercise actual App/Welcome React rendering against synthetic service fixtures: no startup location, photo without location, same-file failure/retry with exactly one charge, cancellation with deliberately late response, concurrent photo selection, and file conversion failure. These complement the pre-existing server/service tests; do not claim live provider/mobile camera QA.
- npm audit --omit=dev: zero reported vulnerabilities at this lock. Full dependency audit retains three moderate findings in Tailwind3's build-time selector parser chain; a Tailwind4 migration is outside this release.
- Initial main JS ~496KB/~150KB gzip vs pre-change public ~585KB/~178KB gzip. Deferred libraries/fonts are additional savings, not included in that comparison. No claimed CWV scores.

## Remaining infrastructure work
GitHub Pages does not give this application a custom-response-header configuration. CSP meta cannot set frame-ancestors; HSTS, nosniff, Permissions-Policy, frame protections and immutable asset cache need an appropriate host/edge configuration. No fake _headers file is presented as effective.

The deployed gemini-proxy source/deployment session is unavailable in this checkout; server photo quota enforcement, upstream model/token allowlists, global spend ceilings and atomic reservations require its actual deployed implementation. Browser storage is not a security boundary. The Qloo in-memory burst limiter also remains infrastructure work; its separate database guest quota is not removed.

Ego Lite task23 was handed to the user by the production location prompt. Resume only after confirmation; no new task/profile/permission workaround. Real mobile rendering, OAuth, native share and live AI calls remain to verify. All API-driven UI tests here use synthetic fixtures without paid upstream calls.
