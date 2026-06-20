# Sandbox Log Console Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An in-app, closable bottom-dock console (mounted in the sandbox shell) that captures `console.*`, an explicit `SandboxLog` facade, and uncaught errors — each entry showing level/time/source with an expandable stack trace and object inspector.

**Architecture:** A pure, vitest-tested core (`serialize-value`, `parse-stack`, types) feeds a signal-based `LogStore`. A dev-only `installConsoleCapture` monkey-patches `console.*` and adds `window` error listeners; `SandboxLog` is a thin facade over the store. The `SandboxConsole` component reads the store signal and renders a filterable dock with a recursive `LogValueTree` inspector. All dev-only via `isDevMode()`.

**Tech Stack:** Angular v21 (standalone, signals, OnPush), TypeScript strict, vitest (pure-core tests), LESS design tokens (`--sb-*`).

---

## File Structure

All new code under `src/app/sandboxes/devtools/`:

- `log-entry.ts` — shared types (`LogLevel`, `LogOrigin`, `StackFrame`, `LogValue`, `LogEntry`). No Angular deps.
- `serialize-value.ts` — pure `serializeValue()` snapshotting any value into a `LogValue` tree.
- `serialize-value.spec.ts` — vitest.
- `parse-stack.ts` — pure `parseStack()` + `pickSource()`.
- `parse-stack.spec.ts` — vitest.
- `log-store.ts` — `LogStore` service (signal ring buffer).
- `console-capture.ts` — `installConsoleCapture()` + shared `buildEntry()`.
- `sandbox-log.ts` — `SandboxLog` service + `ScopedLog`.
- `log-value-tree.ts` — recursive inspector component (inline template).
- `sandbox-console.ts` / `.html` / `.less` — the dock component.

Modified:
- `package.json` — add `test:devtools` script.
- `src/app/app.config.ts` — install capture via `provideAppInitializer` (dev-only).
- `src/app/sandboxes/shell/sandbox-shell.ts` — mount `<app-sandbox-console>` under a dev guard.

**Note (deviation from spec, intentional):** No custom `ErrorHandler` is added. Angular's default error handler already routes to `console.error`, which our patch captures; truly uncaught/async errors are captured by `window` `error`/`unhandledrejection` listeners. This avoids duplicate entries and less code.

---

## Zone A — Pure core (must land first)

### Task 1: Types + test script

**Files:**
- Create: `src/app/sandboxes/devtools/log-entry.ts`
- Modify: `package.json`

- [ ] **Step 1: Create the types file**

```ts
// src/app/sandboxes/devtools/log-entry.ts

/** Severity of a captured log line. */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** Where a log entry came from. */
export type LogOrigin = 'console' | 'logger' | 'error';

/** A single parsed stack frame. */
export interface StackFrame {
  fn: string;
  file: string;
  line: number;
  col: number;
  /** Original unparsed line, kept for display fallback. */
  raw: string;
}

/** A serialized snapshot of one logged value (taken at log time). */
export type LogValue =
  | { kind: 'primitive'; display: string }
  | { kind: 'string'; display: string }
  | { kind: 'function'; display: string }
  | { kind: 'error'; display: string }
  | { kind: 'special'; display: string }
  | { kind: 'array'; display: string; items: LogValue[]; truncated: boolean }
  | {
      kind: 'object';
      display: string;
      entries: Array<{ key: string; value: LogValue }>;
      truncated: boolean;
    };

/** One line in the console. */
export interface LogEntry {
  id: number;
  level: LogLevel;
  /** epoch ms */
  time: number;
  /** human source label, e.g. "Increment.increment (blank/x.ts:14)" */
  source: string;
  frames: StackFrame[];
  values: LogValue[];
  origin: LogOrigin;
}
```

- [ ] **Step 2: Add the test script to package.json**

In `package.json` `scripts`, add after `"test:codegen"`:

```json
    "test:devtools": "vitest run src/app/sandboxes/devtools"
```

- [ ] **Step 3: Verify typecheck**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: no output (success).

- [ ] **Step 4: Commit**

```bash
git add src/app/sandboxes/devtools/log-entry.ts package.json
git commit -m "feat(devtools): log console types + test script"
```

---

### Task 2: serialize-value

