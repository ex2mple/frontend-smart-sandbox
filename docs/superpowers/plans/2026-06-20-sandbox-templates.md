# Sandbox Templates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `tools/sandbox/templates/` with three Angular template folders (`blank`, `example`, `multipage`) that use design tokens, export `routes`, and follow all Angular v20+ rules.

**Architecture:** Each template folder is a self-contained Angular feature with an `__name__.routes.ts` file exporting `Routes`. The `blank` and `example` templates are single-page; `multipage` is a shell with two child pages wired via nested routes. Cross-page transitions use Angular's `withViewTransitions()` (globally configured by the host) plus CSS entry animations per page.

**Tech Stack:** Angular v20+, TypeScript strict mode, Less, Angular Router with View Transitions API.

---

## File Map

### `blank/`
- `__name__.ts` — shell component with `signal` counter, OnPush
- `__name__.html` — centered card with title, muted intro, accent button
- `__name__.less` — token-styled card layout
- `__name__.routes.ts` — `Routes = [{ path: '', component: {{className}} }]`

### `example/`
- `__name__.ts` — component with `input()` step, `signal` count, `computed` doubled
- `__name__.html` — token-styled card showing count, doubled, step input
- `__name__.less` — token-styled
- `__name__.routes.ts` — same shape as blank

### `multipage/`
- `__name__.ts` — shell with `<nav>` + `<router-outlet/>`
- `__name__.html` — header, nav with routerLink/routerLinkActive, router-outlet
- `__name__.less` — shell layout, nav active states with accent token
- `__name__.routes.ts` — shell as parent, two child routes (overview, details)
- `pages/overview/overview.ts` — `{{className}}Overview`, OnPush, signal counter
- `pages/overview/overview.html` — overview page content
- `pages/overview/overview.less` — token-styled card + CSS entry animation
- `pages/details/details.ts` — `{{className}}Details`, OnPush, signal
- `pages/details/details.html` — details page content
- `pages/details/details.less` — token-styled card + CSS entry animation

---

### Task 1: Rewrite `blank/` template

**Files:**
- Modify: `tools/sandbox/templates/blank/__name__.ts`
- Modify: `tools/sandbox/templates/blank/__name__.html`
- Modify: `tools/sandbox/templates/blank/__name__.less`
- Create: `tools/sandbox/templates/blank/__name__.routes.ts`

- [ ] **Step 1: Rewrite `blank/__name__.ts`**

```typescript
import { ChangeDetectionStrategy, Component, signal } from '@angular/core';

@Component({
  selector: '{{selector}}',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './{{name}}.html',
  styleUrl: './{{name}}.less',
})
export class {{className}} {
  protected readonly count = signal(0);

  protected increment(): void {
    this.count.update((n) => n + 1);
  }
}
```

- [ ] **Step 2: Rewrite `blank/__name__.html`**

```html
<main class="sb-card">
  <h1>{{title}}</h1>
  <p class="sb-muted">Start building your Angular component here.</p>
  <button type="button" class="sb-btn" (click)="increment()">
    Count: {{ count() }}
  </button>
</main>
```

- [ ] **Step 3: Rewrite `blank/__name__.less`**

```less
:host {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100%;
  padding: var(--sb-space-8);
  background: var(--sb-bg);
  font-family: var(--sb-font-sans);
}

.sb-card {
  background: var(--sb-surface);
  border: 1px solid var(--sb-border);
  border-radius: var(--sb-radius);
  box-shadow: var(--sb-shadow);
  padding: var(--sb-space-8);
  max-width: 28rem;
  width: 100%;
  text-align: center;

  h1 {
    font-size: 1.75rem;
    font-weight: 700;
    color: var(--sb-text);
    margin-bottom: var(--sb-space-3);
  }
}

.sb-muted {
  color: var(--sb-text-muted);
  margin-bottom: var(--sb-space-6);
}

.sb-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--sb-space-2);
  padding: var(--sb-space-3) var(--sb-space-6);
  background: var(--sb-accent);
  color: var(--sb-accent-contrast);
  border: none;
  border-radius: var(--sb-radius-sm);
  font-family: var(--sb-font-sans);
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;

  &:hover {
    background: var(--sb-accent-hover);
  }

  &:focus-visible {
    outline: none;
    box-shadow: var(--sb-ring);
  }
}
```

