# Finance App Remediation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the app's security, build health, performance, maintainability, and reliability without changing its core product direction.

**Architecture:** Keep the current React + TypeScript + Supabase structure, but reduce risk in the current design by moving AI work server-side, shrinking heavy bundles, splitting oversized coordination files, tightening sync boundaries, and adding test coverage around money-critical logic.

**Tech Stack:** React 19, TypeScript 5.8, Vite 6, Tailwind 4, Framer Motion 11, Supabase, Capacitor, OpenAI, localStorage, react-virtuoso, native SVG charts, browser print export

---

## Current Baseline

### Verified Signals
- `npm run build` passes.
- `npm run analyze` passes.
- `npx tsc --noEmit` passes.
- `npm test` passes with 97 tests.

### Observed Risk Areas
- `App.tsx` is still the main control center, but it is down to 1278 lines after extracting navigation, view routing, and modal rendering.
- `components/TransactionsView.tsx` is still large and worth another decomposition pass later.
- `services/supabaseService.ts` and the sync stack still carry a lot of coordination logic.
- The root entry chunk is much smaller than the original baseline, but there is still room to trim app-shell weight further if needed.

### Bundle Snapshot
- Main chunk: about 687 KB
- `TransactionsView` chunk: about 486 KB
- `Stats` chunk: about 383 KB
- `html2canvas` chunk: about 195 KB
- `aiService` chunk: about 106 KB

## Principles For This Fix

- Security first: remove exposed secrets before polishing architecture.
- Stabilize the foundation before refactoring large files.
- Prefer small, reviewable PRs over one heroic mega-PR.
- Add tests around financial logic before changing the logic deeply.
- Preserve current UX unless the change directly improves safety, speed, or clarity.

## Execution Order

1. AI security hardening
2. TypeScript baseline cleanup
3. Bundle optimization
4. Sync boundary cleanup
5. Recurring transaction reliability
6. App orchestration refactor
7. Persistence strategy upgrade
8. Test harness and coverage

## Workstream 1: AI Security Hardening

**Priority:** Critical

**Problem**
- The OpenAI API key is exposed to the client.
- AI parsing, receipt scan, and insights generation all run from the browser.

**Primary Files**
- `services/aiService.ts`
- `README.md`
- `.env.example`
- `supabase/functions/delete-user/index.ts`
- New edge functions under `supabase/functions/`

**Target Outcome**
- Move AI calls to Supabase Edge Functions or equivalent server-side endpoints.
- Remove `VITE_OPENAI_API_KEY` from client usage.
- Keep the frontend as an authenticated HTTP caller only.

**Implementation Notes**
- Create one server-side endpoint per AI capability:
  - transaction parsing
  - receipt scanning
  - insights generation
- Reuse the current validation logic where possible.
- Add auth checks and clear failure responses.
- Keep output contracts stable so the UI does not need a full rewrite.

**Success Criteria**
- No OpenAI secret is shipped to the browser.
- `services/aiService.ts` no longer imports the OpenAI SDK directly for client-side use.
- AI features still work for authenticated users.

**Risks**
- Supabase Edge Function typing/setup may need its own config isolation.
- AI latency may increase slightly after moving server-side.

## Workstream 2: TypeScript Baseline Cleanup

**Priority:** High

**Problem**
- Type-check is red, which hides new problems and slows safe refactoring.

**Primary Files**
- `index.tsx`
- `components/DashboardView.tsx`
- `components/ReceiptScanModal.tsx`
- `components/TransactionItem.tsx`
- `hooks/useFormValidation.ts`
- `hooks/useImagePicker.ts`
- `services/storageService.ts`
- `services/supabaseService.ts`
- `services/syncManager.ts`
- `tsconfig.json`

**Target Outcome**
- Make `npx tsc --noEmit` green for the web app, or intentionally split server-side Supabase function typing into a separate config so the main app stays green.

**Implementation Notes**
- Fix missing React DOM typing.
- Fix browser timer typings in storage and sync services.
- Align nullable UI state with actual setter types.
- Tighten `useImagePicker` ref and callback types.
- Remove unsafe casts between `useSync`, `syncManager`, and `supabaseService`.
- Decide whether Supabase Edge Functions should be excluded from the main app TS run or typed in a dedicated way.

