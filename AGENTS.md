# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Build & Dev Commands

- `npm run dev` - Start Vite dev server (port 3000)
- `npm run build` - Production build (outputs to `dist/`)
- `npm run preview` - Preview production build
- `npm test` - Run Vitest unit tests
- `npm run analyze` - Bundle analysis with rollup-plugin-visualizer
- `npm run build:android` - Build + Capacitor sync for Android
- `npx tsc --noEmit` - Type-check (currently clean)

## Environment Variables

Required in `.env` (see `.env.example`; `.env.local` holds other local-only secrets):
- `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` - Supabase backend

Required in Supabase Edge Function secrets:
- `OPENAI_API_KEY` - Receipt scanning and AI insights

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
