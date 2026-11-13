# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Dev Commands

- `npm run dev` - Start Vite dev server (port 3000)
- `npm run build` - Production build (outputs to `dist/`)
- `npm run preview` - Preview production build
- `npm test` - Run Vitest unit tests
- `npm run test:integration` - RLS/constraint tests against a running Supabase stack (skipped unless `SUPABASE_TEST_URL` and `SUPABASE_TEST_ANON_KEY` are set)
- `npm run analyze` - Bundle analysis with rollup-plugin-visualizer
- `npm run build:android` - Build + Capacitor sync for Android
- `npx tsc --noEmit` - Type-check (currently clean)

## Environment Variables

Required in `.env` (see `.env.example`; `.env.local` holds other local-only secrets):
- `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` - Supabase backend

Required in Supabase Edge Function secrets:
- `OPENAI_API_KEY` - Receipt scanning and AI insights

Optional Edge Function secrets:
- `OPENAI_MODEL` (default `gpt-6-luna`, receipt scanning) / `OPENAI_MODEL_FAST` (default `gpt-6-luna`, parsing and insights) / `OPENAI_REASONING_EFFORT` (default `medium`; ignored for gpt-4 models, which get a temperature instead)
- `OPENAI_TRANSCRIBE_MODEL` (default `gpt-transcribe`, voice entry)
- `AI_DAILY_LIMIT_SCAN_RECEIPT` / `AI_DAILY_LIMIT_PARSE_TRANSACTION` / `AI_DAILY_LIMIT_GENERATE_INSIGHTS` - per-user daily caps (defaults 30 / 100 / 30; the insights cap is shared by insights, the monthly letter, anomaly explanations and AI clean-up), enforced by `public.consume_ai_quota` (voice entry counts against the parse-transaction cap)
- `ALLOWED_ORIGINS` - extra comma-separated CORS origins

## Database & Edge Functions