**Files:**
- Create: `src/app/sandboxes/devtools/serialize-value.ts`
- Test: `src/app/sandboxes/devtools/serialize-value.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/app/sandboxes/devtools/serialize-value.spec.ts
import { describe, it, expect } from 'vitest';
import { serializeValue } from './serialize-value';

describe('serializeValue', () => {
  it('handles primitives', () => {
    expect(serializeValue(42)).toEqual({ kind: 'primitive', display: '42' });
    expect(serializeValue(true)).toEqual({ kind: 'primitive', display: 'true' });
    expect(serializeValue(null)).toEqual({ kind: 'primitive', display: 'null' });
    expect(serializeValue(undefined)).toEqual({ kind: 'primitive', display: 'undefined' });
    expect(serializeValue(10n)).toEqual({ kind: 'primitive', display: '10n' });
  });

  it('handles strings distinctly', () => {
    expect(serializeValue('hi')).toEqual({ kind: 'string', display: 'hi' });
  });

  it('serializes a nested object', () => {
    const r = serializeValue({ a: 1, b: { c: 'x' } });
    expect(r.kind).toBe('object');
    if (r.kind !== 'object') throw new Error('not object');
    expect(r.entries[0]).toEqual({ key: 'a', value: { kind: 'primitive', display: '1' } });
    expect(r.entries[1].value.kind).toBe('object');
  });

  it('serializes arrays', () => {
    const r = serializeValue([1, 'a']);
    expect(r.kind).toBe('array');
    if (r.kind !== 'array') throw new Error('not array');
    expect(r.display).toBe('Array(2)');
    expect(r.items).toHaveLength(2);
  });

  it('detects cycles', () => {
    const o: Record<string, unknown> = { a: 1 };
    o['self'] = o;
    const r = serializeValue(o);
    if (r.kind !== 'object') throw new Error('not object');
    const self = r.entries.find((e) => e.key === 'self');
    expect(self?.value).toEqual({ kind: 'special', display: '[Circular]' });
  });

  it('respects maxDepth', () => {
    const r = serializeValue({ a: { b: { c: { d: { e: 1 } } } } }, { maxDepth: 2 });
    // a -> object, a.b -> object, a.b.c -> capped special
    if (r.kind !== 'object') throw new Error('not object');
    const a = r.entries[0].value;
    if (a.kind !== 'object') throw new Error('a not object');
    const b = a.entries[0].value;
    expect(b.kind).toBe('special');
  });

  it('handles Date, Error, Map, Set, function', () => {
    expect(serializeValue(new Date('2020-01-01T00:00:00.000Z'))).toEqual({
      kind: 'special',
      display: '2020-01-01T00:00:00.000Z',
    });
    expect(serializeValue(new Error('boom'))).toEqual({ kind: 'error', display: 'Error: boom' });
    const m = serializeValue(new Map([['k', 1]]));
    expect(m.kind).toBe('object');
    const s = serializeValue(new Set([1, 2]));
    expect(s.kind).toBe('array');
    const f = serializeValue(function foo() {});
    expect(f).toEqual({ kind: 'function', display: 'ƒ foo' });
  });

  it('never throws on a throwing getter', () => {
    const o = {
      get bad(): never {
        throw new Error('nope');
      },
    };
    expect(() => serializeValue(o)).not.toThrow();
    const r = serializeValue(o);
    if (r.kind !== 'object') throw new Error('not object');
    expect(r.entries[0].value.kind).toBe('string');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/sandboxes/devtools/serialize-value.spec.ts`
Expected: FAIL — cannot find module `./serialize-value`.

- [ ] **Step 3: Write the implementation**

```ts
// src/app/sandboxes/devtools/serialize-value.ts
import { LogValue } from './log-entry';

export interface SerializeOpts {
  maxDepth?: number;
  maxKeys?: number;
  maxItems?: number;
}

const DEFAULTS: Required<SerializeOpts> = { maxDepth: 4, maxKeys: 100, maxItems: 100 };

/** Snapshot any value into a LogValue tree. Never throws. */
export function serializeValue(value: unknown, opts: SerializeOpts = {}): LogValue {
  return walk(value, 0, new WeakSet<object>(), { ...DEFAULTS, ...opts });
}

function walk(
  value: unknown,
  depth: number,
  seen: WeakSet<object>,
  o: Required<SerializeOpts>,
): LogValue {
  try {
    if (value === null) return { kind: 'primitive', display: 'null' };
    const t = typeof value;
    if (t === 'undefined') return { kind: 'primitive', display: 'undefined' };
    if (t === 'string') return { kind: 'string', display: value as string };
    if (t === 'number' || t === 'boolean') return { kind: 'primitive', display: String(value) };
    if (t === 'bigint') return { kind: 'primitive', display: `${String(value)}n` };
    if (t === 'symbol') return { kind: 'primitive', display: (value as symbol).toString() };
    if (t === 'function') {
      const fn = value as { name?: string };
      return { kind: 'function', display: `ƒ ${fn.name || '(anonymous)'}` };
    }

    const obj = value as object;
    if (seen.has(obj)) return { kind: 'special', display: '[Circular]' };
    if (value instanceof Date) return { kind: 'special', display: value.toISOString() };
    if (value instanceof Error) return { kind: 'error', display: `${value.name}: ${value.message}` };
    if (isDomNode(value)) return { kind: 'special', display: domLabel(value) };

    if (depth >= o.maxDepth) {
      return {
        kind: 'special',
        display: Array.isArray(value) ? `Array(${(value as unknown[]).length})` : '{…}',
      };
    }

    seen.add(obj);
    try {
      if (value instanceof Map) {
        const entries = [...value.entries()]
          .slice(0, o.maxKeys)
          .map(([k, v]) => ({ key: String(k), value: walk(v, depth + 1, seen, o) }));
        return { kind: 'object', display: `Map(${value.size})`, entries, truncated: value.size > o.maxKeys };
      }
      if (value instanceof Set) {
        const items = [...value.values()].slice(0, o.maxItems).map((v) => walk(v, depth + 1, seen, o));
        return { kind: 'array', display: `Set(${value.size})`, items, truncated: value.size > o.maxItems };
      }
      if (Array.isArray(value)) {
        const items = value.slice(0, o.maxItems).map((v) => walk(v, depth + 1, seen, o));
        return { kind: 'array', display: `Array(${value.length})`, items, truncated: value.length > o.maxItems };
      }
      const rec = value as Record<string, unknown>;
      const keys = Object.keys(rec);
      const entries = keys.slice(0, o.maxKeys).map((key) => ({
        key,
        value: walk(safeGet(rec, key), depth + 1, seen, o),
      }));
      const ctor = (obj as { constructor?: { name?: string } }).constructor?.name;
      const display = ctor && ctor !== 'Object' ? ctor : '{…}';
      return { kind: 'object', display, entries, truncated: keys.length > o.maxKeys };
    } finally {
      seen.delete(obj);
    }
  } catch {
    return { kind: 'special', display: safeString(value) };
  }
}

function safeGet(obj: Record<string, unknown>, key: string): unknown {
  try {
    return obj[key];
  } catch (e) {
    return `[getter threw: ${(e as Error)?.message ?? 'error'}]`;
  }
}

function safeString(v: unknown): string {
  try {
    return String(v);
  } catch {
    return '[unserializable]';
  }
}

function isDomNode(v: unknown): boolean {
  return typeof Node !== 'undefined' && v instanceof Node;
}

function domLabel(v: unknown): string {
  const el = v as { nodeName?: string };
  return `<${(el.nodeName ?? 'node').toLowerCase()}>`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/sandboxes/devtools/serialize-value.spec.ts`
