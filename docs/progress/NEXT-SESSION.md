# Next-session handoff

> Read this first. It tells you **what we are doing now** and **what is left**, so you can pick up with zero archaeology. Per-task implementation logs live alongside this file under `docs/progress/`.

**Last updated:** 2026-07-05 (evening) · branch `feat/sandbox-mvp`

---

## Current goal

**Visualizer templates pedagogy redesign — COMPLETE.** All 3 stages of `docs/superpowers/specs/2026-07-05-visualizer-pedagogy-redesign.md` are done: Stage 1 (bug fixes), Stage 2 (shared primitives), Stage 3 (replay model piloted in event-loop and rolled out to all 7 remaining templates, live-QA'd). **Next: `create` cleanup-on-failure, then the GitHub showcase (LAST).**

## Where we are (known-good checkpoint)

Everything below is committed; `tsc` clean, `test:codegen` 24/24, `test:devtools` 13/13, `ng build` green, live browser QA passed.

- **Stage 1 of the redesign — DONE 2026-07-05.** All 7 confirmed defects fixed by 3 parallel fix-agents, audited by 3 independent reviewers, verified live (orchestrator clickthrough of cd-demo/life-demo + QA agent 11/11 PASS on the other six — see [`qa-templates-stage1.md`](qa-templates-stage1.md)). Commits: `5e0333b` (lifecycle CD feedback loop killed via buffered bus + settle-pass cap; change-detection honest zoneless check counters + zone.js misinfo removed), `9df2687` (signals live propagation flashes; di-tree truthful skipSelf lesson), `f76d12d` (event-loop numbering/extras order; this-binding rows execute displayed code; closures computed annotations + real items-outside button). Spec: `eb75de1`, QA log: `fd15ed2`.
  - Reviewer's one critical finding (Default-cards flush ping-pong in change-detection) was **empirically refuted**: counters stable at idle and after clicks; 5 rapid clicks = exactly +5; zoneless scheduler coalesces flushes so echo swallowing works. Noted here so nobody re-flags it without re-testing.
- **Stage 2 — shared learning primitives — DONE 2026-07-05, commit `4e2a20e`.** `src/app/sandboxes/shared/learning/`: `RunRecorder<S>` (buffered signal recorder, zoneless-safe), `<sb-stepper>` (manual/auto replay, `position`/`positionChange` drive parent visuals; feed it a FINAL steps array, never a live recorder signal), `<sb-experiment-card>` (prediction chips → verdict). 25/25 tests (`npm run test:shared` — routes through the ng unit-test builder because plain vitest lacks Angular's JIT transform for `input()`/`output()`). Generated sandboxes import via `'../../shared/learning'` — no engine change was needed. Reviewed: no regressions.
- **Stage 3 pilot — event-loop reworked to the replay model — DONE 2026-07-05, commit `9de4062`.** The pattern to replicate: real run recorded with why-details + frozen `{stack,micro,macro}` mirror snapshots → static diagram became the live replay screen driven by stepper position → prediction card whose `actualIndex` is computed from actually recorded steps → `runId` token makes stale async callbacks no-ops → changing the extras builder reopens the card (review finding, fixed + verified live). Killer scenario (microtask inside macrotask) included. Browser-verified end-to-end, 0 console errors.
- **Stage 3 rollout — DONE 2026-07-05 (evening).** All 7 remaining templates reworked to the replay model (7 parallel writer agents → finishers after session-limit cutoffs → 7 independent reviewers → orchestrator fixed all findings → full demo regeneration → live QA in browser batches, every check PASS). Commits: `513027e` (this-binding), `eedaf62` (prototype-chain), `fdfa1f7` (closures), `6563d93` (change-detection), `dbb47ca` (lifecycle), `06a575a` (signals), `5b89cb9` (di-tree), `7296f91` (shared sb-stepper badge vocabulary for the new step kinds), `cdc23d2` (QA logs). QA logs: [`qa-stage3-batch1.md`](qa-stage3-batch1.md) 15/15, [`qa-stage3-batch2a.md`](qa-stage3-batch2a.md), [`qa-stage3-batch2b.md`](qa-stage3-batch2b.md) 9/9 (incl. re-verified lifecycle ×N fix); cd-demo live-verified by its fix agent.
  - Notable rollout findings, all fixed: lifecycle bus had to become component-scoped (`providers: [LifecycleBus]`) + settle-pass collapse works at PASS level (check hooks alternate within a pass — event-level collapse can never fire; a repeated identical settle batch collapses to one `ngDoCheck → ngAfterContentChecked → ngAfterViewChecked ×2` row); signals recompute counters must be captured AFTER forcing a sum/doubled read (dirty graph leaks into the delta otherwise); change-detection per-child self-inflicted heuristic replaced with parent-folded counts pushed via `input()`s; `--sb-warn` fails AA under white text — use `--sb-warn-surface` + `#8a5a13`; a parent stylesheet can't style a child component's inline template (view encapsulation) — child needs its own `styles`.
- **Earlier state** (MVP, multipage, design system, shell, generated-routes guard, dev log console 13/13, in-sandbox AGENTS.md + 8 templates) — unchanged, see git history and `docs/superpowers/`.
- Also committed this session: `ccb6354` fix(devtools) sharper pickSource (was an uncommitted tail).

## What's left

1. **`create` cleanup-on-failure** — remove partially-written sandbox folder on error.
2. **GitHub-витрина** — explicitly LAST per user: real README, ROADMAP, LICENSE, CI, remote+push (nothing exists yet, not even a remote).
3. Optional, offered but not confirmed by user: add `playwright` as a devDependency + helper script so QA agents can run parallel independent browsers (today only ONE agent may drive the shared Playwright MCP browser).

> Dropped 2026-07-05 per user: **Monaco editor + live preview** is out of the plans — do not re-add.

## How to work here (standing agreements)

- **Use subagents** for non-trivial dev (fan-out + delegate), then `post-agent-code-review`, then `parallel-agent-qa`. Writer agents never commit — the orchestrator commits by zone after review. QA: only ONE agent drives the shared Playwright browser.
- **Zoneless instrumentation rule** (hard-won this session): never write signals synchronously during CD (hooks/render/computed bodies) — buffer + single `queueMicrotask` flush; educational templates must run REAL code, never fake results, and result-describing UI text must be computed from actual results.
- **Never** touch `sandbox.routes.generated.ts` (skip-worktree + guards); **never** `import.meta.glob` the sandbox dirs; generated styles consume `--sb-*` tokens.
- Codegen ICU gotcha: literal `{` in template text parses as ICU — wrap in `{{ '…{…}…' }}`.
- To regenerate demos: `curl -X POST :4300/sandbox-api/wipe` then `create` per template (no per-sandbox delete endpoint). Before QA: kill stale node on :4200/:4300 (`EADDRINUSE` kills `ng serve` via concurrently -k).
- Secret-guard hook active: refer to secrets by env-var NAME only.