- [ ] **Step 4: Create `blank/__name__.routes.ts`**

```typescript
import { Routes } from '@angular/router';
import { {{className}} } from './{{name}}';

export const routes: Routes = [{ path: '', component: {{className}} }];
```

---

### Task 2: Rewrite `example/` template

**Files:**
- Modify: `tools/sandbox/templates/example/__name__.ts`
- Modify: `tools/sandbox/templates/example/__name__.html`
- Modify: `tools/sandbox/templates/example/__name__.less`
- Create: `tools/sandbox/templates/example/__name__.routes.ts`

- [ ] **Step 1: Rewrite `example/__name__.ts`**

```typescript
import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';

@Component({
  selector: '{{selector}}',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './{{name}}.html',
  styleUrl: './{{name}}.less',
})
export class {{className}} {
  readonly step = input(1);
  protected readonly count = signal(0);
  protected readonly doubled = computed(() => this.count() * 2);

  protected increment(): void {
    this.count.update((n) => n + this.step());
  }

  protected reset(): void {
    this.count.set(0);
  }
}
```

- [ ] **Step 2: Rewrite `example/__name__.html`**

```html
<main class="sb-card">
  <h1>{{title}}</h1>
  <p class="sb-muted">An example sandbox showing signals, computed values, and inputs.</p>

  <dl class="sb-stats">
    <div class="sb-stat">
      <dt>Count</dt>
      <dd>{{ count() }}</dd>
    </div>
    <div class="sb-stat">
      <dt>Doubled</dt>
      <dd>{{ doubled() }}</dd>
    </div>
    <div class="sb-stat">
      <dt>Step</dt>
      <dd>{{ step() }}</dd>
    </div>
  </dl>

  <div class="sb-actions">
    <button type="button" class="sb-btn" (click)="increment()">
      + Increment by {{ step() }}
    </button>
    <button type="button" class="sb-btn sb-btn--secondary" (click)="reset()">
      Reset
    </button>
  </div>
</main>
```

- [ ] **Step 3: Rewrite `example/__name__.less`**

```less
:host {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100%;
  padding: var(--sb-space-8);
  background: var(--sb-bg);
  font-family: var(--sb-font-sans);
}

.sb-card {
  background: var(--sb-surface);
  border: 1px solid var(--sb-border);
  border-radius: var(--sb-radius);
  box-shadow: var(--sb-shadow);
  padding: var(--sb-space-8);
  max-width: 32rem;
  width: 100%;
  text-align: center;

  h1 {
    font-size: 1.75rem;
    font-weight: 700;
    color: var(--sb-text);
    margin-bottom: var(--sb-space-3);
  }
}

.sb-muted {
  color: var(--sb-text-muted);
  margin-bottom: var(--sb-space-6);
}

.sb-stats {
  display: flex;
  gap: var(--sb-space-4);
  justify-content: center;
  margin-bottom: var(--sb-space-6);
}

.sb-stat {
  background: var(--sb-surface-2);
  border: 1px solid var(--sb-border);
  border-radius: var(--sb-radius-sm);
  padding: var(--sb-space-4) var(--sb-space-6);
  min-width: 5rem;

  dt {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--sb-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: var(--sb-space-1);
  }

  dd {
    font-size: 2rem;
    font-weight: 700;
    color: var(--sb-accent);
    margin: 0;
  }
}

.sb-actions {
  display: flex;
  gap: var(--sb-space-3);
  justify-content: center;
  flex-wrap: wrap;
}

.sb-btn {
  display: inline-flex;
  align-items: center;
  padding: var(--sb-space-3) var(--sb-space-6);
  background: var(--sb-accent);
  color: var(--sb-accent-contrast);
  border: none;
  border-radius: var(--sb-radius-sm);
  font-family: var(--sb-font-sans);
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;

  &:hover {
    background: var(--sb-accent-hover);
  }

  &:focus-visible {
    outline: none;
    box-shadow: var(--sb-ring);
  }

  &--secondary {
    background: var(--sb-surface-2);
    color: var(--sb-text);
    border: 1px solid var(--sb-border);

    &:hover {
      background: var(--sb-border);
    }
  }
}
```

