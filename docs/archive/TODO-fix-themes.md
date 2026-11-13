# TODO: Fix Theme System (White Screens) + Broken CSS Patterns

## Problem
All screens are white with no theme colors. `tailwind.config.js` is **never loaded** by Tailwind CSS v4 (`@tailwindcss/postcss` v4.1.18). The v4 plugin only reads CSS-native `@theme` directives — not JS config files. Zero custom utility classes (`bg-primary`, `text-on-surface`, `bg-scrim`, etc.) exist in the built CSS.

---

## TODO 1: Add `@theme` block to `src/theme.css`
**File:** `src/theme.css`
**Location:** After `@import "tailwindcss"` (line 1), before `:root` (line 3)

Insert this block to register all custom colors, shadows, radii, and fonts with Tailwind v4:

```css
@theme {
  /* Primary */
  --color-primary: rgb(var(--md-sys-color-primary));
  --color-on-primary: rgb(var(--md-sys-color-on-primary));
  --color-primary-container: rgb(var(--md-sys-color-primary-container));
  --color-on-primary-container: rgb(var(--md-sys-color-on-primary-container));

  /* Secondary */
  --color-secondary: rgb(var(--md-sys-color-secondary));
  --color-on-secondary: rgb(var(--md-sys-color-on-secondary));
  --color-secondary-container: rgb(var(--md-sys-color-secondary-container));
  --color-on-secondary-container: rgb(var(--md-sys-color-on-secondary-container));

  /* Tertiary */
  --color-tertiary: rgb(var(--md-sys-color-tertiary));
  --color-on-tertiary: rgb(var(--md-sys-color-on-tertiary));
  --color-tertiary-container: rgb(var(--md-sys-color-tertiary-container));
  --color-on-tertiary-container: rgb(var(--md-sys-color-on-tertiary-container));

  /* Error */
  --color-error: rgb(var(--md-sys-color-error));
  --color-on-error: rgb(var(--md-sys-color-on-error));
  --color-error-container: rgb(var(--md-sys-color-error-container));
  --color-on-error-container: rgb(var(--md-sys-color-on-error-container));

  /* Warning & Scrim */
  --color-warning: rgb(var(--md-sys-color-warning));
  --color-on-warning: rgb(var(--md-sys-color-on-warning));
  --color-scrim: rgb(var(--md-sys-color-scrim));

  /* Surface */
  --color-surface: rgb(var(--md-sys-color-surface));
  --color-on-surface: rgb(var(--md-sys-color-on-surface));
  --color-on-surface-variant: rgb(var(--md-sys-color-on-surface-variant));

  /* Outline */
  --color-outline: rgb(var(--md-sys-color-outline));
  --color-outline-variant: rgb(var(--md-sys-color-outline-variant));

  /* Surface containers */
  --color-surface-container-lowest: rgb(var(--md-sys-color-surface-container-lowest));
  --color-surface-container-low: rgb(var(--md-sys-color-surface-container-low));
  --color-surface-container: rgb(var(--md-sys-color-surface-container));
  --color-surface-container-high: rgb(var(--md-sys-color-surface-container-high));
  --color-surface-container-highest: rgb(var(--md-sys-color-surface-container-highest));

  /* Shadows */
  --shadow-elevation-1: 0 1px 3px 1px rgba(0, 0, 0, 0.15), 0 1px 2px 0 rgba(0, 0, 0, 0.3);
  --shadow-elevation-2: 0 2px 6px 2px rgba(0, 0, 0, 0.15), 0 1px 2px 0 rgba(0, 0, 0, 0.3);
  --shadow-elevation-3: 0 4px 8px 3px rgba(0, 0, 0, 0.15), 0 1px 3px 0 rgba(0, 0, 0, 0.3);
  --shadow-elevation-4: 0 8px 30px -8px rgba(0, 0, 0, 0.25);
  --shadow-elevation-5: 0 20px 60px -15px rgba(0, 0, 0, 0.35);

  /* Border radius */
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-xl: 28px;
  --radius-2xl: 32px;
  --radius-3xl: 40px;

  /* Fonts */
  --font-sans: 'Outfit', sans-serif;
  --font-display: 'Inter', sans-serif;
}
```

**Why this works:** The CSS vars store space-separated RGB numbers (e.g. `163 230 53`). Wrapping with `rgb()` produces valid CSS colors (e.g. `rgb(163 230 53)`). Tailwind v4 alpha syntax (`bg-primary/50`) uses `color-mix(in oklab, var(--color-primary) 50%, transparent)` — which works on valid CSS color values.

---

## TODO 2: Fix broken `rgba(var(...), alpha)` patterns in `src/theme.css`
**File:** `src/theme.css`

The `rgba(var(--md-sys-color-*), alpha)` syntax is **invalid CSS** because the var expands to space-separated numbers, producing e.g. `rgba(163 230 53, 0.4)` (2 args instead of 4). Use `rgb(var(...) / alpha)` instead (which is valid modern CSS).

| Line | Current (BROKEN) | Fix |
|------|-------------------|-----|
| 776 | `rgba(var(--md-sys-color-primary), 0.4)` | `rgb(var(--md-sys-color-primary) / 0.4)` |
| 780 | `rgba(var(--md-sys-color-primary), 0.5)` | `rgb(var(--md-sys-color-primary) / 0.5)` |
| 915 | `rgba(var(--md-sys-color-surface-container), 0.7)` | `rgb(var(--md-sys-color-surface-container) / 0.7)` |
| 921 | `rgba(var(--md-sys-color-surface-container), 0.85)` | `rgb(var(--md-sys-color-surface-container) / 0.85)` |
| 947 | `rgba(var(--md-sys-color-primary), 0.2)` | `rgb(var(--md-sys-color-primary) / 0.2)` |

**Already correct** (no change needed):
- Line 793: `rgb(var(--md-sys-color-on-surface) / 0.15)` — valid
- Line 906: `rgb(var(--md-sys-color-on-surface) / 0.08)` — valid

---

## TODO 3: Delete dead `tailwind.config.js`
**File:** `tailwind.config.js`

This file is **never loaded** by Tailwind v4's `@tailwindcss/postcss` plugin. Everything it defines (colors, shadows, radii, fonts) is now handled by the `@theme` block in `src/theme.css`. Remove it to avoid confusion.

---

## TODO 4: Build & verify
1. `npm run build` — must succeed
2. Verify built CSS contains `bg-primary`, `text-on-surface`, `bg-surface`, `bg-scrim` classes (search `dist/assets/*.css`)
3. Verify alpha classes work: search for `bg-primary\/50` or `color-mix` in built CSS
4. `npm run build:android` — Capacitor sync must succeed
5. Visual check: body has themed background, no more white screens

---

## Files to modify
- `src/theme.css` — add `@theme` block (TODO 1), fix 5 rgba patterns (TODO 2)
- `tailwind.config.js` — delete (TODO 3)
