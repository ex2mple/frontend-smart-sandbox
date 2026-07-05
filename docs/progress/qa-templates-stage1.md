# QA — Stage 1 fundamentals visualizer templates (browser live QA)

Date: 2026-07-05
App: http://localhost:4200 (Angular dev server)
Tool: Playwright MCP (browser_navigate / browser_run_code_unsafe / browser_snapshot / browser_console_messages)

Overall verdict: **PASS (11/11)**. No console errors (NG0xxx, template errors) observed on any of the 6 pages. All timing/flash/counter contracts held.

## /s/sig-demo (signals)

1. **PASS** — Page renders: heading "sig-demo", dependency graph visible (a, b → sum → doubled → effect nodes with live values a:1, b:2, sum:3, doubled:6, effect runs:1 on load). Console: 0 errors, 0 warnings (7 messages total, all info/HMR noise).
2. **PASS** — Clicked "+" for signal a (1→2). Sampled `.node--flash` count every ~70ms: `[0, 4, 4, 4, 4, 0]` over the first ~350ms — flash appeared within ~70ms and cleared by 350ms (4 nodes flashed: a itself + sum + doubled + effect, satisfying "sum AND doubled AND effect flash"). Values after click: a=2→3 (second click), sum=4→5, doubled=8→10, effect runs=2→3 (incremented by exactly 1 per click, glitch-free).
3. **PASS** — Clicked no-op button (`a.set(a())`). Sampled `.node--flash` 7× over ~420ms: all `0`. `dl` values (A/B/SUM/DOUBLED/EFFECT RUNS) identical before and after (3/2/5/10/3) — effect counter did NOT increment. Key contract confirmed: no-op produces zero flashes.
4. **PASS** — 1000ms after the no-op click, `.node--flash` count = `0`. No stuck flash.

## /s/di-demo (di-tree)

5. **PASS** — Grandchild card:
   - Plain `inject(TokenService)` row: badge `#2` ("из ближайшего инжектора Branch (#2)").
   - `skipSelf` row: badge `#2` also, note reads: *"тот же #2! @SkipSelf пропускает только СВОЙ инжектор (у Grandchild он пуст) → поиск идёт вверх и находит провайдер Branch. Ловушка: skipSelf ≠ «пропустить ближайшего предка»"* — same instance number as plain inject, explicitly says "Ловушка" (trap), does NOT say "получил Root". Confirmed correct.
   - Branch card's own `skipSelf` row shows `#1` with note explaining it resolves to Root because Branch's own provider is skipped and no other provider exists until Root — as expected.
   - Console: 0 errors, 0 warnings.

## /s/loop-demo (event-loop)

6. **PASS** — Clicked Run: output `1 sync "sync 1" / 2 sync "sync 2" / 3 microtask "promise .then" / 4 microtask "queueMicrotask" / 5 macrotask "timeout"`. Clicked Run again (no reset): numbering restarted at 1, identical sequence — no cumulative counter bleed-through.
7. **PASS** — Reset, clicked "+ sync log", clicked Run: output `1 sync 1 / 2 sync 2 / 3 sync "extra sync #1" / 4 microtask .then / 5 microtask queueMicrotask / 6 macrotask timeout`. Extra sync line correctly appended AFTER "sync 2", not between "sync 1" and "sync 2".
   - Console: 0 errors, 0 warnings.

## /s/this-demo (this-binding)

8. **PASS** — Clicked "Запустить все" (Run all). Results per row:
   - Row 1 `obj.method()` → `obj{ label: "primary" }` (obj).
   - Row 2 detached `f()` → `undefined`.
   - Row 3 `f.call(other, 'call')` → `obj{ label: "other" } + арг. "call"`.
   - Row 4 `f.apply(other, ['apply'])` → `obj{ label: "other" } + арг. "apply"` — differs visibly from row 3 only in the arg text (call vs apply), both correctly show `other`.
   - Row 5 `bind` → `obj{ label: "other" }`.
   - Row 6 arrow fn → `component (ThisDemo)`.
   - Row 7 `[1].forEach(f)` → `undefined`.
   - Console: 0 errors, 0 warnings. All rows truthful, no errors.

## /s/clo-demo (closures)

9. **PASS** — var-functions run: result `3, 3, 3` with note *"(все вернули 3 — замкнули одну общую переменную)"* — matches derived-wording requirement. let-functions run: result `0, 1, 2` with note *"(разные значения — у каждой итерации своя привязка)"* — each iteration has its own binding.
10. **PASS** — Clicked "Попробовать прочитать items снаружи": in-page note appeared truthfully: *"cartStore.items === undefined — снаружи видно только публичное API (add, total, count)"*. No thrown error, no console error.

## /s/proto-demo (prototype-chain) — sanity only

11. **PASS** — Page renders; chain diagram visible: rex → dog → animal → Object.prototype → null, each level listing its own properties. Clicked "kind" quick-lookup button: walk trace correctly showed `rex (not own) → dog (not own) → animal (← found)`, banner read "rex.kind found on animal". Console: 0 errors, 0 warnings.

## Console error summary (all pages)

| Page | Errors | Warnings |
|---|---|---|
| sig-demo | 0 | 0 |
| di-demo | 0 | 0 |
| loop-demo | 0 | 0 |
| this-demo | 0 | 0 |
| clo-demo | 0 | 0 |
| proto-demo | 0 | 0 |

No NG0xxx, no template errors, no uncaught exceptions on any of the 6 pages. Only info-level messages (Vite/HMR connection logs and the in-app dev log console's own output), which are expected/harmless per the QA brief.