- [ ] **Step 4: Create `example/__name__.routes.ts`**

```typescript
import { Routes } from '@angular/router';
import { {{className}} } from './{{name}}';

export const routes: Routes = [{ path: '', component: {{className}} }];
```

---

### Task 3: Create `multipage/` — shell component

**Files:**
- Create: `tools/sandbox/templates/multipage/__name__.ts`
- Create: `tools/sandbox/templates/multipage/__name__.html`
- Create: `tools/sandbox/templates/multipage/__name__.less`

- [ ] **Step 1: Create `multipage/__name__.ts`**

```typescript
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

@Component({
  selector: '{{selector}}',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './{{name}}.html',
  styleUrl: './{{name}}.less',
})
export class {{className}} {}
```

- [ ] **Step 2: Create `multipage/__name__.html`**

```html
<!-- Cross-page transitions use Angular's withViewTransitions() configured globally by the host app. No extra template code needed — navigating between pages cross-fades automatically via the browser View Transitions API. -->
<div class="sb-shell">
  <header class="sb-header">
    <span class="sb-header__title">{{title}}</span>
  </header>

  <nav class="sb-nav" aria-label="{{title}} sections">
    <a
      routerLink="overview"
      routerLinkActive="sb-nav__link--active"
      [routerLinkActiveOptions]="{ exact: false }"
      class="sb-nav__link"
    >Overview</a>
    <a
      routerLink="details"
      routerLinkActive="sb-nav__link--active"
      [routerLinkActiveOptions]="{ exact: false }"
      class="sb-nav__link"
    >Details</a>
  </nav>

  <main class="sb-content">
    <router-outlet />
  </main>
</div>
```

- [ ] **Step 3: Create `multipage/__name__.less`**

```less
:host {
  display: block;
  min-height: 100%;
  background: var(--sb-bg);
  font-family: var(--sb-font-sans);
}

.sb-shell {
  display: grid;
  grid-template-rows: auto auto 1fr;
  min-height: 100%;
}

.sb-header {
  padding: var(--sb-space-4) var(--sb-space-6);
  background: var(--sb-surface);
  border-bottom: 1px solid var(--sb-border);

  &__title {
    font-size: 1.125rem;
    font-weight: 700;
    color: var(--sb-text);
  }
}

.sb-nav {
  display: flex;
  gap: var(--sb-space-1);
  padding: var(--sb-space-2) var(--sb-space-4);
  background: var(--sb-surface);
  border-bottom: 1px solid var(--sb-border);

  &__link {
    display: inline-flex;
    align-items: center;
    padding: var(--sb-space-2) var(--sb-space-4);
    border-radius: var(--sb-radius-sm);
    text-decoration: none;
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--sb-text-muted);
    transition: color 0.15s, background 0.15s;

    &:hover {
      color: var(--sb-text);
      background: var(--sb-surface-2);
    }

    &:focus-visible {
      outline: none;
      box-shadow: var(--sb-ring);
    }

    &--active {
      color: var(--sb-accent);
      background: var(--sb-surface-2);
      font-weight: 600;
    }
  }
}

.sb-content {
  padding: var(--sb-space-8);
}
```

---

### Task 4: Create `multipage/` — overview page

**Files:**
- Create: `tools/sandbox/templates/multipage/pages/overview/overview.ts`
- Create: `tools/sandbox/templates/multipage/pages/overview/overview.html`
- Create: `tools/sandbox/templates/multipage/pages/overview/overview.less`

- [ ] **Step 1: Create `pages/overview/overview.ts`**

