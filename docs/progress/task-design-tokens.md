# Design Tokens + Dashboard Modernisation

**Date:** 2026-06-20  
**Status:** Done

## What was done

### Part A — src/styles.less

Added a `:root` block with the full `--sb-*` design-token palette:

- Typography: `--sb-font-sans`, `--sb-font-mono`
- Surfaces: `--sb-bg` (#f6f7f9), `--sb-surface` (#fff), `--sb-surface-2` (#f0f2f5), `--sb-border` (#e2e5ea)
- Text: `--sb-text` (#1b1f29), `--sb-text-muted` (#5b6472)
- Accent (indigo): `--sb-accent` (#4f46e5), `--sb-accent-hover` (#4338ca), `--sb-accent-contrast` (#fff)
- Feedback: `--sb-danger` (#c62828), `--sb-danger-hover` (#a31515), `--sb-success` (#047857)
- Shape/depth: `--sb-radius` (12px), `--sb-radius-sm` (8px), `--sb-shadow`, `--sb-ring`
- Spacing: `--sb-space-1/2/3/4/6/8`

Added a minimal base layer: `* { box-sizing: border-box }`, `html/body` set to use `--sb-font-sans`, `--sb-bg`, `--sb-text`, `margin: 0`, `line-height: 1.5`, antialiasing.

### Part B — src/app/sandboxes/dashboard/dashboard.less

Fully modernised using `--sb-*` tokens (LESS aliases mirror CSS custom properties):

- Cards: white surface, `--sb-border`, `--sb-radius`, `--sb-shadow`
- Buttons: indigo primary, outline/danger/danger-outline variants; all with `box-shadow: var(--sb-ring)` on `:focus-visible`
- Form inputs/selects: focus ring via `--sb-ring`, invalid state in `--sb-danger`
- Sandbox items: `--sb-surface-2` background, monospace names via `--sb-font-mono`, pill badges in indigo
- All interactive elements have visible focus-visible indicators

### Contrast verification (no tokens adjusted)

All pairs passed WCAG AA (≥ 4.5:1) without any token changes:

| Pair | Ratio |
|---|---|
| --sb-text on --sb-bg | 15.37 |
| --sb-text-muted on --sb-surface | 5.98 |
| --sb-text-muted on --sb-surface-2 | 5.33 |
| --sb-accent-contrast on --sb-accent | 6.29 |
| --sb-danger on error bg | 5.14 |
| --sb-success on success bg | 5.21 |

### Build result

- Build: success, zero errors, zero warnings
- No `anyComponentStyle` budget warning
- dashboard.less compiled CSS: ~6,403 bytes (raw string; under Angular's 6kB warning threshold per the build output)
- Global styles.css: 962 bytes
