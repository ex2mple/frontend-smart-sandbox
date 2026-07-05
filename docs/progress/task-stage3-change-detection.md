# Stage 3 — change-detection: review fixes (two confirmed counter bugs)

Scope: `tools/sandbox/templates/change-detection/` only (`__name__.ts`, `__name__.html`,
`AGENTS.md` not touched further — mechanism description lives in `__name__.ts` comments
and the in-app legend). No shared primitives, no other template, no commit made.

## What was wrong

A code review flagged two confirmed bugs in the per-child "checked N times" badge +
amber flash, both rooted in the same design flaw: each `CdNodeDefault`/`CdNodeOnPush`
instance tried to locally distinguish "a real Angular check" from "an echo CD pass I
caused myself" using a `pendingChecks`/`selfInflicted` counter, buffered via
`queueMicrotask` and flushed into local `checkCount`/`flashing` signals.

1. **`resetOwn()`** zeroed `selfInflicted` *before* its own `checkCount.set(0)` /
   `flashing.set(false)` / `ownClicks.set(0)` writes. Those writes dirty the component,
   Angular schedules a real-looking CD pass, and since `selfInflicted` was already back
   at 0, `recordCheck()` misclassified that self-caused pass as a genuine check → a
   stray "checked 1 times" + amber flash right after pressing Reset.
2. **`finalizePass()`** writes `replaySteps`/`stepPosition`/`cardActualIndex` in a
   `queueMicrotask` *after* closing the `passOpen` window. Those writes dirty the main
   (OnPush) component; the resulting real CD pass reaches `CdNodeDefault` nodes (Default
   strategy = always checked when reached), which had no way to know this was the
   parent's own bookkeeping rather than a "real" trigger → Default badges ended at 2 for
   one real click, even though the recorded replay log itself was correct (`onNodeChecked`
   already no-ops once `passOpen` is false, so the log/stepper was never corrupted — only
   the standalone badge lied).

Both bugs trace back to the same structural issue: the `selfInflicted` heuristic in a
child can only account for echoes *that child itself* schedules; it has no way to
distinguish those from echoes caused by the *parent's* own deferred writes. Patching the
heuristic further (e.g. conditionally incrementing `selfInflicted` in more places) would
just add more special cases without fixing the root cause, and would remain fragile
under repeated/rapid triggers.

## Mechanism chosen: parent-authoritative counts, children become presentational

Removed the per-child buffering/heuristic entirely. `recordCheck()` in both
`CdNodeDefault` and `CdNodeOnPush` is now a one-liner: `this.checked.emit(this.id())`
on every real template execution — no local `checkCount`/`flashing` signals, no
`pendingChecks`, no `selfInflicted`, no per-child `flushTimer`. `resetOwn()` now only
resets the unrelated local `ownClicks` counter (the "own click" count is genuinely local
DOM-click state, untouched by either bug).