Expected: PASS (all assertions).

- [ ] **Step 5: Commit**

```bash
git add src/app/sandboxes/devtools/serialize-value.ts src/app/sandboxes/devtools/serialize-value.spec.ts
git commit -m "feat(devtools): serializeValue snapshot serializer"
```

---

### Task 3: parse-stack

**Files:**
- Create: `src/app/sandboxes/devtools/parse-stack.ts`
- Test: `src/app/sandboxes/devtools/parse-stack.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/app/sandboxes/devtools/parse-stack.spec.ts
import { describe, it, expect } from 'vitest';
import { parseStack, pickSource } from './parse-stack';

describe('parseStack', () => {
  it('parses V8 frames with a function name', () => {
    const stack = [
      'Error',
      '    at Foo.bar (http://localhost:4200/src/app/x.ts:14:7)',
      '    at http://localhost:4200/src/app/y.ts:3:1',
    ].join('\n');
    const frames = parseStack(stack);
    expect(frames[0]).toMatchObject({ fn: 'Foo.bar', line: 14, col: 7 });
    expect(frames[0].file).toContain('x.ts');
    expect(frames[1]).toMatchObject({ fn: '(anonymous)', line: 3, col: 1 });
  });

  it('parses Firefox/Safari frames', () => {
    const stack = ['bar@http://localhost:4200/src/app/x.ts:14:7', '@http://localhost:4200/y.ts:1:1'].join('\n');
    const frames = parseStack(stack);
    expect(frames[0]).toMatchObject({ fn: 'bar', line: 14, col: 7 });
    expect(frames[1].fn).toBe('(anonymous)');
  });

  it('returns [] for undefined', () => {
    expect(parseStack(undefined)).toEqual([]);
  });
});

describe('pickSource', () => {
  it('skips internal frames and formats app frame', () => {
    const frames = parseStack(
      [
        'Error',
        '    at buildEntry (http://localhost:4200/src/app/sandboxes/devtools/console-capture.ts:50:5)',
        '    at zone.js (http://localhost:4200/node_modules/zone.js/x.js:1:1)',
        '    at Counter.increment (http://localhost:4200/src/app/sandboxes/generated/test/test.ts:14:7)',
      ].join('\n'),
    );
    expect(pickSource(frames)).toBe('Counter.increment (test/test.ts:14)');
  });

  it('falls back to first frame when no app frame', () => {
    expect(pickSource([])).toBe('(unknown)');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/sandboxes/devtools/parse-stack.spec.ts`
Expected: FAIL — cannot find module `./parse-stack`.

- [ ] **Step 3: Write the implementation**

```ts
// src/app/sandboxes/devtools/parse-stack.ts
import { StackFrame } from './log-entry';

/** Parse a V8 or SpiderMonkey/JSC stack string into frames. Tolerant of unknown lines. */
export function parseStack(stack: string | undefined): StackFrame[] {
  if (!stack) return [];
  const frames: StackFrame[] = [];
  for (const rawLine of stack.split('\n')) {
    const line = rawLine.trim();
    if (!line || line === 'Error' || line.startsWith('Error:')) continue;
    const frame = parseV8(line) ?? parseSpider(line);
    if (frame) frames.push(frame);
    else if (line.startsWith('at '))
      frames.push({ fn: '(unknown)', file: '', line: 0, col: 0, raw: line });
  }
  return frames;
}

function parseV8(line: string): StackFrame | null {
  if (!line.startsWith('at ')) return null;
  const body = line.slice(3).trim();
  const m = body.match(/^(.*?)\s+\((.*):(\d+):(\d+)\)$/);
  if (m) return { fn: m[1], file: m[2], line: +m[3], col: +m[4], raw: line };
  const m2 = body.match(/^(.*):(\d+):(\d+)$/);
  if (m2) return { fn: '(anonymous)', file: m2[1], line: +m2[2], col: +m2[3], raw: line };
  return null;
}

function parseSpider(line: string): StackFrame | null {
  const m = line.match(/^(.*?)@(.*):(\d+):(\d+)$/);
  if (m) return { fn: m[1] || '(anonymous)', file: m[2], line: +m[3], col: +m[4], raw: line };
  return null;
}

const INTERNAL_RE = /node_modules|zone\.js|polyfills|console-capture|sandbox-log|@angular|vendor/;

/** Pick the first application frame and format it as a short source label. */
export function pickSource(frames: StackFrame[]): string {
  const app = frames.find((f) => f.file && !INTERNAL_RE.test(f.file) && !INTERNAL_RE.test(f.fn));
  const f = app ?? frames[0];
  if (!f) return '(unknown)';
  const file = shortFile(f.file);
  const fn = f.fn && f.fn !== '(anonymous)' && f.fn !== '(unknown)' ? f.fn : '';
  return fn ? `${fn} (${file}:${f.line})` : `${file}:${f.line}`;
}

function shortFile(file: string): string {
  if (!file) return '(unknown)';
  const clean = file.split('?')[0];
  return clean.split('/').slice(-2).join('/');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/sandboxes/devtools/parse-stack.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/sandboxes/devtools/parse-stack.ts src/app/sandboxes/devtools/parse-stack.spec.ts
git commit -m "feat(devtools): stack parser + source picker"
```

