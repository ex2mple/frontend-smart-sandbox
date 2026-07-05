# Next-session handoff

> Read this first. It tells you **what we are doing now** and **what is left**, so you can pick up with zero archaeology. Per-task implementation logs live alongside this file under `docs/progress/`.

**Last updated:** 2026-07-05 · branch `feat/sandbox-mvp`

---

## Current goal

**Visualizer templates pedagogy redesign** — make the 8 fundamentals templates genuinely instructive, per the approved 3-stage spec: `docs/superpowers/specs/2026-07-05-visualizer-pedagogy-redesign.md`. Stage 1 (bug fixes) is DONE; stages 2–3 are next.

## Where we are (known-good checkpoint)

Everything below is committed; `tsc` clean, `test:codegen` 24/24, `test:devtools` 13/13, `ng build` green, live browser QA passed.

- **Stage 1 of the redesign — DONE 2026-07-05.** All 7 confirmed defects fixed by 3 parallel fix-agents, audited by 3 independent reviewers, verified live (orchestrator clickthrough of cd-demo/life-demo + QA agent 11/11 PASS on the other six — see [`qa-templates-stage1.md`](qa-templates-stage1.md)). Commits: `5e0333b` (lifecycle CD feedback loop killed via buffered bus + settle-pass cap; change-detection honest zoneless check counters + zone.js misinfo removed), `9df2687` (signals live propagation flashes; di-tree truthful skipSelf lesson), `f76d12d` (event-loop numbering/extras order; this-binding rows execute displayed code; closures computed annotations + real items-outside button). Spec: `eb75de1`, QA log: `fd15ed2`.
  - Reviewer's one critical finding (Default-cards flush ping-pong in change-detection) was **empirically refuted**: counters stable at idle and after clicks; 5 rapid clicks = exactly +5; zoneless scheduler coalesces flushes so echo swallowing works. Noted here so nobody re-flags it without re-testing.
- **Earlier state** (MVP, multipage, design system, shell, generated-routes guard, dev log console 13/13, in-sandbox AGENTS.md + 8 templates) — unchanged, see git history and `docs/superpowers/`.
- Also committed this session: `ccb6354` fix(devtools) sharper pickSource (was an uncommitted tail).

## What's left

1. **Stage 2 — shared learning primitives** (spec §Stage 2): a `Recorder + Stepper` (record real run → replay step-by-step driving live visuals) and an `Experiment card` (question → prediction chips → run → verdict; content source = per-template AGENTS.md experiments). Design decision to make first: where the shared code lives — candidates: `src/app/sandboxes/shared/` imported by generated sandboxes via relative path (engine change: codegen must not copy it, routes stay per-sandbox), vs duplicating a small lib file into each template dir (no engine change, N copies). Check `tools/sandbox/codegen.mjs` (`copyTemplateTree`) before choosing.
2. **Stage 3 — apply primitives per template**, priority order and per-template content listed in the spec. Pilot on `event-loop` first (its concept is 100% temporal — biggest win).
3. **Monaco editor + live preview** — unchanged from before (files API + lazy Monaco at `/s/:name/edit`).
4. **`create` cleanup-on-failure** — remove partially-written sandbox folder on error.
5. **GitHub-витрина** — explicitly LAST per user: real README, ROADMAP, LICENSE, CI, remote+push (nothing exists yet, not even a remote).

## How to work here (standing agreements)

- **Use subagents** for non-trivial dev (fan-out + delegate), then `post-agent-code-review`, then `parallel-agent-qa`. Writer agents never commit — the orchestrator commits by zone after review. QA: only ONE agent drives the shared Playwright browser.
- **Zoneless instrumentation rule** (hard-won this session): never write signals synchronously during CD (hooks/render/computed bodies) — buffer + single `queueMicrotask` flush; educational templates must run REAL code, never fake results, and result-describing UI text must be computed from actual results.
- **Never** touch `sandbox.routes.generated.ts` (skip-worktree + guards); **never** `import.meta.glob` the sandbox dirs; generated styles consume `--sb-*` tokens.
- Codegen ICU gotcha: literal `{` in template text parses as ICU — wrap in `{{ '…{…}…' }}`.
- To regenerate demos: `curl -X POST :4300/sandbox-api/wipe` then `create` per template (no per-sandbox delete endpoint). Before QA: kill stale node on :4200/:4300 (`EADDRINUSE` kills `ng serve` via concurrently -k).
- Secret-guard hook active: refer to secrets by env-var NAME only.
