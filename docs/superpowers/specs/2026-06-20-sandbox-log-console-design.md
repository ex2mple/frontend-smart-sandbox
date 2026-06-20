# Sandbox Log Console — Design

Date: 2026-06-20
Status: Approved for planning
Branch: `feat/sandbox-mvp`

## Problem

While developing inside a sandbox, you produce a lot of console output. Native
`console.log` is inconvenient: hard to tell **which component/function** emitted
a line, and hard to see the **call chain** that led to it. We want an in-app,
closable console overlay that shows logs with rich origin context.

## Goals (v1)

- Capture logs the dev already writes (`console.*`) **and** offer a richer
  explicit logger — hybrid capture.
- Each entry shows: level, time, **source** (component/function:line), message.
- Each entry expands to the **full stack trace** (the call chain to that log),
  with clickable frames.
- A closable **bottom dock** console, mounted in the sandbox shell (visible in
  any `/s/*` sandbox, persists across its pages; not on the dashboard).
- Capture **uncaught errors** (`window.onerror`, `unhandledrejection`, Angular
  `ErrorHandler`) into the panel too.
- **Object inspector**: logged objects/arrays render as an expandable tree
  (snapshot at log time).
- **Export/copy** the whole buffer.
- Baseline controls: filter by level, text search, clear, autoscroll,
  collapse/expand, resizable height.
- **Dev-only**: capture installs only under `isDevMode()`; the dock renders only
  in dev (the shell ships in the prod build).

## Non-goals (v1 / deferred)

- Persisting logs across reloads (sessionStorage) — deferred.
- `console.group()` / nested collapsible log trees — deferred (design leaves
  room: source attribution stays per-entry).
- Keyboard shortcut to toggle — **not included** (floating button only).
- Suppressing native console — **no**; we duplicate to the native console.
- Jump-to-source in an editor (no editor yet) — out of scope.
- List virtualization — not needed at the ~1000-entry cap for v1.

## Decisions (locked)

| Topic | Decision |
| --- | --- |
| Capture mechanism | Hybrid: patch `console.*` + `SandboxLog` facade |
| Origin context | Source line + expandable full stack trace |
| UI form | Bottom dock, mounted in `sandbox-shell` |
| v1 extras | Object inspector + export/copy |
| Uncaught errors | Captured into panel (+ delegate to default handler) |
| Toggle | Floating button, **no** hotkey |
| Native console | Duplicate (logs go to both) |
| Scope | Dev-only |

## Architecture

New module: `src/app/sandboxes/devtools/`

### Pure core (unit-tested with vitest, like codegen)

- `log-entry.ts` — types:
  - `LogLevel = 'debug' | 'info' | 'warn' | 'error'`
  - `StackFrame { fn: string; file: string; line: number; col: number; raw: string }`
  - `LogValue` — serialized snapshot tree: a tagged union covering
    `primitive | string | array | object | error | fn | special`, each carrying
    a display string and (for array/object) child entries; includes `truncated`
    flags for depth/size caps.
  - `LogEntry { id: number; level: LogLevel; time: number; source: string;
    frames: StackFrame[]; values: LogValue[]; origin: 'console' | 'logger' | 'error' }`
- `serialize-value.ts` — `serializeValue(value, opts?): LogValue`
  - Depth cap (default 4) and per-object key cap (default 100); cycle detection
    via a seen-set → `[Circular]`.
  - Special handling: `Date`, `Error` (message + name), functions (`ƒ name`),
    DOM nodes (`<tag>`), `Map`/`Set` (size + entries), `undefined`/`null`,
    `bigint`, `Symbol`.
  - Snapshot semantics: copies values at log time; never retains live refs.
- `parse-stack.ts`
  - `parseStack(stack: string): StackFrame[]` — tolerant of V8
    (`at fn (file:line:col)`) and Firefox/Safari (`fn@file:line:col`) formats.
  - `pickSource(frames, opts): string` — first "app" frame, skipping internal
    frames (the capture/logger module itself, `zone.js`, `node_modules`,
    angular internals). Returns e.g. `IncrementButton.increment (…/blank.ts:14)`.

### Services / wiring

