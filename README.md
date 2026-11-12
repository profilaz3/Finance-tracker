<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your finance app

This contains everything you need to run your app locally.

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env.local`
3. In Supabase, configure `OPENAI_API_KEY` as an Edge Function secret for AI features
4. Run the app:
   `npm run dev`

## Test

- Run unit tests: `npm test`

## CI

GitHub Actions uses `.github/workflows/ci.yml`.

- `verify` always runs `npm test`, `npx tsc --noEmit`, and `npm run build`
- `browser-regressions` runs only when these GitHub secrets exist:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
  - `CI_E2E_EMAIL`
  - `CI_E2E_PASSWORD`

The browser job builds the app, serves a local preview, runs:
- `npm run cleanup:recurring-regressions`
- `npm run test:event-summary-regression`
- `npm run test:dashboard-summary-regression`

It uploads `output/playwright/` as a workflow artifact so failures are easier to inspect.