- Schema lives in `supabase/migrations/` (baseline + hardening migrations). Never edit an applied migration; add a new timestamped file. `supabase/legacy/` holds the old hand-run SQL for reference only.
- Local stack: `supabase start` (applies migrations + `supabase/seed.sql`: users `ci-owner@example.test` / `ci-guest@example.test`, password `CiPassword123`, with a shared "Bergamo" event). `supabase db reset` re-applies everything.
- Browser regressions (`npm run test:*-regression`, Playwright) create and delete data. Run the app against the local stack (`VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_ANON_KEY=<anon key from supabase status> npm run dev`; shell env overrides `.env`). `scripts/e2eGuard.mjs` aborts requests to hosted Supabase unless `E2E_ALLOW_REMOTE=1`.
- Remote: `supabase db push --project-ref <ref>` and `supabase functions deploy <fn> --project-ref <ref> --use-api`. CI does this on main when the `ENABLE_SUPABASE_DEPLOY` repo variable is `true`.
- Edge functions share `supabase/functions/_shared/` (`http.ts` CORS/body limits/errors, `auth.ts` user check + AI quota, `openai.ts`, `input.ts`). `parse-transaction` and `scan-receipt` reuse validators from `utils/aiShared.ts`. `transcribe` (voice entry) takes base64 audio, transcribes it (Serbian output transliterated to latinica), and parses the transcript in the same call via `_shared/parseTransaction.ts`, which `parse-transaction` also uses.
- Typed and voice entry learn per-merchant habits from transaction history (`domain/merchantMemory.ts`, no storage of its own): matching merchants go to the parser as `hints`, a clear habit (2+ uses, 60%+ one category) overrides the AI category locally (`services/smartEntry.ts`), and new manual entries preselect it with a "Usual for ..." chip.
- `fiscal-receipt` imports a Serbian fiscal receipt from its QR code URL (`https://suf.purs.gov.rs/v/?vl=...`): it decodes the `vl` payload locally (total, date, invoice number), then fetches the portal's JSON view and POSTs `/specifications` (token scraped from the HTML view) for line items. The portal is the only host it will call (https, exact host, no redirects, 10s timeout, size caps); if the portal fails it returns a `partial` receipt from the payload. Category comes from keyword rules, with an AI fallback that spends the `parse-transaction` quota. Parsing is pure in `utils/fiscalReceipt.ts` (tested against real public receipts in `tests/fixtures/fiscal/`); the client scans QR codes with lazy-loaded `jsqr` (`components/receipt-scan/`).
- `nbs-rates` (no AI, no quota) serves the official NBS middle rate for EUR and USD. `latest` reads the NBS exchange rate web app (`webappcenter.nbs.rs`, HTML list) with `kurs.resenje.org` (JSON mirror of the NBS service) as fallback; `history` reads kurs in bulk (NBS per day only for gaps of 31 days or less) and caches past days in `public.exchange_rates` (authenticated read, service role write). Only those two hosts, https, no redirects, 10s timeout, size caps. Points are business days `[listDate, middle]`; weekends and holidays use the last list and say its date. `services/currencyService.ts` builds `state.rates` from it (`provider: 'nbs'`, `listDate`; USD is the EUR/USD cross) and falls back to the old provider, then the offline cache; historical transactions convert as before. Parsing is pure in `utils/nbsRates.ts` (fixtures in `tests/fixtures/nbs/`), range maths in `domain/exchangeRates.ts`, the device history cache in `services/nbsRatesService.ts`. The Exchange rates sheet (`components/rates/`, opened with `openRates()` from Settings > General or the Home Rates block, whose "Trend" style shows 1M sparklines) is lazy-loaded in `AppSheets`.
- Subscriptions are detected locally in `domain/subscriptions.ts` (same normalized merchant + currency, weekly/biweekly/monthly/quarterly/yearly cadence with one skipped cycle tolerated, similar amounts; existing recurring rules and `rec:` occurrences excluded; price increases > 3% and above a small absolute floor; "stopped" after two missed cycles). The list lives in BudgetsView's Subscriptions tab (`components/subscriptions/`); dismissals and AI display names are per device (`services/subscriptionStore.ts`). Price-increase alerts fire once per merchant per increase (`priceIncrease` notification pref).
- `ai-cleanup` has two modes: `merchants` (display name + service type for detected subscriptions) and `cleanup` (merchant spellings, tidier notes, categories for at most 200 distinct notes per call). Both charge the `generate-insights` quota. Output is validated by `utils/aiCleanup.ts` (ids must be from the request, categories from the provided list). The client side (`domain/cleanup.ts`, `components/cleanup/`, Settings > Categories) applies merchant habits first, sends only note text and category names, and applies nothing until the user picks suggestions; apply and undo go through `commitTransactionChanges` (undo skips rows edited since).
- "Split this receipt" (scan result screen, `components/receipt-scan/SplitAssign.tsx`): the user types or says who had what; `assign-split` (parse-transaction quota) only maps item ids to `self` / person ids / `new:<Name>` placeholders (unknown names, resolved by quick pick or "Add") plus the payer. All money math is client-side in pure `domain/receiptSplit.ts` (integer cents, tax/discount gap spread proportionally, RSD shares in whole dinars, rounding remainder on the payer, Serbian-case name matching), and its validator runs in both the function and `services/splitAssignService.ts`. "Continue" opens `SplitExpenseModal` with a `prefill` (exact amounts; "I paid" with the receipt attached, or "Someone paid for me" when another person paid). Voice uses `transcribe` with `parse: false`.
- "Ask your finances" (`components/ask/`, opened from the Insights "Ask" bar or the profile menu via `openAsk()` in `askBus.ts`; the sheet lives in `AppModals` and gets the workspace-scoped state): `ask-finances` runs in two modes. `plan` takes the question, a names-only schema (categories, accounts, people, events with dates, repeat merchants, teams; `buildAskSchema`) and the last 3 questions with their plans, charges one `parse-transaction` unit, and returns a strictly validated query plan (JSON DSL in `utils/financeQueryPlan.ts`, shared with Deno) or a clarifying question, plus a 10-minute HMAC token bound to user and question. The client runs the plan locally (`domain/financeQuery.ts`: datasets `transactions` / `eventExpenses` (my share or total, settlements excluded, linked transactions included) / `balances` (as of the range end), same money rules and `state.rates` as the rest of the app). `answer` (no quota, token required) takes only the sanitized aggregate table (`sanitizeResultTable`, at most 30 rows) and returns a short plain-text answer plus a chart hint (`bar`/`line`/`none`). Raw transactions, amounts per entry and dates never leave the device; if the answer step fails the sheet shows the exact numbers locally. Voice questions use `transcribe` with `parse: false`.
- `monthly-letter` (generate-insights quota) has two modes. `letter`: a title plus 3 to 6 sections about last month, worded from facts the client computes and pre-formats in the app language (`domain/monthlyLetter.ts`: totals, change vs previous month and the 3-month average, top movers, budget, one-offs, events, and one subscription to check from `domain/subscriptions.ts`). Only aggregates are sent. `explain-anomalies`: one sentence per AnomalyPanel item from compact per-anomaly context (`domain/anomalyContext.ts`), one batched call. Every number in the reply must appear in the facts (`domain/letterGrounding.ts`, pure and shared with the function): the server asks for one rewrite, then strips offending sentences; the client grounds again; dashes are sanitized. Letters are cached per user and workspace under `${CONFIG.STORAGE_KEY}:letters:<user>:<team|personal>` (24 kept, "Rewrite" replaces one), explanations under `:anomaly-why:` by signature. `components/insights/useMonthlyLetter.ts` (App) writes last month's letter on the first open after the 1st (3 tries, 6h apart), toasts or notifies (`letter` pref), and on native schedules a reminder for the next 1st; `services/letterService.ts` is the store the card, sheet and AnomalyPanel read.
- IPS QR payments (NBS standard, no network): pure `utils/ipsQr.ts` builds and parses payloads (mod 97 account check, allowed charset, field limits, `RSD1500,00` amounts, bill category rules). Payment details live in `settings.prefs.payment` (`state.paymentDetails`, migration `20261113220000_settings_prefs_payment.sql`, Settings > Payment details). "Request with QR" (PersonDetail, EventDebtSummary) calls `openPaymentRequest()` (`components/payments/paymentBus.ts`); the lazy `PaymentHost` in AppModals owns the sheet, which converts to whole dinars at `state.rates`, lazy-loads `uqr`, shares a PNG (Android `FinanceBridge.shareImage`, Web Share, or download) and settles through the existing flow. The receipt scanner reads IPS bills too (`classifyScannedQr`) and prefills an expense.
- Every table is RLS-protected; events are shared by email (`shared_emails`), and guests may edit but not take over or reshare an event. Data CHECK constraints reject oversized or malformed rows (error `23514`).
- Teams (`teams`, `team_members`, migration `20261113140000_teams.sql`): accounts, categories, transactions, events, recurring_transactions and people carry a nullable `team_id`. Members (matched by user id or JWT email via `public.is_team_member` / `public.team_role`) read and edit team rows; only the creator moves a row between teams, `user_id` never changes from a client, and deletes need the creator or a team owner/admin. Pure helpers live in `domain/teams.ts`.