**Success Criteria**
- Type-check output is either clean or documented and intentionally scoped.
- Repo documentation matches the real type-check expectations.

**Risks**
- If edge function files stay inside the same TS program, the app config may keep failing for reasons unrelated to the UI.

## Workstream 3: Bundle Optimization

**Priority:** High

**Problem**
- Startup and view chunks are larger than they should be.

**Primary Files**
- `vite.config.ts`
- `services/aiService.ts`
- `components/InsightsView.tsx`
- `components/TransactionsView.tsx`
- `components/Stats.tsx`
- `utils/pdfExport.ts`
- Any export-related modal components

**Target Outcome**
- Reduce initial JS cost and avoid loading heavy libraries until the user actually needs them.

**Implementation Notes**
- Remove client OpenAI SDK from the main app path as part of Workstream 1.
- Lazy-load PDF/export code only when export starts.
- Consider manual chunking for:
  - charts
  - export/PDF tools
  - AI features
  - markdown/rendering
- Review whether `html2canvas`, `jspdf`, and charting libraries can be kept off the initial route.

**Success Criteria**
- Main entry chunk drops materially below current size.
- `npm run analyze` no longer warns about obviously avoidable giant chunks.
- AI and export bundles load on demand.

**Risks**
- Over-aggressive chunking can create too many network requests.

## Workstream 4: Sync Boundary Cleanup

**Priority:** High

**Problem**
- Settings sync can also trigger category syncs, which blurs responsibilities and causes extra writes.
- Sync interfaces are not strongly aligned across layers.

**Primary Files**
- `hooks/useSync.ts`
- `services/syncManager.ts`
- `services/supabaseService.ts`
- `services/offlineQueue.ts`
- `config.ts`

**Target Outcome**
- Separate settings sync from category sync and profile sync.
- Make queueing and sync payloads explicit and type-safe.

**Implementation Notes**
- Define one payload shape per sync channel.
- Remove the cast in `useSync`.
- Keep `syncSettings` limited to settings data only.
- Sync categories through category-specific handlers only.
- Review duplicate queueing behavior for repeated updates to the same entity.

**Success Criteria**
- Changing theme/language/profile does not fan out into unrelated category writes.
- Sync layers share matching payload types.
- Queue behavior is easier to reason about and debug.

**Risks**
- Changing sync boundaries can accidentally break offline replay if done carelessly.

## Workstream 5: Recurring Transaction Reliability

**Priority:** Medium-High

**Problem**
- Recurring processing only runs on authentication load and manual trigger.
- Long-lived sessions can drift past due items.

**Primary Files**
- `App.tsx`
- `components/settings/DataSettings.tsx`
- `utils/recurringUtils.ts`
- `types.ts`

**Target Outcome**
- Recurring transactions process reliably when the app resumes, when the day changes, or when a guarded scheduler runs.

**Implementation Notes**
- Move recurring orchestration into its own controller hook.
- Trigger checks on:
  - auth success
  - app foreground/resume
  - date rollover
- Keep idempotency guards so the same recurring item is not generated twice.

**Success Criteria**
- Due recurring items are generated predictably without needing a manual visit to settings.
- Duplicate generation is prevented.

**Risks**
- Poor idempotency handling could create duplicate money records, which would suck enormously.

## Workstream 6: App Orchestration Refactor

**Priority:** Medium

**Problem**
- `App.tsx` owns too many responsibilities.

**Primary Files**
- `App.tsx`
- `hooks/useAppState.ts`
- `hooks/useAuth.ts`
- `hooks/useModals.ts`
- New domain hooks under `hooks/`

**Target Outcome**
- Reduce `App.tsx` to composition and routing concerns.

**Implementation Notes**
- Extract controller hooks such as:
  - `useTransactionsController`
  - `usePeopleController`
  - `useEventsController`
  - `useRecurringController`
  - `useNavigationController`
- Keep current component props stable where practical to avoid a massive UI rewrite.
- Refactor in slices, not all at once.

**Success Criteria**
- `App.tsx` becomes meaningfully smaller and easier to read.
- Feature logic lives in focused hooks instead of one giant orchestrator.