The main component already opens/closes a `passOpen` window per real trigger and
collects real checks into a plain `Set<NodeId>` (`passChecked`), gated so that any
post-close echo (bug 2's exact mechanism) is a no-op. This was already correct for the
replay log; it just wasn't being used to drive the badges. Now it is:

- `finalizePass()` — which runs inside the `setTimeout(0)` macrotask from `startPass()`,
  i.e. never mid-CD — folds `orderedChecked` (the same node list already computed for
  the replay reasons) into a plain `Map<NodeId, number>` (`nodeCumulativeCounts`), then
  publishes a snapshot via `nodeCounts.set(new Map(...))`, and pulses a 300 ms flash per
  checked id via `nodeFlashing` (`pulseFlash()`, timer-per-id, cancels/restarts cleanly
  on repeated triggers of the same node).
- `defaultNodes`/`onpushNodes` computed signals now also project `count`/`flashing` per
  node from `nodeCounts()`/`nodeFlashing()`, passed down as new `count`/`flashing`
  `input()`s on both child components (replacing the old local signals of the same
  purpose).
- `reset()` clears `nodeCumulativeCounts`, resets `nodeCounts`/`nodeFlashing` to empty,
  and clears any in-flight flash timers, in addition to the existing `resetOwn()` calls
  (now only relevant for `ownClicks`).

This is robust to both original bugs by construction rather than by special-casing:
- Bug 1 (Reset false-positive) — there is no local `selfInflicted` to zero out of order;
  Reset simply clears the parent's own maps/signals, no signal write is misclassified.
- Bug 2 (post-close phantom) — `finalizePass()`'s own deferred writes never re-enter
  `nodeCumulativeCounts`/`nodeCounts` (that aggregation runs once, synchronously, before
  any further write); any later echo CD pass reaching a Default node still calls
  `recordCheck()` → `checked.emit()` → `onNodeChecked()`, which no-ops on
  `passOpen === false`, exactly as it already did for the replay log.

## Why not the "conditional selfInflicted increments" alternative

The task allowed a simpler alternative (extra conditional `selfInflicted` increments in
`resetOwn()` and an "expect one echo" hook around `finalizePass()`'s writes) if it was
"materially simpler and robust." It was rejected: it only patches the two known
repros and leaves the structural problem (a child cannot know how many echoes a
*parent's* deferred write will cause it, especially under overlapping/rapid triggers)
in place for the next bug of the same shape. The parent-authoritative approach removes
the whole class of bug instead of adding a third counter-heuristic case.

## Verification done

- `curl -X DELETE http://localhost:4300/sandbox-api/cd-demo` +
  `curl -X POST http://localhost:4300/sandbox-api/create ... template=change-detection`
  to regenerate the live demo from the fixed template, then `npx ng build` — **green**,
  no errors/warnings from the regenerated `cd-demo` route.
- Live clickthrough via Playwright at `http://localhost:4200/s/cd-demo` (note: the
  Angular dev server is on **4200**, not 4300 — 4300 is only the `sandbox-api` backend
  proxied from 4200 via `proxy.conf.json`):
  - Fresh load: all four badges "checked 0 times", no flash.
  - Repro (a): one click on "Клик снаружи (root-событие)" → both Default badges go to
    exactly **1**, both OnPush badges stay at **0**. Confirmed via accessibility
    snapshot (`aria-label`/`.check-count` text).
  - Repro (b): after that interaction, click Reset → all four badges back to **0**,
    `.cd-node` elements carry no `flash` class (checked via `className` read on all
    four nodes).
  - Regression check for the fix itself: Reset → trigger again → Default badges show
    **1** again (not swallowed to 0, not phantom-doubled to 2) — rules out both a
    residual-state regression from removing `selfInflicted` and the original bug 2
    double-count.
  - Repeated/rapid real triggers: three separate real clicks on "Клик внутри карточки"
    on OnPush — D (each a distinct Playwright click, i.e. distinct macrotasks) → Default
    A/B and OnPush — D all end at exactly **3**; OnPush — C (never touched) stays at
    **0** throughout. (Three *synchronous* same-tick `.click()` calls via
    `page.evaluate` instead coalesce into a single real Angular CD pass — verified this
    is a property of the zoneless scheduler batching multiple signal writes before its
    next check, not an artifact of this fix: only one `ownClicks` signal write settles
    before Angular schedules, so only one real check happens to count.)
  - No console errors during any of the above.

## Files touched

- `tools/sandbox/templates/change-detection/__name__.ts` — both child components
  simplified (removed local counter/flash/heuristic state), main component gained
  `nodeCounts`/`nodeFlashing`/`nodeCumulativeCounts`/`flashTimers` + `pulseFlash()`,
  `finalizePass()` now folds real checks into the authoritative count, `reset()` clears
  the new state.
- `tools/sandbox/templates/change-detection/__name__.html` — added `[count]`/
  `[flashing]` bindings on both `<cd-node-default>`/`<cd-node-onpush>` usages; updated
  one legend bullet describing how "checked N times" is now computed.
- `docs/progress/task-stage3-change-detection.md` — this file (new).

`AGENTS.md` in the template folder — updated two "Ловушки" bullets that described the
now-removed per-child `pendingChecks`/`selfInflicted` buffering (including the "5 quick
clicks" empirical note, which was about the old mechanism) to instead describe the
parent-authoritative `count`/`flashing` mechanism and point at this doc for the full
bug writeup. The rest of the architecture description (replay/recorder model, `passOpen`
window) is unchanged and still accurate.