## Architecture Overview

**Stack**: React 19 + TypeScript 7 + Vite 8 (Rolldown) + Tailwind CSS 4 + Motion 14 (`motion/react`) + Supabase + Capacitor 8 (Android)

### Navigation & Routing

No router library. Views are switched via `currentView` state in `App.tsx`. The `View` type in `types.ts` defines valid views: `'dashboard' | 'transactions' | 'analytics' | 'settings' | 'insights' | 'people' | 'calendar' | 'events'`. Desktop uses a sidebar, mobile uses a bottom nav with swipe gestures.

### State Management

No Redux/Zustand. Single `AppState` object managed via `useAppState()` hook with `useState`. State persists to segmented `localStorage` keys under the `gemini_finance_data_v5:*` namespace (debounced 300ms, flushed on unload/hidden) and validates against Zod schemas on load.

### Offline-First Sync

Three-layer architecture:
1. **`supabaseService.ts`** - Raw Supabase CRUD + auth (user cache with 5-minute TTL)
2. **`syncManager.ts`** - Wraps Supabase with per-entity debounce, retry logic, and normalized settings payloads
3. **`offlineQueue.ts`** - localStorage queue; operations enqueue when offline and replay on reconnect

### App.tsx Decomposition

`App.tsx` (~585 lines) is the orchestrator. Logic is extracted into hooks:
- `useAuth` - sign up/in/out, user caching, account deletion
- `useAppState` - central state, segmented persistence, theme application
- `useModals` - toggle state for modal flows
- `useKeyboardShortcuts` - Ctrl+N new transaction, Esc close
- `useExchangeRates` - currency rate fetching
- `useRecurringProcessor` - recurring generation on auth/focus/visibility/interval
- `useSync` - auto-sync settings changes to Supabase
- `useScrollRestore` - per-view scroll position
- `useTemplateHandlers` / `useRecurringHandlers` / `useEventHandlers` - domain-specific action wiring

