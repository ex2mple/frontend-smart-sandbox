# Visualizer templates: pedagogy redesign

**Date:** 2026-07-05 · **Status:** approved by user («поехали, мне всё нравится»)

## Problem

Live clickthrough + code review of all 8 fundamentals templates found that they
*run* real code but *teach* poorly, plus several outright defects. User verdict:
«потыкал — не понравилось, нужно сделать понятнее для изучения концепций».

Root causes (shared by all 8):

1. **Result-display, not mechanism-display.** Demos show final counters/lines;
   the invisible process each template exists to teach (queues draining, CD tree
   walk, injector resolution, captured environments) is never visualized.
   The event-loop diagram is static decoration; Run dumps a finished list.
2. **Spoilers.** Explanations sit next to buttons *before* the click — running
   confirms text instead of testing a prediction. Nothing sticks.
3. **The best teaching content is invisible.** Each template's AGENTS.md has
   good «Попробуй»/«Ловушки» lists that the learner never sees in the browser.

## Confirmed defects (verified in browser 2026-07-05)

| Template | Defect |
|---|---|
| lifecycle | **Infinite CD loop**: hooks write to a signal during CD → 1 Mount click = 304 timeline events in 2 s and counting. Dead `trackBySeq`. |
| di-tree | **False `skipSelf` claim**: Grandchild label says «перепрыгнул Branch → получил Root» but shows `#2` (Branch). `skipSelf` skips only the node's own injector. Wrong in template note, TS comment, console log, AGENTS.md. |
| change-detection | **zone.js misinformation** (app is zoneless — no zone dep, no provideZoneChangeDetection): legend + AGENTS.md:35 explain setTimeout via zone. Impure `renderStamp()` mutates state during render → flash lags/sticks, counts inflated. |
| signals | **Dead flash code**: `flashSum`/`flashDoubled` declared + bound, never set — the dependency graph never shows propagation. A/B flashes fired by the button, not the reactive graph. |
| event-loop | Line ids not reset between runs (2nd Run starts at 8). Extra tasks inserted before `sync 2` while UI implies appending. |
| closures | Hardcoded annotations lie after the recommended var→let edit; `cartStore` console experiment impossible (module-scoped → ReferenceError). |
| this-binding | Row 6 result hardcoded (arrow `this` never actually verified); row 7 displays `[1].forEach(f)` but runs a different function; no `new` rule. |

## Approach (3 stages, approved)

### Stage 1 — bug fixes (this session, parallel agents)

Fix the table above in `tools/sandbox/templates/*` (and the matching AGENTS.md
text). No redesign. **Mandatory pattern for instrumentation in zoneless app:**
never write signals synchronously during CD (hooks, render, computed bodies);
buffer into a plain array / defer via `queueMicrotask` and flush once.

### Stage 2 — shared learning primitives (once, reused by all)

- **Recorder + Stepper**: a demo records its real run as a list of typed steps,
  then replays them — Step / Play(auto-delay) / Reset — driving live visuals
  (tasks moving between queue columns, chain levels highlighting, CD tree nodes
  lighting up). Small standalone component + `RunRecorder` helper in a shared
  template lib dir copied by codegen (same mechanism as today's token contract).
- **Experiment card**: question → prediction chips → run → verdict
  («угадал/нет» + why). Content source: the existing AGENTS.md experiments.

### Stage 3 — apply primitives per template

Priority: event-loop → this-binding → lifecycle → change-detection → closures
→ di-tree → prototype-chain → signals. Add missing canonical cases while there:
`new` rule + rule-precedence ladder (this-binding), microtask-inside-macrotask
scenario (event-loop), action markers + ×N collapse (lifecycle), CD pass log
with skipped-with-reason (change-detection), environment-record boxes
(closures), resolution-walk animation (di-tree), predict-the-level (prototype-
chain), per-node recompute counters + update-a-and-b glitch-free button
(signals). Unify UI language to Russian.

## QA criteria

- Stage 1: regenerate one demo per touched template, clickthrough — lifecycle
  Mount produces a bounded, readable timeline; di-tree labels match badges;
  cd flash/counters truthful; signals graph flashes on propagation; event-loop
  numbering resets; closures/this-binding annotations truthful.
- Stages 2–3: per-template experiment cards render AGENTS.md content; stepper
  replays match the real recorded order (never faked timing).

## Full reviews

Agent reports (Angular + JS quartets) archived in session transcript
2026-07-05; defect lists above are the actionable subset.