---

## Zone B — Services & wiring (depends on Zone A)

### Task 4: LogStore

**Files:**
- Create: `src/app/sandboxes/devtools/log-store.ts`

- [ ] **Step 1: Write the service**

```ts
// src/app/sandboxes/devtools/log-store.ts
import { Injectable, signal } from '@angular/core';
import { LogEntry } from './log-entry';

/** Max retained entries; oldest are dropped beyond this. */
const CAP = 1000;

@Injectable({ providedIn: 'root' })
export class LogStore {
  private readonly _entries = signal<readonly LogEntry[]>([]);
  readonly entries = this._entries.asReadonly();
  private nextId = 1;

  add(entry: Omit<LogEntry, 'id'>): void {
    const full: LogEntry = { ...entry, id: this.nextId++ };
    this._entries.update((list) => {
      const next = list.length >= CAP ? list.slice(list.length - CAP + 1) : list.slice();
      next.push(full);
      return next;
    });
  }

  clear(): void {
    this._entries.set([]);
  }
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/app/sandboxes/devtools/log-store.ts
git commit -m "feat(devtools): LogStore signal ring buffer"
```

---

### Task 5: console-capture + buildEntry

**Files:**
- Create: `src/app/sandboxes/devtools/console-capture.ts`

- [ ] **Step 1: Write the module**

```ts
// src/app/sandboxes/devtools/console-capture.ts
import { LogEntry, LogLevel, LogOrigin } from './log-entry';
import { LogStore } from './log-store';
import { parseStack, pickSource } from './parse-stack';
import { serializeValue } from './serialize-value';

const SENTINEL = '__sandboxConsolePatched__';

const METHODS: Array<{ method: 'debug' | 'info' | 'log' | 'warn' | 'error'; level: LogLevel }> = [
  { method: 'debug', level: 'debug' },
  { method: 'info', level: 'info' },
  { method: 'log', level: 'info' },
  { method: 'warn', level: 'warn' },
  { method: 'error', level: 'error' },
];

/** Build a store-ready entry from raw args. Captures the current stack. */
export function buildEntry(
  level: LogLevel,
  origin: LogOrigin,
  args: unknown[],
  scope?: string,
): Omit<LogEntry, 'id'> {
  const frames = parseStack(new Error().stack);
  const source = pickSource(frames);
  return {
    level,
    origin,
    time: Date.now(),
    source: scope ? `${scope} · ${source}` : source,
    frames,
    values: args.map((a) => serializeValue(a)),
  };
}

/**
 * Patch console.* and window error events to feed the store.
 * Dev-only, idempotent across HMR. Returns an uninstall fn.
 */
export function installConsoleCapture(store: LogStore): () => void {
  const c = console as unknown as Record<string, unknown>;
  if (c[SENTINEL]) return () => {};

  let capturing = false;
  const originals = new Map<string, (...a: unknown[]) => void>();
  const con = console as unknown as Record<string, (...a: unknown[]) => void>;

  for (const { method, level } of METHODS) {
    const original = con[method].bind(console);
    originals.set(method, original);
    con[method] = (...args: unknown[]) => {
      original(...args);
      if (capturing) return;
      capturing = true;
      try {
        store.add(buildEntry(level, 'console', args));
      } catch {
        /* never break console */
      } finally {
        capturing = false;
      }
    };
  }

  const onError = (event: ErrorEvent) => {
    try {
      store.add(buildEntry('error', 'error', [event.error ?? event.message]));
    } catch {
      /* ignore */
    }
  };
  const onRejection = (event: PromiseRejectionEvent) => {
    try {
      store.add(buildEntry('error', 'error', [event.reason]));
    } catch {
      /* ignore */
    }
  };
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);

  c[SENTINEL] = true;
  return () => {
    for (const { method } of METHODS) con[method] = originals.get(method)!;
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
    delete c[SENTINEL];
  };
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/app/sandboxes/devtools/console-capture.ts
git commit -m "feat(devtools): console + window error capture"
```

---

### Task 6: SandboxLog facade

**Files:**
- Create: `src/app/sandboxes/devtools/sandbox-log.ts`

- [ ] **Step 1: Write the service**