```typescript
import { ChangeDetectionStrategy, Component, signal } from '@angular/core';

@Component({
  selector: '{{selector}}-overview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './overview.html',
  styleUrl: './overview.less',
})
export class {{className}}Overview {
  protected readonly visits = signal(0);

  protected recordVisit(): void {
    this.visits.update((n) => n + 1);
  }
}
```

- [ ] **Step 2: Create `pages/overview/overview.html`**

```html
<article class="sb-page">
  <header class="sb-page__header sb-page__header--overview">
    <div class="sb-page__icon" aria-hidden="true">&#127968;</div>
    <h2>Overview</h2>
  </header>
  <p class="sb-page__body">
    Welcome to the <strong>{{title}}</strong> sandbox. This is the overview page.
    Use the navigation above to switch between pages and observe the cross-page
    transition powered by Angular's View Transitions API.
  </p>
  <div class="sb-page__footer">
    <button type="button" class="sb-btn" (click)="recordVisit()">
      Record visit ({{ visits() }})
    </button>
  </div>
</article>
```

- [ ] **Step 3: Create `pages/overview/overview.less`**

```less
@keyframes sb-page-in {
  from {
    opacity: 0;
    transform: translateY(0.5rem);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

:host {
  display: block;
  animation: sb-page-in 0.25s ease-out both;
}

.sb-page {
  background: var(--sb-surface);
  border: 1px solid var(--sb-border);
  border-radius: var(--sb-radius);
  box-shadow: var(--sb-shadow);
  max-width: 36rem;
  overflow: hidden;

  &__header {
    display: flex;
    align-items: center;
    gap: var(--sb-space-3);
    padding: var(--sb-space-6);
    background: var(--sb-surface-2);
    border-bottom: 1px solid var(--sb-border);

    h2 {
      font-size: 1.5rem;
      font-weight: 700;
      color: var(--sb-text);
      margin: 0;
    }

    &--overview {
      border-left: 4px solid var(--sb-accent);
    }
  }

  &__icon {
    font-size: 2rem;
    line-height: 1;
  }

  &__body {
    padding: var(--sb-space-6);
    color: var(--sb-text);
    line-height: 1.6;
    margin: 0;
  }

  &__footer {
    padding: var(--sb-space-4) var(--sb-space-6);
    border-top: 1px solid var(--sb-border);
    background: var(--sb-surface-2);
  }
}

.sb-btn {
  display: inline-flex;
  align-items: center;
  padding: var(--sb-space-2) var(--sb-space-4);
  background: var(--sb-accent);
  color: var(--sb-accent-contrast);
  border: none;
  border-radius: var(--sb-radius-sm);
  font-family: var(--sb-font-sans);
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;

  &:hover {
    background: var(--sb-accent-hover);
  }

  &:focus-visible {
    outline: none;
    box-shadow: var(--sb-ring);
  }
}
```

---

### Task 5: Create `multipage/` — details page

**Files:**
- Create: `tools/sandbox/templates/multipage/pages/details/details.ts`
- Create: `tools/sandbox/templates/multipage/pages/details/details.html`
- Create: `tools/sandbox/templates/multipage/pages/details/details.less`

- [ ] **Step 1: Create `pages/details/details.ts`**

```typescript
import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';

@Component({
  selector: '{{selector}}-details',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './details.html',
  styleUrl: './details.less',
})
export class {{className}}Details {
  protected readonly rating = signal(3);
  protected readonly stars = computed(() =>
    Array.from({ length: 5 }, (_, i) => i < this.rating())
  );

  protected setRating(value: number): void {
    this.rating.set(value);
  }
}
```

- [ ] **Step 2: Create `pages/details/details.html`**