### Component Organization

Large views are split into subdirectories with `index.ts` re-exports:
- `components/stats/` - Analytics charts (ExpenseChart, IncomeChart, CategoryBreakdown, StatsSummary)
- `components/settings/` - Settings tabs (General, Account, Data, Appearance)
- `components/split-expense/` - Split expense modal parts
- `components/event-detail/` - Event detail view parts

`Stats.tsx` remains as a thin lazy-load shell; the other old monolith re-export files were removed. Import from the subdirectory `index.ts`.

All views are lazy-loaded via `React.lazy` + `Suspense` with skeleton fallbacks. Heavy markdown, charting, and PDF export code is deferred into separate chunks so it stays out of the initial bundle.

### Theming

Material Design 3 color system with 15 themes defined in `theme.css` as CSS custom properties (RGB format for alpha support). Tailwind consumes these via `tailwind.config.js` mapping (for example `bg-primary`, `text-on-surface`). Dark mode is class-based. Theme switching applies a CSS class to the root element.

### Centralized Config

`config.ts` exports `CONFIG` (timing constants, storage keys, API URLs, retry delays) and `MOTION` (spring/animation presets for modals, sheets, views). Always use these instead of inline magic numbers.

### Domain Types

All domain models are in `types.ts`: Transaction, Account, Category, Person, Event, SharedExpense, RecurringTransaction, TransactionTemplate, ExchangeRates, AppState. The `Currency` type supports EUR, USD, RSD.

## Key Conventions

- **Mobile-first responsive**: Tailwind breakpoints; bottom nav is `md:hidden`, sidebar is `hidden md:flex`
- **Safe area insets**: Use `env(safe-area-inset-*)` for Capacitor/notch support
- **Hover states for desktop only**: Use `opacity-60 sm:opacity-0 sm:group-hover:opacity-100` pattern (not bare `opacity-0 group-hover:opacity-100`)
- **Icons**: Lucide React (`lucide-react`), add `aria-hidden="true"` on decorative icons
- **Animations**: Use `MOTION` presets from `config.ts` for consistency
- **Memoization**: `React.memo` is applied to list items (TransactionItem, AccountItem, EventCard)
- **i18n**: English and Serbian; translation strings are in `constants.ts`
- **Path alias**: `@/*` maps to project root (configured in tsconfig + vite)
- **Windows casing**: Avoid creating directories that collide with existing files case-insensitively (for example, do not create `stats/` when `Stats.tsx` exists in the same folder)