```ts
// src/app/sandboxes/devtools/sandbox-log.ts
import { Injectable, inject } from '@angular/core';
import { LogLevel } from './log-entry';
import { LogStore } from './log-store';
import { buildEntry } from './console-capture';

/** A logger bound to a scope label. */
export class ScopedLog {
  constructor(
    private readonly store: LogStore,
    private readonly label: string,
  ) {}

  debug(...a: unknown[]): void {
    this.store.add(buildEntry('debug', 'logger', a, this.label));
  }
  info(...a: unknown[]): void {
    this.store.add(buildEntry('info', 'logger', a, this.label));
  }
  warn(...a: unknown[]): void {
    this.store.add(buildEntry('warn', 'logger', a, this.label));
  }
  error(...a: unknown[]): void {
    this.store.add(buildEntry('error', 'logger', a, this.label));
  }
}

/** Explicit, context-aware logger that feeds the in-app console. */
@Injectable({ providedIn: 'root' })
export class SandboxLog {
  private readonly store = inject(LogStore);

  private emit(level: LogLevel, args: unknown[]): void {
    this.store.add(buildEntry(level, 'logger', args));
  }

  debug(...a: unknown[]): void {
    this.emit('debug', a);
  }
  info(...a: unknown[]): void {
    this.emit('info', a);
  }
  warn(...a: unknown[]): void {
    this.emit('warn', a);
  }
  error(...a: unknown[]): void {
    this.emit('error', a);
  }

  /** Returns a logger whose entries are prefixed with `label`. */
  scope(label: string): ScopedLog {
    return new ScopedLog(this.store, label);
  }
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/app/sandboxes/devtools/sandbox-log.ts
git commit -m "feat(devtools): SandboxLog facade with scopes"
```

---

### Task 7: Wire capture into bootstrap (dev-only)

**Files:**
- Modify: `src/app/app.config.ts`

- [ ] **Step 1: Update app.config.ts**

Replace the whole file with:

```ts
// src/app/app.config.ts
import {
  ApplicationConfig,
  inject,
  isDevMode,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter, withViewTransitions } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { routes } from './app.routes';
import { LogStore } from './sandboxes/devtools/log-store';
import { installConsoleCapture } from './sandboxes/devtools/console-capture';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withViewTransitions()),
    provideHttpClient(),
    provideAppInitializer(() => {
      if (isDevMode()) {
        installConsoleCapture(inject(LogStore));
      }
    }),
  ],
};
```

- [ ] **Step 2: Verify build**

Run: `npx ng build --configuration development`
Expected: "Application bundle generation complete."

- [ ] **Step 3: Commit**

```bash
git add src/app/app.config.ts
git commit -m "feat(devtools): install console capture at bootstrap (dev-only)"
```

---

## Zone C — UI (depends on Zone A types + LogStore API from Zone B)

### Task 8: LogValueTree inspector

**Files:**
- Create: `src/app/sandboxes/devtools/log-value-tree.ts`

- [ ] **Step 1: Write the component**

```ts
// src/app/sandboxes/devtools/log-value-tree.ts
import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { LogValue } from './log-entry';

@Component({
  selector: 'app-log-value-tree',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let v = value();
    @if (v.kind === 'array' || v.kind === 'object') {
      <button
        type="button"
        class="lvt-toggle"
        (click)="open.set(!open())"
        [attr.aria-expanded]="open()"
      >
        <span class="lvt-caret" aria-hidden="true">{{ open() ? '▾' : '▸' }}</span>
        {{ v.display }}
      </button>
      @if (open()) {
        <ul class="lvt-children" role="group">
          @if (v.kind === 'array') {
            @for (item of v.items; track $index) {
              <li class="lvt-row">
                <span class="lvt-key">{{ $index }}:</span>
                <app-log-value-tree [value]="item" />
              </li>
            }
          } @else {
            @for (entry of v.entries; track entry.key) {
              <li class="lvt-row">
                <span class="lvt-key">{{ entry.key }}:</span>
                <app-log-value-tree [value]="entry.value" />
              </li>
            }
          }
          @if (v.truncated) {
            <li class="lvt-row lvt-more">…(truncated)</li>
          }
        </ul>
      }
    } @else {
      <span class="lvt-leaf" [class]="'lvt-leaf--' + v.kind">{{ v.display }}</span>
    }
  `,
  styles: `
    :host {
      display: inline;
      font-family: var(--sb-font-mono);
      font-size: 0.8125rem;
    }
    .lvt-toggle {
      border: none;
      background: none;
      padding: 0;
      font: inherit;
      color: var(--sb-text);
      cursor: pointer;
    }
    .lvt-toggle:focus-visible {
      outline: none;
      box-shadow: var(--sb-ring);
      border-radius: 2px;
    }
    .lvt-caret {
      display: inline-block;
      width: 1em;
      color: var(--sb-text-muted);
    }
    .lvt-children {
      list-style: none;
      margin: 0;
      padding-left: 1.1em;
    }
    .lvt-key {
      color: var(--sb-text-muted);
      margin-right: 0.4em;
    }
    .lvt-leaf--string {
      color: var(--sb-success);
    }
    .lvt-leaf--error {
      color: var(--sb-danger);
    }
    .lvt-more {
      color: var(--sb-text-muted);
    }
  `,
})
export class LogValueTree {
  readonly value = input.required<LogValue>();
  protected readonly open = signal(false);
  // computed kept for potential future auto-open heuristics
  protected readonly expandable = computed(() => {
    const v = this.value();
    return v.kind === 'array' || v.kind === 'object';
  });
}
```

- [ ] **Step 2: Verify build**

Run: `npx ng build --configuration development`
Expected: "Application bundle generation complete."

- [ ] **Step 3: Commit**

```bash
git add src/app/sandboxes/devtools/log-value-tree.ts
git commit -m "feat(devtools): recursive LogValueTree inspector"
```

---

### Task 9: SandboxConsole dock component

**Files:**
- Create: `src/app/sandboxes/devtools/sandbox-console.ts`
- Create: `src/app/sandboxes/devtools/sandbox-console.html`
- Create: `src/app/sandboxes/devtools/sandbox-console.less`

- [ ] **Step 1: Write the component class**

```ts
// src/app/sandboxes/devtools/sandbox-console.ts
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { LogEntry, LogLevel } from './log-entry';
import { LogStore } from './log-store';
import { LogValueTree } from './log-value-tree';

const LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error'];

@Component({
  selector: 'app-sandbox-console',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LogValueTree],
  templateUrl: './sandbox-console.html',
  styleUrl: './sandbox-console.less',
})
export class SandboxConsole {
  private readonly store = inject(LogStore);

  protected readonly levels = LEVELS;
  protected readonly open = signal(false);
  protected readonly autoscroll = signal(true);
  protected readonly query = signal('');
  protected readonly activeLevels = signal<ReadonlySet<LogLevel>>(new Set(LEVELS));
  protected readonly expanded = signal<ReadonlySet<number>>(new Set());

  protected readonly entries = this.store.entries;
  protected readonly count = computed(() => this.entries().length);

  protected readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    const active = this.activeLevels();
    return this.entries().filter((e) => {
      if (!active.has(e.level)) return false;
      if (!q) return true;
      return e.source.toLowerCase().includes(q) || e.values.some((v) => valueText(v).includes(q));
    });
  });

  protected toggleOpen(): void {
    this.open.update((v) => !v);
  }

  protected toggleLevel(level: LogLevel): void {
    this.activeLevels.update((set) => {
      const next = new Set(set);
      if (next.has(level)) next.delete(level);
      else next.add(level);
      return next;
    });
  }

  protected isLevelActive(level: LogLevel): boolean {
    return this.activeLevels().has(level);
  }

  protected toggleRow(id: number): void {
    this.expanded.update((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  protected isRowExpanded(id: number): boolean {
    return this.expanded().has(id);
  }

  protected clear(): void {
    this.store.clear();
    this.expanded.set(new Set());
  }

  protected formatTime(ms: number): string {
    const d = new Date(ms);
    const pad = (n: number, w = 2) => String(n).padStart(w, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
  }

  protected async copyAll(): Promise<void> {
    const text = this.filtered().map(toPlainText).join('\n');
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* clipboard may be unavailable; ignore */
    }
  }

  protected export(): void {
    const text = this.filtered().map(toPlainText).join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sandbox-logs.txt';
    a.click();
    URL.revokeObjectURL(url);
  }
}

function valueText(v: LogEntry['values'][number]): string {
  if (v.kind === 'array') return v.items.map(valueText).join(' ');
  if (v.kind === 'object') return v.entries.map((e) => `${e.key} ${valueText(e.value)}`).join(' ');
  return v.display.toLowerCase();
}

function toPlainText(e: LogEntry): string {
  const d = new Date(e.time).toISOString();
  const msg = e.values.map(plainValue).join(' ');
  return `[${e.level}] ${d} ${e.source} — ${msg}`;
}

function plainValue(v: LogEntry['values'][number]): string {
  if (v.kind === 'array') return `[${v.items.map(plainValue).join(', ')}]`;
  if (v.kind === 'object') return `{${v.entries.map((e) => `${e.key}: ${plainValue(e.value)}`).join(', ')}}`;
  return v.display;
}
```

- [ ] **Step 2: Write the template**

```html
<!-- src/app/sandboxes/devtools/sandbox-console.html -->
@if (!open()) {
  <button type="button" class="sbc-fab" (click)="toggleOpen()" aria-label="Open log console">
    Console
    @if (count() > 0) {
      <span class="sbc-fab__count">{{ count() }}</span>
    }
  </button>
} @else {
  <section class="sbc" role="complementary" aria-label="Sandbox log console">
    <header class="sbc__bar">
      <div class="sbc__levels" role="group" aria-label="Filter by level">
        @for (lvl of levels; track lvl) {
          <button
            type="button"
            class="sbc__chip"
            [class.sbc__chip--on]="isLevelActive(lvl)"
            [attr.aria-pressed]="isLevelActive(lvl)"
            (click)="toggleLevel(lvl)"
          >
            {{ lvl }}
          </button>
        }
      </div>

      <input
        class="sbc__search"
        type="search"
        [value]="query()"
        (input)="query.set($any($event.target).value)"
        placeholder="Filter…"
        aria-label="Filter logs by text"
      />

      <label class="sbc__autoscroll">
        <input
          type="checkbox"
          [checked]="autoscroll()"
          (change)="autoscroll.set($any($event.target).checked)"
        />
        Autoscroll
      </label>

      <button type="button" class="sbc__btn" (click)="copyAll()" aria-label="Copy logs">Copy</button>
      <button type="button" class="sbc__btn" (click)="export()" aria-label="Export logs">Export</button>
      <button type="button" class="sbc__btn" (click)="clear()" aria-label="Clear logs">Clear</button>
      <button type="button" class="sbc__btn" (click)="toggleOpen()" aria-label="Close log console">✕</button>
    </header>

    <ol class="sbc__list" #list role="log" aria-live="polite">
      @for (e of filtered(); track e.id) {
        <li class="sbc__entry sbc__entry--{{ e.level }}">
          <button type="button" class="sbc__row" (click)="toggleRow(e.id)" [attr.aria-expanded]="isRowExpanded(e.id)">
            <span class="sbc__level">{{ e.level }}</span>
            <span class="sbc__time">{{ formatTime(e.time) }}</span>
            <span class="sbc__source">{{ e.source }}</span>
            <span class="sbc__msg">
              @for (v of e.values; track $index) {
                <app-log-value-tree [value]="v" />
              }
            </span>
          </button>

          @if (isRowExpanded(e.id)) {
            <div class="sbc__detail">
              <h4 class="sbc__detail-title">Stack</h4>
              <ul class="sbc__frames">
                @for (f of e.frames; track $index) {
                  <li class="sbc__frame">{{ f.fn }} <span class="sbc__frame-loc">{{ f.file }}:{{ f.line }}:{{ f.col }}</span></li>
                }
              </ul>
            </div>
          }
        </li>
      } @empty {
        <li class="sbc__empty">No logs match.</li>
      }
    </ol>
  </section>
}
```

- [ ] **Step 3: Write the styles**

```less
// src/app/sandboxes/devtools/sandbox-console.less
:host {
  position: fixed;
  right: var(--sb-space-4);
  bottom: var(--sb-space-4);
  z-index: 1000;
}

.sbc-fab {
  display: inline-flex;
  align-items: center;
  gap: var(--sb-space-2);
  padding: var(--sb-space-2) var(--sb-space-4);
  background: var(--sb-accent);
  color: var(--sb-accent-contrast);
  border: none;
  border-radius: var(--sb-radius);
  box-shadow: var(--sb-shadow);
  font: inherit;
  font-weight: 600;
  cursor: pointer;

  &:focus-visible {
    outline: none;
    box-shadow: var(--sb-ring);
  }
}

.sbc-fab__count {
  background: rgba(255, 255, 255, 0.25);
  border-radius: 999px;
  padding: 0 0.5em;
  font-size: 0.75rem;
}

.sbc {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
  height: 40vh;
  min-height: 8rem;
  max-height: 80vh;
  resize: vertical;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: var(--sb-surface);
  border-top: 1px solid var(--sb-border);
  box-shadow: var(--sb-shadow);
}

.sbc__bar {
  display: flex;
  align-items: center;
  gap: var(--sb-space-2);
  flex-wrap: wrap;
  padding: var(--sb-space-2) var(--sb-space-3);
  border-bottom: 1px solid var(--sb-border);
  background: var(--sb-surface-2);
}

.sbc__levels {
  display: flex;
  gap: var(--sb-space-1);
}

.sbc__chip {
  padding: var(--sb-space-1) var(--sb-space-2);
  border: 1px solid var(--sb-border);
  border-radius: var(--sb-radius-sm);
  background: var(--sb-surface);
  color: var(--sb-text-muted);
  font: inherit;
  font-size: 0.75rem;
  text-transform: uppercase;
  cursor: pointer;

  &--on {
    background: var(--sb-accent);
    color: var(--sb-accent-contrast);
    border-color: var(--sb-accent);
  }

  &:focus-visible {
    outline: none;
    box-shadow: var(--sb-ring);
  }
}

.sbc__search {
  flex: 1 1 8rem;
  min-width: 6rem;
  padding: var(--sb-space-1) var(--sb-space-2);
  border: 1px solid var(--sb-border);
  border-radius: var(--sb-radius-sm);
  font: inherit;
}

.sbc__autoscroll {
  display: inline-flex;
  align-items: center;
  gap: var(--sb-space-1);
  font-size: 0.75rem;
  color: var(--sb-text-muted);
}

.sbc__btn {
  padding: var(--sb-space-1) var(--sb-space-2);
  border: 1px solid var(--sb-border);
  border-radius: var(--sb-radius-sm);
  background: var(--sb-surface);
  color: var(--sb-text);
  font: inherit;
  font-size: 0.75rem;
  cursor: pointer;

  &:focus-visible {
    outline: none;
    box-shadow: var(--sb-ring);
  }
}

.sbc__list {
  flex: 1 1 auto;
  margin: 0;
  padding: 0;
  list-style: none;
  overflow-y: auto;
  font-family: var(--sb-font-mono);
  font-size: 0.8125rem;
}

.sbc__entry {
  border-bottom: 1px solid var(--sb-border);
  border-left: 3px solid transparent;

  &--warn {
    border-left-color: #b7791f;
    background: #fffbeb;
  }
  &--error {
    border-left-color: var(--sb-danger);
    background: #fef2f2;
  }
}

.sbc__row {
  display: flex;
  gap: var(--sb-space-2);
  width: 100%;
  text-align: left;
  padding: var(--sb-space-1) var(--sb-space-3);
  border: none;
  background: none;
  font: inherit;
  cursor: pointer;

  &:focus-visible {
    outline: none;
    box-shadow: var(--sb-ring);
  }
}

.sbc__level {
  text-transform: uppercase;
  font-size: 0.6875rem;
  color: var(--sb-text-muted);
  flex: 0 0 3.2rem;
}

.sbc__time {
  color: var(--sb-text-muted);
  flex: 0 0 auto;
}

.sbc__source {
  color: var(--sb-accent);
  flex: 0 0 auto;
}

.sbc__msg {
  flex: 1 1 auto;
  white-space: pre-wrap;
  word-break: break-word;
}

.sbc__detail {
  padding: var(--sb-space-2) var(--sb-space-3) var(--sb-space-3) 3.5rem;
  background: var(--sb-surface-2);
}

.sbc__detail-title {
  margin: 0 0 var(--sb-space-1);
  font-size: 0.6875rem;
  text-transform: uppercase;
  color: var(--sb-text-muted);
}

.sbc__frames {
  margin: 0;
  padding: 0;
  list-style: none;
}

.sbc__frame {
  color: var(--sb-text);
}

.sbc__frame-loc {
  color: var(--sb-text-muted);
}

.sbc__empty {
  padding: var(--sb-space-4);
  text-align: center;
  color: var(--sb-text-muted);
}
```

- [ ] **Step 4: Verify build**

Run: `npx ng build --configuration development`
Expected: "Application bundle generation complete."

- [ ] **Step 5: Commit**

```bash
git add src/app/sandboxes/devtools/sandbox-console.ts src/app/sandboxes/devtools/sandbox-console.html src/app/sandboxes/devtools/sandbox-console.less
git commit -m "feat(devtools): SandboxConsole dock component"
```

---

### Task 10: Mount in shell (dev-only)

**Files:**
- Modify: `src/app/sandboxes/shell/sandbox-shell.ts`

- [ ] **Step 1: Update the shell**

Replace the file's class + imports + template so the console mounts under a dev guard. The full updated file:

```ts
// src/app/sandboxes/shell/sandbox-shell.ts
import { ChangeDetectionStrategy, Component, isDevMode } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { SandboxConsole } from '../devtools/sandbox-console';

/**
 * Chrome wrapping every `/s/*` sandbox route. Provides a persistent
 * "back to dashboard" affordance so a sandbox is never a dead end, a
 * full-height content area so a sandbox's `min-height: 100%` fills the
 * viewport below the bar, and (in dev) the in-app log console.
 */
@Component({
  selector: 'app-sandbox-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterOutlet, SandboxConsole],
  template: `
    <nav class="sb-shell-bar" aria-label="Sandbox navigation">
      <a class="sb-shell-bar__back" routerLink="/">
        <span class="sb-shell-bar__back-icon" aria-hidden="true">←</span>
        Dashboard
      </a>
    </nav>
    <div class="sb-shell-content">
      <router-outlet />
    </div>
    @if (isDev) {
      <app-sandbox-console />
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      min-height: 100vh;
    }

    .sb-shell-bar {
      display: flex;
      align-items: center;
      padding: var(--sb-space-1) var(--sb-space-3);
      border-bottom: 1px solid var(--sb-border);
      background: var(--sb-surface);
    }

    .sb-shell-bar__back {
      display: inline-flex;
      align-items: center;
      gap: var(--sb-space-1);
      padding: var(--sb-space-1) var(--sb-space-2);
      border-radius: var(--sb-radius-sm);
      font: inherit;
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--sb-text);
      text-decoration: none;
    }

    .sb-shell-bar__back:hover {
      background: var(--sb-surface-2);
      color: var(--sb-accent);
    }

    .sb-shell-bar__back:focus-visible {
      outline: none;
      box-shadow: var(--sb-ring);
    }

    .sb-shell-bar__back-icon {
      font-size: 1.05em;
      line-height: 1;
    }

    /* Grows to fill the viewport below the bar so sandboxes can size to 100%. */
    .sb-shell-content {
      flex: 1 1 auto;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }
  `,
})
export class SandboxShell {
  protected readonly isDev = isDevMode();
}
```

- [ ] **Step 2: Verify build**

Run: `npx ng build --configuration development`
Expected: "Application bundle generation complete."

- [ ] **Step 3: Commit**

```bash
git add src/app/sandboxes/shell/sandbox-shell.ts
git commit -m "feat(devtools): mount log console in sandbox shell (dev-only)"
```

---

## Final verification

- [ ] **Step 1: Run all unit tests**

Run: `npm run test:devtools && npm run test:codegen`
Expected: all suites pass.

- [ ] **Step 2: Full typecheck + build**

Run: `npx tsc --noEmit -p tsconfig.app.json && npx ng build --configuration development`
Expected: clean typecheck + bundle complete.

- [ ] **Step 3: Manual QA** (dispatch parallel-agent-qa after `npm start`)

Verify in a sandbox (`/s/test`):
- Floating "Console" button appears bottom-right; click opens the dock.
- A `console.log('hi', {a:1})` from sandbox code shows: level `info`, time, source `…(test.ts:NN)`, message with expandable object.
- `console.warn` / `console.error` rows are tinted; level filter chips toggle them.
- Text search filters rows.
- Clicking a row expands the stack trace with frames.
- Throwing an uncaught error lands an `error` row.
- Copy and Export produce the log text.
- Clear empties the list.
- The dock is absent on the dashboard (`/`).
- Logs still appear in the browser's native DevTools console (duplicated).

---

## Self-review notes

- **Spec coverage:** hybrid capture (Tasks 5/6), source+stack (Tasks 3/9), bottom dock in shell (Tasks 9/10), object inspector (Task 8), export/copy (Task 9), uncaught errors (Task 5 via window listeners + console.error capture), dev-only (Tasks 7/10), filter/search/clear/autoscroll (Task 9). Persistence and `console.group` correctly excluded (deferred). No hotkey (excluded). Native console duplicated (Task 5 calls original first).
- **Type consistency:** `LogEntry`/`LogValue`/`StackFrame`/`LogLevel`/`LogOrigin` defined in Task 1 and used unchanged; `LogStore.add(Omit<LogEntry,'id'>)` matches `buildEntry` return; `buildEntry(level, origin, args, scope?)` signature consistent across Tasks 5/6.
- **Autoscroll note:** the `autoscroll` signal/checkbox is wired; auto-scrolling the list to bottom on new entries is a small enhancement the UI agent may add via an `effect()` + `viewChild('list')` if time permits; not required for v1 acceptance.
