# Repo Rules

This file is the working rulebook for future edits. The goal is simple: keep the codebase easy to scan, easy to change, and hard to accidentally rot.

## Layer Boundaries

- `components/` render UI.
- `hooks/` coordinate UI behavior and side effects.
- `services/` talk to Supabase, storage, network, and other runtime systems.
- `utils/` stay pure. No React, no DOM writes, no network, no storage.
- `tests/` protect behavior and architecture rules.

## Import Rules

- Components do not import Supabase directly.
- Components do not import `offlineQueue` or `syncManager` directly.
- Components should prefer props, controller hooks, and runtime loaders over reaching into services.
- `utils/` do not import React, browser-only UI libraries, or backend clients.
- Root shell files should avoid heavy runtime imports when a deferred route can own them instead.

## App Structure Rules

- `App.tsx` stays a coordinator, not a god file.
- App shell chrome lives in dedicated files such as navigation and router components.
- Route switching belongs in a router-style component, not inline inside the root shell.
- If a handler block grows past roughly 30 lines, move it into a hook or domain helper.

## File Size Guidance

- Components: aim for 250 lines or less.
- Hooks and services: aim for 250 lines or less.
- If a file grows past 300 lines, split by responsibility, not by random chunks.
- If a file needs a long comment to explain what it does, the boundary is probably wrong.

## Data Rules

- Use `createId()` for new IDs.
- Keep money math in shared helpers, not in components.
- Keep date logic in shared helpers, not inline in view code.
- Use one clear write path for each domain area instead of rebuilding mutation logic in many places.

## Naming Rules

- Prefer names that say exactly what the code does.
- Good: `calculateSplitTotals`, `buildPrintableReport`, `syncSettingsOnly`
- Bad: `handleThing`, `processData`, `updateStuff`

## Testing Rules

- Add a failing test first for new behavior or bug fixes.
- Prefer small unit tests for pure logic and contract tests for architecture rules.
- Keep browser regressions for high-risk flows such as auth, event sharing, exports, and AI entry points.
- Add tests for architectural rules when a boundary matters enough to protect.

## AI-Friendly Rules

- Keep files focused.
- Keep imports directional and boring.
- Prefer pure helpers over inline business logic.
- Prefer explicit props over hidden cross-file coupling.
- Write code so a new session can understand the file without opening six others just to know what the damn thing does.
