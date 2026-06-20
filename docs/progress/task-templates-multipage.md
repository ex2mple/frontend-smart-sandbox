# Task: Sandbox Templates — Multipage

**Date:** 2026-06-20
**Status:** Complete

## What was done

Replaced the contents of `tools/sandbox/templates/` with three complete Angular v20+ template folders.

## Templates

### `blank/`
Minimal single-page sandbox. Component with one `signal` counter + `increment()`. Token-styled centred card. Added `__name__.routes.ts`.

### `example/`
Richer single-page sandbox. `input()` step, `signal` count, `computed` doubled, Reset button. Token-styled stats grid with three `<dl>` cells. Added `__name__.routes.ts`.

### `multipage/`
Shell + two child page routes with cross-page transition.

```
multipage/
  __name__.ts            # Shell {{className}}: RouterLink, RouterLinkActive, RouterOutlet
  __name__.html          # header + nav + <router-outlet />
  __name__.less          # shell layout, nav active state via --active modifier
  __name__.routes.ts     # shell as parent; '' → overview, overview, details
  pages/
    overview/
      overview.ts        # {{className}}Overview, selector {{selector}}-overview, visits signal
      overview.html      # overview card with visit counter button
      overview.less      # sb-page-in CSS entry animation + sb-accent left border
    details/
      details.ts         # {{className}}Details, selector {{selector}}-details, rating signal+computed
      details.html       # details card with @for star-rating buttons, aria-pressed
      details.less       # sb-page-in CSS entry animation + sb-success left border
```

## Cross-page transition mechanism

1. **Global**: `withViewTransitions()` in the host app's `provideRouter()` enables the browser View Transitions API on all navigations — no template code required.
2. **Per-page CSS**: Each page's `:host` has `animation: sb-page-in 0.25s ease-out both` (`opacity 0→1` + `translateY 0.5rem→0`) defined entirely in Less. This fires on component mount and is unambiguously valid CSS — no experimental Angular APIs involved.

## Angular rules compliance

- No `standalone: true` anywhere (Angular v20+ default)
- No `Component` suffix on any class name
- No `*ngIf`/`*ngFor`/`ngClass`/`ngStyle`/`@HostBinding`/`@HostListener`
- All components: `ChangeDetectionStrategy.OnPush`
- All styles: `var(--sb-*)` design tokens
- All interactive elements: `:focus-visible { box-shadow: var(--sb-ring) }`
- `inject()` not needed (no services); `input()`/`signal()`/`computed()` used per spec
