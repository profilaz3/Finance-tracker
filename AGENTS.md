# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

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
- `AI_DAILY_LIMIT_SCAN_RECEIPT` / `AI_DAILY_LIMIT_PARSE_TRANSACTION` / `AI_DAILY_LIMIT_GENERATE_INSIGHTS` - per-user daily caps (defaults 30 / 100 / 30; the insights cap is shared by insights, the monthly letter, anomaly explanations and AI clean-up), enforced by `public.consume_ai_quota`
- `ALLOWED_ORIGINS` - extra comma-separated CORS origins

## Database & Edge Functions

- Schema lives in `supabase/migrations/` (baseline + hardening migrations). Never edit an applied migration; add a new timestamped file. `supabase/legacy/` holds the old hand-run SQL for reference only.
- Local stack: `supabase start` (applies migrations + `supabase/seed.sql`: users `ci-owner@example.test` / `ci-guest@example.test`, password `CiPassword123`, with a shared "Bergamo" event). `supabase db reset` re-applies everything.
- Browser regressions (`npm run test:*-regression`, Playwright) create and delete data. Run the app against the local stack (`VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_ANON_KEY=<anon key from supabase status> npm run dev`; shell env overrides `.env`). `scripts/e2eGuard.mjs` aborts requests to hosted Supabase unless `E2E_ALLOW_REMOTE=1`.
- Remote: `supabase db push --project-ref <ref>` and `supabase functions deploy <fn> --project-ref <ref> --use-api`. CI does this on main when the `ENABLE_SUPABASE_DEPLOY` repo variable is `true`.
- Edge functions share `supabase/functions/_shared/` (`http.ts` CORS/body limits/errors, `auth.ts` user check + AI quota, `openai.ts`, `input.ts`). `parse-transaction` and `scan-receipt` reuse validators from `utils/aiShared.ts`.
- `nbs-rates` (no AI, no quota) serves the official NBS middle rate for EUR and USD: today's list from `webappcenter.nbs.rs` with `kurs.resenje.org` as fallback, history from kurs in bulk, past days cached in `public.exchange_rates` (authenticated read, service role write). `state.rates` uses it (`provider: 'nbs'`, `listDate`) and falls back to the old provider, then the offline cache. Pure parsing in `utils/nbsRates.ts`, range maths in `domain/exchangeRates.ts`, the sheet in `components/rates/` (opened via `openRates()` from Settings or the Home Rates block).
- IPS QR payments (NBS standard, no network): pure `utils/ipsQr.ts` builds and parses payloads (mod 97 account check, allowed charset, field limits, `RSD1500,00` amounts, bill category rules). Payment details live in `settings.prefs.payment` (`state.paymentDetails`, migration `20261113220000_settings_prefs_payment.sql`, Settings > Payment details). "Request with QR" (PersonDetail, EventDebtSummary) calls `openPaymentRequest()` (`components/payments/paymentBus.ts`); the lazy `PaymentHost` in AppModals owns the sheet, which converts to whole dinars at `state.rates`, lazy-loads `uqr`, shares a PNG (Android `FinanceBridge.shareImage`, Web Share, or download) and settles through the existing flow. The receipt scanner reads IPS bills too (`classifyScannedQr`) and prefills an expense.
- Home header (`components/home/HomeHero.tsx`, settings in `HeaderSettingsSheet.tsx`): the user picks the main number (`budget` left to spend, `networth`, `today`, `month`, `owed`, `rate`) and up to three numbers under it (stats or `wallet:<id>`), stored in `settings.prefs.homeHeader` (`state.homeHeader`, migration `20261115200000_settings_prefs_home_header.sql`). Pure rules in `domain/homeHeader.ts`: `resolveHomeHeader` repairs stored values, `shownFace` / `shownStats` swap in a stand-in when something cannot be shown (no budget, past month, deleted wallet), and a dated active event replaces the face with a trip view while `trip` is on. `blocksShownInHeader` lists the blocks the header already shows (the main number's own block: budget, networth, rates, or event for a trip; Wallets when every wallet is a number under it); Home hides them, and while customizing shows them dimmed with an "In the header" tag. Colour is `hero-bg` (the theme's `--accent-card`) or `hero-dark`, so it follows theme and accent. Its strings live in the lazy `components/home/headerStrings.ts` to keep startup JS in budget. On phones the header runs under the status bar (`setStatusBarOverColour` in `utils/appearance.ts` hides the scrim and switches Android to light icons).
- Screen headers: Activity, Calendar, Shared and People open with `ScreenHero` (`components/ui/ScreenHero.tsx`: the Home header's colour from `resolveHomeHeader(...).tone`, `HeroIconButton`, `HeroMenu`) followed by a `screen-sheet` body; use white-only colours on the hero so it works with every accent and the dark tone. New screen copy goes in a lazy per-screen strings module (`activityStrings.ts`, `calendarStrings.ts`, `components/shared/sharedStrings.ts`), not `constants.ts`, to keep startup JS in budget. Calendar maths (month grid, recurring occurrences, heat levels) is pure in `domain/calendar.ts`.
- Shared tab (`EventsView.tsx`, nav label `navEvents` = Shared / Zajedničko): owed and owing totals from person balances (`components/shared/sharedSummary.ts`, the same sums as Home), the event happening now with your balance in it (`eventMoney`, worked out like the event screen), a People strip and earlier events. `PeopleView` is its sub-page (back to `events`): filters All / Owe you / You owe, Remind (share sheet or clipboard), Request with QR, and "I paid {name} back"; it also renders embedded in Settings > Data.
- Every table is RLS-protected; events are shared by email (`shared_emails`), and guests may edit but not take over or reshare an event. Data CHECK constraints reject oversized or malformed rows (error `23514`).

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

All colours live in `src/theme.css`. The root carries `theme-paper [paper-theme-<name>] [paper-dark] accent-<name> glass-<level>` (`getAppearanceClasses` in `utils/appearance.ts`). `.theme-paper` defines the paper tokens (`--paper-bg/tile/text/muted/pos/neg/...`, `--accent-rgb`, glass) and remaps the older MD3 triplets (`--md-sys-color-*`) so legacy screens follow along; Tailwind 4 reads them in `@theme inline` (`bg-tile`, `text-muted`, `bg-accent`, `text-on-surface`). Themes (`paper`, `midnight` with true black dark, `sand`, `forest`, `ocean`, `rose`) override the whole set for light and dark; each has a default accent (`THEME_DEFAULT_ACCENT`). Accents: 10 named classes plus `custom`, whose hex is turned into light and dark variants that meet 3:1 on every theme surface and 4.5:1 for text on the accent (`utils/colorContrast.ts`, lazy-loaded, result cached under `:custom-accent`) and set as `--custom-*` properties on `<html>`. `appearance.theme` / `customAccent` sync in `settings.prefs`; unknown values fall back to paper / teal. `index.tsx` applies the saved appearance before React mounts (no flash); the meta theme-color reads `--paper-bg` and Android bar icons follow the mode. The gallery previews and swatches re-scope tokens with wrapper classes (`getThemeScopeClasses`). `tests/themeAccessibility.test.ts` checks contrast for every theme, mode and accent. The Android splash and home screen widget keep their own colours.

### Centralized Config

`config.ts` exports `CONFIG` (timing constants, storage keys, API URLs, retry delays) and `MOTION` (spring/animation presets for modals, sheets, views). Always use these instead of inline magic numbers.

### Domain Types

All domain models are in `types.ts`: Transaction, Account, Category, Person, Event, SharedExpense, RecurringTransaction, TransactionTemplate, ExchangeRates, AppState. The `Currency` type supports EUR, USD, RSD.

## Key Conventions

- **Entry details**: tapping an entry (activity list, calendar, Home, an event's linked entries) opens `TransactionDetailsSheet` through `openTransactionDetails(id, origin?)` (`components/transaction-details/detailsBus.ts`; without an origin the bus uses the last pressed row, or the focused one). It is a centered card, not a bottom sheet: `useGrowFromOrigin` grows it out of the tapped row and shrinks it back on close (uniform scale plus a clip band, plain fade when the row is gone or motion is reduced). App keeps only the id and origin (`modals.detailsId` / `detailsOrigin`) and the card reads the live entry, so edits show up in it and a deleted entry closes it. Layout: header (glyph, title, category · wallet · date), amount ("Your share of" for splits), `DebtsCard` (who is on the bill; paid status from pure `domain/entryDebts.ts`, which applies each person's repayments and credits in the entry's currency to their oldest debts first, since `isPaid` is never stored; Request opens `openPaymentRequest` and settles through `handleSettleUp` with the entry's wallet), `ReceiptCard` (collapsible lines, shop details, official link; open by default when nobody owes), facts, a dashed "Split this bill", and a footer with a menu (Duplicate, Save as template, Delete), Share and Edit. Edit opens `SplitExpenseModal` for split entries, else `EditTransactionModal`, on top of the card. Share draws a light PNG card (`shareCard.ts`) and goes through `utils/shareImage.ts` (`sharePng`, also used by payment QR). A fiscal receipt keeps shop details and its tax portal link in `receiptData` (`fiscalDetails` in `domain/receiptDetails.ts`); receipt data on team entries is untrusted, so the link is rendered only via `officialReceiptUrl` (re-checked with `parseFiscalUrl`).
- **Receipt photos** (migration `20261115180000_receipt_photos.sql`): private Storage bucket `receipts` (2 MB, WebP/JPEG) at `<uploader id>/<uuid>.webp|jpg`, referenced from `receiptData.photo` (no new column; `transactions_receipt_photo_check` accepts only that path shape; read it through `receiptPhotoOf` in `domain/receiptPhoto.ts`). Policies: anyone reads their own folder, and a photo on an entry they can see (owner or team member); insert and delete only in their own folder. `services/receiptPhotoService.ts` downscales to 1600px (q 0.8), uploads (refused offline) and hands out 1-hour signed links. Photos are added from the details card menu ("Add receipt photo"; tile, full-screen viewer with Replace and Remove + Undo, saved with `updateTransaction(..., { silent: true })` so an open edit form stays) or kept from the scanner ("Keep the photo with the entry", on by default; a failed upload saves nothing and says why). Duplicates never copy the photo. Deleting an entry or replacing/removing a photo queues it in `${CONFIG.STORAGE_KEY}:receipt-photo-cleanup`; undo cancels, and `useReceiptPhotoCleanup` (App, full state) deletes queued photos after 3 minutes when no entry references them, only from the user's own folder. `delete-user` purges the bucket too.
- **Mobile-first responsive**: Tailwind breakpoints; bottom nav is `md:hidden`, sidebar is `hidden md:flex`
- **Safe area insets**: Use `env(safe-area-inset-*)` for Capacitor/notch support
- **Hover states for desktop only**: Use `opacity-60 sm:opacity-0 sm:group-hover:opacity-100` pattern (not bare `opacity-0 group-hover:opacity-100`)
- **Icons**: Lucide React (`lucide-react`), add `aria-hidden="true"` on decorative icons
- **Animations**: Use `MOTION` presets from `config.ts` for consistency
- **Memoization**: `React.memo` is applied to list items (TransactionItem, AccountItem, EventCard)
- **i18n**: English and Serbian; translation strings are in `constants.ts`
- **Path alias**: `@/*` maps to project root (configured in tsconfig + vite)
- **Windows casing**: Avoid creating directories that collide with existing files case-insensitively (for example, do not create `stats/` when `Stats.tsx` exists in the same folder)
