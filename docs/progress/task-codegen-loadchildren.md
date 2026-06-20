# Task: codegen — switch to loadChildren routing

Date: 2026-06-20

## What changed

### `tools/sandbox/codegen.mjs` — `buildRoutesFile`

- Removed `kebabToClassName` call (class name no longer needed).
- Changed each emitted route line from `loadComponent` to `loadChildren`.
- New line format:
  ```
    { path: 's/<name>', loadChildren: () => import('./<dir>/<name>/<name>.routes').then((m) => m.routes) },
  ```
- All other exports (`NAME_RE`, `isValidName`, `kebabToClassName`, `selectorFor`, `renderTemplate`) left untouched.
- Header and empty-array case unchanged.

### `tools/sandbox/codegen.spec.ts`

- Updated 3 existing `buildRoutesFile` tests to assert the new `loadChildren` / `<name>.routes` / `m.routes` shape (tests: "produces correct line for a generated entry", "uses saved directory for kind=saved", "produces correct output for two entries").
- Replaced the `derives class name correctly from name` test with `uses loadChildren resolving m.routes (not a class name) for any entry` — checks for `loadChildren`, `foo-bar.routes`, `m.routes`, and absence of `loadComponent`.
- Added new test: "emits loadChildren with <name>.routes for a saved sandbox" — verifies `{name:'foo', kind:'saved'}` produces the exact expected string with `./saved/foo/foo.routes`.

## Test result

`npx vitest run tools/sandbox` — **24 tests passed, 0 failed**.
