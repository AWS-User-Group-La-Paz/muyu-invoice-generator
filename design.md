# Design - Muyu Invoice Generator

A locked design system for this app. Every page redesign reads this file before
emitting code. Do not regenerate per page; amend this file when the system
needs to grow.

## Genre
technical

## Macrostructure family
- App pages: Workbench. Dense app shell, left navigation on desktop, compact top navigation on mobile, page-specific panels in the main work area.
- Content pages: Workbench index. Ledger tables on desktop, stacked records on mobile.

## Theme
- `--color-paper`   oklch(16% 0.018 276)
- `--color-paper-2` oklch(20% 0.020 276)
- `--color-paper-3` oklch(25% 0.020 276)
- `--color-ink`     oklch(94% 0.012 96)
- `--color-ink-2`   oklch(80% 0.020 276)
- `--color-muted`   oklch(63% 0.050 276)
- `--color-rule`    oklch(35% 0.030 276)
- `--color-accent`  oklch(75% 0.135 298)
- `--color-accent-2` oklch(86% 0.115 205)
- `--color-focus`   oklch(86% 0.115 205)

## Typography
- Display: ui-monospace stack, weight 700, style normal
- Body: ui-monospace stack, weight 400
- Mono: ui-monospace stack, weight 400

The app intentionally stays monospace-only because the user asked to keep the
font and the product is a technical invoice workbench.

## Spacing
4-point named scale. Pages use named tokens from `public/css/tokens.css`, never
raw spacing values for new layout.

## Motion
- Easings: `--ease-out`, `--ease-in`, `--ease-in-out`
- Pattern: no page reveal; only button/input state feedback
- Reduced motion: opacity-only or instant, <= 150 ms

## Microinteractions stance
- Silent success when the result is visible.
- Toast/notice only for async outcomes the user cannot otherwise see.
- Focus rings are instant and visible on every interactive element.

## CTA voice
- Primary CTA: solid violet slab, short verb label.
- Secondary CTA: hairline outline, same geometry.

## Per-page allowances
- App pages must not use illustration or decorative media. Function carries the page.
- Past invoices may switch from table to stacked records on mobile.

## What pages MUST share
- Dark surface, monospace type, violet active state, cyan focus/total accents.
- Same sidebar/topbar shell.
- Same button geometry, input height, panel border language.

## What pages MAY differ on
- Panel composition and density.
- Sticky right rail on form-heavy pages.
- Table versus stacked record treatment.

## Exports

### tokens.css
See `public/css/tokens.css`.