**Risks**
- Doing this before type cleanup and sync cleanup would make the refactor riskier than necessary.

## Workstream 7: Persistence Strategy Upgrade

**Priority:** Medium

**Problem**
- Full `AppState` persistence to `localStorage` is simple but brittle as the dataset grows.

**Primary Files**
- `hooks/useAppState.ts`
- `services/storageService.ts`
- `utils/safeStorage.ts`
- `schemas/`

**Target Outcome**
- Move toward a more durable and scalable persistence model.

**Implementation Notes**
- Short term:
  - keep current persistence but harden migrations and validation
  - reduce unnecessary writes
- Medium term:
  - move large local datasets to IndexedDB
  - keep `localStorage` for lightweight preferences and queue metadata only
- Add versioned migration notes for future schema changes.

**Success Criteria**
- Large local datasets remain stable.
- State loading and migration logic are easier to evolve safely.

**Risks**
- Storage migrations can strand old user data if not tested carefully.

## Workstream 8: Test Harness And Coverage

**Priority:** Medium

**Problem**
- There are no automated tests around money logic.

**Primary Files**
- `package.json`
- `vite.config.ts` or a separate test config
- `utils/recurringUtils.ts`
- `services/offlineQueue.ts`
- `services/currencyService.ts`
- Split and transaction helper files as needed

**Target Outcome**
- Add a lightweight test setup and cover the highest-risk financial logic first.

**Implementation Notes**
- Add Vitest for unit-level coverage.
- Start with tests for:
  - recurring due-date logic
  - currency conversion
  - queue retry/dedupe behavior
  - split-expense calculations
  - export formatting for key edge cases
- Do not begin with huge component snapshot tests.

**Success Criteria**
- Core money logic is protected by fast automated tests.
- Future refactors become safer.

**Risks**
- If test setup is delayed until after major refactors, regression risk stays high.

## Suggested Delivery Phases

### Phase 1: Stabilize And De-Risk
- Workstream 1: AI Security Hardening
- Workstream 2: TypeScript Baseline Cleanup
- Workstream 4: Sync Boundary Cleanup

### Phase 2: Speed And Reliability
- Workstream 3: Bundle Optimization
- Workstream 5: Recurring Transaction Reliability

### Phase 3: Maintainability
- Workstream 6: App Orchestration Refactor
- Workstream 7: Persistence Strategy Upgrade
- Workstream 8: Test Harness And Coverage

## Recommended PR Breakdown

1. `security/move-ai-server-side`
2. `chore/fix-typescript-baseline`
3. `perf/reduce-web-bundle`
4. `refactor/separate-sync-boundaries`
5. `fix/recurring-processing-reliability`
6. `refactor/split-app-controller`
7. `infra/improve-local-persistence`
8. `test/add-financial-logic-coverage`

## Out Of Scope For This Plan

- Visual redesign
- New product features
- Full state-management library migration
- Backend schema redesign unrelated to AI or usage tracking
- Android-native optimization beyond what falls out of the web improvements

## Decision Notes

- Existing `plans/` folder is treated as the repo planning location.
- Previous plan files in `plans/` already cover portions of AI migration and bundle optimization. This plan supersedes them as the top-level remediation roadmap while still allowing those files to be reused for implementation detail.
- The safest first move is AI hardening, not refactoring. We do not polish the furniture while the front door is missing.

## Ready-To-Start Recommendation

Implementation status as of 2026-04-05:

