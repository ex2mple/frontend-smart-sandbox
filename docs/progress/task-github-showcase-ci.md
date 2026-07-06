# Task: GitHub showcase repo — LICENSE + CI workflow

Date: 2026-07-06

## Goal

Prepare the public showcase repo (`github.com/ex2mple/frontend-smart-sandbox`)
with an MIT `LICENSE` and a GitHub Actions `CI` workflow
(`.github/workflows/ci.yml`) that a README badge can reference.

## Files added

- `LICENSE` — standard MIT license text, `Copyright (c) 2026 Anton Braude`.
- `.github/workflows/ci.yml` — workflow named `CI`. Triggers: `push` to
  `main`, `pull_request`, `workflow_dispatch`. Single `ubuntu-latest` job
  (`build-and-test`): `actions/checkout@v4` →
  `actions/setup-node@v4` (`node-version: 24`, `cache: npm`) → `npm ci` →
  `npm run build` → `npm run test:codegen` → `npm run test:devtools` →
  `npm run test:shared`.
- `docs/progress/task-github-showcase-ci.md` — this log.

No existing files were modified; no commit was created.

## Pre-flight checks

- Read `tools/sandbox/protect-generated-routes.mjs` (runs as `postinstall`).
  It bails out (`process.exit(0)`) whenever `git rev-parse --is-inside-work-tree`
  fails or returns anything other than `true`, and every other step is wrapped
  in its own `try/catch` with non-fatal fallbacks (git-hooks path config,
  `--skip-worktree` toggle). `actions/checkout@v4` always leaves a real git
  worktree, so `npm ci`'s `postinstall` step is CI-safe and cannot fail the
  build headlessly.
- Confirmed `src/app/sandboxes/sandbox.routes.generated.ts` is only ever
  consumed as a direct assignment:
  `sandbox.routes.ts`: `export const sandboxRoutes: Routes = generatedSandboxRoutes;`
  — no code branches on array length/contents, so the committed `[]` state
  builds trivially in a fresh CI clone. Locally the file is `--skip-worktree`
  and currently holds demo routes (8 lazy `s/*-demo` entries) — expected and
  left untouched.
- Checked `angular.json`'s `test` target: builder is `@angular/build:unit-test`
  (vitest-based, no explicit browser/karma/playwright config anywhere in the
  repo). `test:shared` (`ng test --watch=false --include '...'`) ran headlessly
  in this sandbox with no Chromium/browser install needed — confirms no
  browser dependency needs to be added to the workflow.
- No `engines` field in `package.json`; `node -v` locally is v24.16.0, matching
  the `node-version: 24` chosen for `setup-node@v4`.

## Local verification run

All commands run from repo root on the current branch (`feat/sandbox-mvp`),
working tree otherwise unchanged (pre-existing unrelated local modification to
`tools/sandbox/server.mjs` predates this task and was left alone):

```
$ npm run build
✔ Building...
Application bundle generation complete. [1.133 seconds]
```
Build succeeded (local tree has demo routes populated; see note above on why
`[]` in CI is equally safe).

```
$ npm run test:codegen
 Test Files  1 passed (1)
      Tests  24 passed (24)
```

```
$ npm run test:devtools
 Test Files  2 passed (2)
      Tests  13 passed (13)
```

```
$ npm run test:shared
 Test Files  3 passed (3)
      Tests  25 passed (25)
```

All match the expected counts (24/24, 13/13, 25/25).

## YAML validation

- `actionlint` is not installed locally (checked via `which actionlint`).
- No `yaml`/`js-yaml` npm package available in this repo's `node_modules` to
  parse with Node directly.
- Validated instead with Python's `pyyaml` (`python3 -c "import yaml; yaml.safe_load(...)"`)
  — the file parses without error. Note: PyYAML (YAML 1.1) resolves the bare
  `on:` key to the boolean `True` rather than the string `"on"` — this is a
  well-known, harmless quirk of YAML 1.1 core-schema boolean resolution that
  affects literally every GitHub Actions workflow using the plain `on:` key;
  GitHub's own workflow parser handles it as the literal trigger keyword, so
  it has no effect on GitHub Actions execution. Manually re-reviewed the full
  file for indentation/structure correctness on top of the parse check.

## CI risks / things to watch once this runs for real on GitHub

- **First-run cache miss**: `actions/setup-node@v4`'s `cache: npm` needs a
  `package-lock.json` in the repo root to key off; confirmed one exists, so
  caching should work from the very first run.
- **`npm ci` strictness**: `npm ci` requires `package-lock.json` to be in
  sync with `package.json`; not an issue observed locally, but any future
  edit to one without the other will fail CI where it might not fail a local
  `npm install`.
- **postinstall git config step**: `protect-generated-routes.mjs` calls
  `git config core.hooksPath .githooks` on every install, including in CI.
  Harmless (repo-local git config in an ephemeral CI checkout) but worth
  knowing it runs on every `npm ci`.
- **No browser dependency added**: confirmed all three `npm run test:*`
  scripts (vitest + `@angular/build:unit-test`) run headlessly without
  Chromium; if a future template/spec introduces real browser E2E tests
  (e.g. Playwright), the workflow will need an explicit browser install step
  added at that point — ubuntu-latest ships Chrome, but Playwright's own
  browsers still typically need `npx playwright install` if adopted.
- **Timing/flakiness**: all four verification steps completed in a few
  seconds locally; no long-running or network-dependent steps were found, so
  CI runtime should be short and stable modulo GitHub Actions' own runner
  provisioning time.
- **Single job vs split jobs**: kept everything in one `build-and-test` job
  per the "single job" option offered in the task, so a failure in any test
  script still runs after `build` succeeds in the same job (steps run
  sequentially and each must pass, matching the requested ordering); a
  build failure will short-circuit the remaining test steps, which is
  expected/desired here.