```html
<article class="sb-page">
  <header class="sb-page__header sb-page__header--details">
    <div class="sb-page__icon" aria-hidden="true">&#128203;</div>
    <h2>Details</h2>
  </header>
  <p class="sb-page__body">
    This is the <strong>details page</strong> of the <strong>{{title}}</strong> sandbox.
    It demonstrates distinct content across pages. Navigate back to Overview and
    watch the View Transitions cross-fade.
  </p>
  <div class="sb-page__meta">
    <h3>Rate this sandbox</h3>
    <div class="sb-rating" role="group" aria-label="Rating">
      @for (filled of stars(); track $index) {
        <button
          type="button"
          class="sb-rating__star"
          [class.sb-rating__star--filled]="filled"
          (click)="setRating($index + 1)"
          [attr.aria-label]="'Rate ' + ($index + 1) + ' out of 5'"
          [attr.aria-pressed]="filled"
        >★</button>
      }
    </div>
    <p class="sb-rating__label">{{ rating() }} / 5 stars</p>
  </div>
</article>
```

- [ ] **Step 3: Create `pages/details/details.less`**

```less
@keyframes sb-page-in {
  from {
    opacity: 0;
    transform: translateY(0.5rem);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

:host {
  display: block;
  animation: sb-page-in 0.25s ease-out both;
}

.sb-page {
  background: var(--sb-surface);
  border: 1px solid var(--sb-border);
  border-radius: var(--sb-radius);
  box-shadow: var(--sb-shadow);
  max-width: 36rem;
  overflow: hidden;

  &__header {
    display: flex;
    align-items: center;
    gap: var(--sb-space-3);
    padding: var(--sb-space-6);
    background: var(--sb-surface-2);
    border-bottom: 1px solid var(--sb-border);

    h2 {
      font-size: 1.5rem;
      font-weight: 700;
      color: var(--sb-text);
      margin: 0;
    }

    &--details {
      border-left: 4px solid var(--sb-success);
    }
  }

  &__icon {
    font-size: 2rem;
    line-height: 1;
  }

  &__body {
    padding: var(--sb-space-6);
    color: var(--sb-text);
    line-height: 1.6;
    margin: 0;
  }

  &__meta {
    padding: var(--sb-space-4) var(--sb-space-6) var(--sb-space-6);
    border-top: 1px solid var(--sb-border);

    h3 {
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--sb-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: var(--sb-space-3);
    }
  }
}

.sb-rating {
  display: flex;
  gap: var(--sb-space-1);
  margin-bottom: var(--sb-space-2);

  &__star {
    background: none;
    border: none;
    font-size: 1.75rem;
    cursor: pointer;
    color: var(--sb-border);
    padding: var(--sb-space-1);
    border-radius: var(--sb-radius-sm);
    transition: color 0.1s, transform 0.1s;
    line-height: 1;

    &:hover {
      transform: scale(1.15);
    }

    &:focus-visible {
      outline: none;
      box-shadow: var(--sb-ring);
    }

    &--filled {
      color: var(--sb-accent);
    }
  }

  &__label {
    font-size: 0.875rem;
    color: var(--sb-text-muted);
    margin: 0;
  }
}
```

---

### Task 6: Create `multipage/__name__.routes.ts`

**Files:**
- Create: `tools/sandbox/templates/multipage/__name__.routes.ts`

- [ ] **Step 1: Create routes file**

```typescript
import { Routes } from '@angular/router';
import { {{className}} } from './{{name}}';
import { {{className}}Overview } from './pages/overview/overview';
import { {{className}}Details } from './pages/details/details';

export const routes: Routes = [
  {
    path: '',
    component: {{className}},
    children: [
      { path: '', redirectTo: 'overview', pathMatch: 'full' },
      { path: 'overview', component: {{className}}Overview },
      { path: 'details', component: {{className}}Details },
    ],
  },
];
```

---

## Verification Checklist

- [ ] `blank/__name__.routes.ts` exports `routes`
- [ ] `example/__name__.routes.ts` exports `routes`
- [ ] `multipage/__name__.routes.ts` exports `routes`
- [ ] No `standalone: true` in any `@Component`
- [ ] No class names with `Component` suffix
- [ ] No `*ngIf`, `*ngFor`, `ngClass`, `ngStyle`, `@HostBinding`, `@HostListener`
- [ ] All components have `changeDetection: ChangeDetectionStrategy.OnPush`
- [ ] All styles use `var(--sb-*)` tokens
- [ ] All interactive elements have `:focus-visible` with `box-shadow: var(--sb-ring)`
