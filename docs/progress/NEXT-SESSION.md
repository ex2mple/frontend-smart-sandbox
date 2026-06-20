# Next-session handoff

> Read this first. It tells you **what we are doing now** and **what is left**, so you can pick up with zero archaeology. Per-task implementation logs live alongside this file under `docs/progress/`.

**Last updated:** 2026-06-20 · branch `feat/sandbox-mvp`

---

## Where we are (known-good checkpoint)

Everything below is committed; build + unit tests are green.

- **MVP + multipage + design system** — see [`roadmap`](../../docs/superpowers/) memory; dashboard, companion server, codegen, blank/example/multipage templates, `withViewTransitions()`, `--sb-*` tokens.
- **Sandbox shell wrapper** (`src/app/sandboxes/shell/sandbox-shell.ts`) — pathless route around all `/s/*` children rendering a persistent "← Dashboard" back link; dashboard sits on sibling `{ path: '', pathMatch: 'full' }`. Full-height flex; html/body got `height:100%` to fix the collapsed-height regression.
- **Generated-routes guard** — `sandbox.routes.generated.ts` is `skip-worktree` + protected by `postinstall` (`tools/sandbox/protect-generated-routes.mjs`) and a `.githooks/pre-commit` net. It must stay committed as `[]`.
- **Dev log console** (`src/app/sandboxes/devtools/`) — dev-only overlay dock that captures `console.*` with origin (component/function + stack), expandable value inspector, level filter / search / clear / copy / export. Mounted in the shell under `@if (isDev)`. Design spec + plan in `docs/superpowers/`.
  - Commits: `4153926`→`5c587ae` (12 feat commits + 3 review-fix commits `a8ff708`, `237a55c`, `5c587ae`).
  - Verified: `tsc --noEmit -p tsconfig.app.json` clean · `vitest run src/app/sandboxes/devtools` → 13/13 · `ng build --configuration development` green.

## What's left

1. **Monaco editor + live preview** — `GET/PUT /sandbox-api/files/:name` + lazy Monaco in a `/s/:name/edit` split-pane with `<iframe>` preview. Editor *intelligence* (TS/Angular LS) is explicitly out of scope for v1.
2. **`create` cleanup-on-failure** — remove a partially-written sandbox folder on error (can leave an `EISDIR`-triggering partial dir). See `architecture-and-gotchas`.
3. **First deep visualizer sandbox** (render tree / DI tree / event loop) per the project vision.

## Recently done

- **Live QA of the dev log console — DONE 2026-06-20, all 13 browser checks PASS, no defects.** Evidence in [`qa-log-console.md`](qa-log-console.md). The feature (FAB + count badge, level filter, search, row→stack expand, object inspector, Copy/Export/Clear, single uncaught-error record, native passthrough, absent on dashboard) is verified end-to-end and considered complete.
  - **QA env note:** a stale companion server left on :4300 from a prior session makes `npm start` fail with `EADDRINUSE` and (via `concurrently -k`) kills `ng serve`; it can also leave `sandbox.routes.generated.ts` as `[]` so `/s/<name>` 404s. Before QA: kill leftover node on :4200/:4300, restart `npm start`, and confirm the routes file repopulated with real `loadChildren` entries.

## How to work here (standing agreements)

- **Use subagents** for non-trivial dev (fan-out + delegate), then `post-agent-code-review`, then `parallel-agent-qa`. The writer agent never commits — the orchestrator commits by zone after review.
- **Never** touch `sandbox.routes.generated.ts`; to intentionally edit it, `git update-index --no-skip-worktree <file>` first.
- **Never** `import.meta.glob` the sandbox dirs (stalls Vite dep-optimize).
- Generated sandbox styles consume `--sb-*` tokens — keep that contract.
- Secret-guard hook active: refer to secrets by env-var NAME only; never read credential files.
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