- `LogStore` (`providedIn: 'root'`) — ring buffer on a signal:
  - `entries: Signal<readonly LogEntry[]>`, `add(partial)`, `clear()`.
  - Cap ~1000 (oldest dropped). Monotonic `id` counter for `@for` tracking.
- `console-capture.ts` — `installConsoleCapture(store): () => void`
  - Patches `console.debug/info/log/warn/error` → forward to the original, then
    build a `LogEntry` and `store.add`. (`console.log` → level `info`.)
  - Patches `window.onerror` and `window.onunhandledrejection` → level `error`,
    `origin: 'error'`.
  - Idempotent: a sentinel flag on `console` prevents double-install across HMR;
    returns an uninstall fn that restores originals.
  - Re-entrancy guard so building an entry never re-triggers capture.
- `sandbox-log.ts` — `SandboxLog` (`providedIn: 'root'`)
  - `debug/info/warn/error(...args)`, `scope(label): SandboxLog` (prefixes
    source with the label). `origin: 'logger'`.
- `sandbox-error-handler.ts` — `SandboxErrorHandler implements ErrorHandler`
  - Pushes the error to the store, then delegates to a default `ErrorHandler`.
- `app.config.ts` wiring:
  - `provideAppInitializer(() => { if (isDevMode()) installConsoleCapture(inject(LogStore)); })`
  - `{ provide: ErrorHandler, useClass: SandboxErrorHandler }` (dev-only guard
    inside, delegating otherwise).

### UI

- `SandboxConsole` (`app-sandbox-console`, external template + styles)
  - Mounted in `sandbox-shell` template under `@if (isDev)`.
  - Collapsed: a floating toggle button (bottom-right) with the entry count.
  - Expanded: bottom dock with a toolbar (level filter chips, search input,
    clear, copy, export, autoscroll toggle, collapse) and a scrollable list.
  - Resizable height via CSS `resize: vertical`.
  - Reads `store.entries`; filtering/search via `computed()` over local signals.
  - A row: `level · time · source — message`; click toggles a detail region
    with the stack frames and the object inspector.
  - OnPush; controls keyboard-accessible; `aria-label`s; AA contrast;
    `--sb-ring` focus.
- `LogValueTree` (`app-log-value-tree`)
  - Recursive, renders a `LogValue`; object/array nodes expand/collapse.

## Data flow

```
console.* / SandboxLog / uncaught error
  → build LogEntry { level, time (performance.now), source (pickSource∘parseStack),
                     frames, values (serializeValue per arg), origin }
  → LogStore.add()           (signal updates, ring-buffer cap)
  → SandboxConsole           (computed filtered view re-renders)
```

## Error handling

- Serializer must never throw: any failure inside `serializeValue` falls back to
  a `String(value)` best-effort node, guarded by try/catch.
- Capture must never recurse or break the app: re-entrancy guard + always call
  the original console method first (so a bug in capture can't swallow logs).
- Stack parsing tolerates unknown formats: unrecognized lines kept as `raw`.

## Testing

- vitest (`tools`-style, pure):
  - `serialize-value`: primitives, nested objects, arrays, cycles, depth/size
    caps, Date/Error/Map/Set/function/DOM, throwing getters.
  - `parse-stack`: V8 + Firefox formats; `pickSource` skips internal frames.
- Manual QA (via parallel-agent-qa after build): logs appear, source correct,
  stack expands, object inspector expands, filter/search/clear/copy/export work,
  uncaught error lands in panel, dock collapses, absent on dashboard, dev-only.

## Implementation zones (for subagent fan-out)

1. **Zone A — pure core**: `log-entry.ts`, `serialize-value.ts`, `parse-stack.ts`
   + vitest specs. No Angular deps. (Must land first — others import its types.)
2. **Zone B — services/wiring**: `LogStore`, `console-capture.ts`, `SandboxLog`,
   `SandboxErrorHandler`, `app.config.ts` wiring. Depends on Zone A.
3. **Zone C — UI**: `SandboxConsole` (+ template/styles), `LogValueTree`, mount in
   `sandbox-shell`. Depends on Zone A types and `LogStore` API from Zone B.

Order: A → (B ∥ C). Post-implementation: code review per zone, then QA.

## Open questions

None — all locked above.
