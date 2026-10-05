<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/be2f6dfc-4da0-4f18-900d-0a5de2262ba3

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Copy `.env.example` to `.env.local` and fill in the public Supabase project settings if you want Google login enabled.
3. Run the app:
   `npm run dev`
4. Add your Gemini API key in the app settings. Do not commit real API keys.

## Qloo recommendations

Qloo augments landmark recognition with a separate taste recommendation panel.
The panel stays hidden until the server health endpoint reports a configured key.
Users log in, explicitly select up to three search matches, and request five places
within 15 km. Only interest IDs and coordinates rounded to two decimal places go
to Qloo; selected interests remain in account-scoped browser storage.

Deploy `supabase/functions/qloo-proxy/index.ts` as `qloo-proxy` in the existing
Supabase project. Disable gateway JWT verification for this function: health is
public, while every paid POST verifies the actual user session via Supabase Auth.
Set `QLOO_API_KEY` as a Supabase Edge Function secret, never a `VITE_` variable.
Set `QLOO_API_URL=https://hackathon.api.qloo.com` for a hackathon-issued key;
these keys cannot use production or staging. Staging is also allowlisted for
keys specifically issued for that environment; production is the default. Then verify `/functions/v1/qloo-proxy/health`,
entity search, and a real recommendation response before considering it active.

`node --experimental-strip-types --test tests/qloo-proxy.test.mjs` checks the
server boundary with mocked upstream responses; it does not prove Qloo access.
Per-user rate limiting is per warm worker, not a global billing cap.