- [x] Create the server-side AI path and remove client secret exposure.
- [x] Clean the TypeScript baseline so future changes are safer.
- [x] Reduce avoidable bundle weight with on-demand loading and chunking.
- [x] Separate settings sync from category sync before deeper refactors.
- [x] Make recurring processing run on resume/focus/interval with duplicate guards.
- [x] Refactor `App.tsx` orchestration into smaller domain hooks.
- [x] Revisit large deferred chunks (`pdf-tools`, `charts`, `html2canvas`) and keep them deferred unless runtime usage justifies deeper splitting.
- [x] Move beyond whole-state `localStorage` persistence.
- [x] Resolve missing shared-event participant identities with deterministic placeholders so event expenses stop rendering blank payer names.
- [x] Format shared participant placeholders into readable display labels instead of raw email addresses when no real profile is available.
- [x] Strip inline avatar data from persisted profiles and normalize persisted people records to avoid localStorage quota failures and stale state slices.
- [x] Reuse a browser-global Supabase client singleton so dev reloads do not spawn duplicate GoTrue auth clients.
- [x] Prove the shared-event flow in a real production preview by sharing an event and confirming the invited participant chip appears immediately.
- [x] Check in a reproducible Playwright share-flow regression script so the event invite path can be re-run without manual click archaeology.
- [x] Split auth and modal surfaces out of the startup path so closed overlays stop inflating the main entry chunk.
- [x] Stop preloading markdown and PDF helper chunks from `index.html` so first paint does not drag export/report code over the wire.
- [x] Push sync manager and queue status wiring behind cached runtime loaders to reduce first-load JavaScript.
- [x] Split the analytics shell from the heavy chart sections so `Stats` stops shipping the full chart stack up front.
- [x] Gate analytics chart sections behind viewport visibility so lower charts do not fetch until the user gets near them.
- [x] Trim dead global CSS helpers and replace the blanket `transition: all` rule with targeted interactive transition properties.
- [x] Remove direct `supabaseService` imports from `App.tsx` and `useAuth` so auth bootstrap goes through the runtime loader instead of pinning one more static edge into the entry path.
- [x] Split `ExportModal` out of `TransactionsView` so the closed export UI becomes its own on-demand chunk.
- [x] Remove the remaining direct `supabaseService` imports from `AuthView`, event creation, and event detail image flows so those surfaces also resolve the service through the runtime loader.
- [x] Split shared `framer-motion` and `lucide-react` code into dedicated vendor chunks so the startup bundle stops carrying animation and icon code inline.
- [x] Add a checked-in bundle snapshot script so future performance work can inspect chunk sizes without spelunking through the visualizer HTML blob.
- [x] Add a bundle budget guard that measures actual startup JavaScript from `index.html` and fails loudly when key chunk ceilings regress.
- [x] Replace `recharts` analytics rendering with local SVG chart primitives and remove the charting dependency entirely.
- [x] Add a checked-in analytics browser regression so the rewritten charts are proven in a real browser, not just in unit tests.
- [x] Replace the jsPDF/html2canvas export path with a native printable report and remove the PDF libraries entirely.
- [x] Add bundle guardrails that fail if `CartesianChart`, `pdf-tools`, or `html2canvas` ever reappear in emitted assets.
- [x] Normalize mojibake-damaged Serbian strings in export and transactions UI copy and add a regression test for those files.
- [x] Remove `framer-motion` and `uuid` from the root app shell so startup no longer pulls animation/runtime ID helpers into the main entry path.
- [x] Replace eager toast and sync-status motion wrappers with CSS transitions so shell chrome stops preloading the motion vendor chunk.
- [x] Stop preloading the shared `motion` chunk from `index.html` now that it is only needed by deferred routes and overlays.
- [x] Check in a transactions export browser regression that proves CSV download, JSON download, and printable-report generation in a production preview.
- [x] Tighten the bundle budget ceilings after the preload cleanup so startup regressions fail earlier.
- [x] Replace eager `lucide-react` imports in the app shell, toast stack, sync badge, and error boundary with local SVG icons so the icon vendor chunk drops out of startup.
- [x] Stop preloading the shared `icons` chunk from `index.html` once the shell no longer needs it at boot.
- [x] Check in `docs/repo-rules.md` so future changes have explicit layer, naming, data, and testing rules instead of tribal knowledge.
- [x] Extract app shell navigation, view routing, and modal rendering into `components/app/*` so `App.tsx` is closer to composition than a 1000-line dumpster fire.
- [x] Add architecture contracts that fail if UI files import `supabaseService` directly or if app-shell rendering collapses back into `App.tsx`.
- [x] Split `TransactionsView` into route-level toolbar, list, and FAB modules so the transaction surface stops living as one giant mixed-concern component.
- [x] Add `domain/transactions.ts` and move transaction draft creation and duplication rules out of inline UI wiring.
- [x] Add `utils/transactionFilters.ts` and cover filtering/grouping behavior with dedicated tests instead of burying it inside the view component.
- [x] Add `domain/people.ts` and `domain/events.ts` so person/account/category/event collection mutations stop living inline inside `App.tsx` and hook files.
- [x] Extract `usePeopleHandlers` and move profile, person, account, and category mutations behind a hook boundary instead of wiring them directly in the root component.
- [x] Extract `useTransactionHandlers` so transaction create/update/delete/undo orchestration and transfer-specific sync logic no longer sit inline in `App.tsx`.
- [x] Extend repo architecture contracts so they fail when `App.tsx` grows its old inline person or transaction mutation blocks back.
- [x] Extract `useAccountHandlers` so account update flows stop mutating state inline in the root component.
- [x] Extract `useSplitHandlers` so split-expense orchestration and sync wiring move behind a dedicated hook boundary instead of living in `App.tsx`.
- [x] Add `utils/financialSelectors.ts` and `useFinancialSelectors` so root-level totals and account balance math live in dedicated selector modules instead of ad hoc `useMemo` blocks.
- [x] Add `utils/balanceMutations.ts` so account initial-balance adjustment and split person-balance deltas share one tested mutation path instead of duplicating rounding math in UI handlers.
- [x] Check in a transactions CRUD browser regression that proves create, edit, and delete behavior in a real production preview.
- [x] Fix add-transaction modal semantics so draft transactions render add-mode heading and do not expose delete actions before they are persisted.
- [x] Check in an account edit browser regression that proves wallet name and displayed balance edits survive save, revert cleanly, and reload without console errors in a production preview.
- [x] Add `utils/dashboardSummarySelectors.ts` so dashboard wallet ordering, active people filtering, and debt summary totals live behind tested selectors instead of inline view math.
- [x] Reuse the dashboard debt-summary selector in `PeopleView` so the people summary cards stop duplicating currency-conversion logic.
- [x] Extract event-detail derived collections into `components/event-detail/useEventDetailViewModel.ts` so participant resolution, linked transaction projection, unified expenses, and summary expenses stop living inline in `EventDetailView`.
- [x] Add coverage for the event-detail view model and dashboard summary selectors so those derived-data paths fail loudly when refactors break them.
- [x] Check in a recurring create/toggle/delete browser regression that proves the live settings flow works in a production preview and survives a final reload after deletion.
- [x] Add a one-shot recurring-regression cleanup script so stale `Recurring Regression` and `Debug Recurring` rows can be wiped from the shared test account without hand-editing data.
- [x] Check in an event-detail summary browser regression that proves the Summary tab renders breakdown sections, charts, and currency toggles in a production preview.
- [x] Check in a dashboard summary browser regression that waits for post-login hydration and proves both wallet summaries and people debt cards render in a production preview.
- [x] Add `.github/workflows/ci.yml` so GitHub Actions always runs verify (`npm test`, `npx tsc --noEmit`, `npm run build`) and conditionally runs the browser regressions when real Supabase and E2E account secrets are configured.

Current performance snapshot after remediation follow-up:

- Main entry chunk: about 335 KB
- `syncManager` chunk: about 5 KB
- `offlineQueue` chunk: about 3 KB
- `TransactionsView` chunk: about 77 KB
- `components/TransactionsView.tsx`: down to about 297 lines after route extraction
- `ExportModal` chunk: about 6.2 KB
- `pdfExport` chunk: about 4.9 KB
- `Stats` shell chunk: about 8.5 KB
- `ExpenseChart` chunk: about 7.0 KB
- `IncomeChart` chunk: about 2.8 KB
- `CategoryBreakdown` chunk: about 6.8 KB
- `motion` vendor chunk: about 118 KB
- `icons` vendor chunk: about 35 KB
- `supabaseService` chunk: about 11 KB
- Startup JavaScript budget: about 320 KB against a 380 KB ceiling
- CSS bundle: about 114 KB raw / 16.4 KB gzip

Current blocker for further root-chunk reduction:

- The startup path is now essentially the remaining 320 KB entry bundle. The Supabase SDK, markdown renderer, motion runtime, and icon vendor chunk are all deferred now, so the next meaningful gains need to come from trimming the root entry graph itself instead of preload shuffling.
