# QA — Stage-3 Replay Model, Batch 2a (life-demo, sig-demo)

Date: 2026-07-05
Method: live Playwright MCP browser session against http://localhost:4200 (dev server). No code edits made, no commits.

Overall: **life-demo 8/9 PASS (1 FAIL)**, **sig-demo 5/5 PASS**.

## Demo 1 — life-demo (http://localhost:4200/s/life-demo)

1. **PASS** — Picked chip "2 раза", clicked «Mount child» → "записано шагов: 9" (bounded, within the ~8-15 target). Step 1/9 is an `ACTION` step: "Mount — Пользователь монтирует дочерний компонент — создаётся новый экземпляр".
2. **PASS** — Screenshot confirms the mounted child renders as a visibly bordered card ("Child component #1  inputValue = 0" inside a solid-border box with padding/background), clearly distinguished from the surrounding dashed "Child component area" container — not unstyled plain text.
3. **FAIL** — Stepped through the entire timeline (9 mount steps, then a full 20-step timeline after one Increment, then 45/50 across two more Increments and Unmount). No `×N` collapse badge ever appeared on any row. Each hook occurrence (`ngDoCheck`, `ngAfterContentChecked`, `ngAfterViewChecked` recurring across the 3 CD passes triggered by one Increment click) was listed as its own separate single-hook row, e.g. steps 10-18 after Mount show `ngDoCheck` / `ngAfterContentChecked` / `ngAfterViewChecked` repeating 3 times as 9 separate rows, not collapsed into a `×N` row. The category totals panel does show aggregate counts (e.g. "Init/Change: 8"), but that is a separate running-total widget, not the per-row collapse described in the check. Evidence: full-page screenshot `life-demo-increment-full.png` (20/20 steps) shows no `×` marker anywhere except in the static help text ("шаг «×N»").
4. **PASS** — Step badges are colored by category (verified visually across step-through screenshots): `ACTION` filled solid indigo; `INIT-CHANGE` lavender/indigo-tint pill; `CONTENT` green-tint pill; `VIEW` amber-tint pill. Category-totals cards also carry matching left-border accent colors (indigo/green/amber/red for Init-Change/Content/View/Destroy).
5. **PASS** — With chip "2 раза" selected, clicked «Increment input» → verdict appeared: "Не угадал ✗ / Правильный ответ: 1 раз" with explanation text.
6. **PASS** (confirmed programmatically) — Clicking «Increment input» again: a `browser_evaluate` probe sampling all 4 chip buttons' `disabled` state every 20ms showed they go from `disabled=true` → `disabled=false` (briefly clickable, ~60-80ms window) → `disabled=true` again once the fresh verdict locks in. Confirms the card genuinely reopens for a new run rather than reusing a static state.
7. **PASS** — Clicked «Unmount child»: the prediction card's verdict paragraphs ("Не угадал ✗" / "Правильный ответ: ...") disappeared entirely and all 4 chips returned to enabled/unpressed — no stale revealed verdict about the prior Increment remained.
8. **PASS** — Navigated to Dashboard via the back link, then re-navigated to `/s/life-demo`: "записано шагов: 0", child area shows "Child unmounted", category totals all reset to 0. Clicked «Mount child» again → child rendered as "Child component **#1**" (not #2), confirming no state leaked across the visit boundary.
9. **PASS** — `browser_console_messages` (scoped since last navigation) returned 0 errors, 0 warnings throughout. (One unrelated `chrome-error://chromewebdata` 400 appeared in the full-session history tied to no app resource — treated as noise per instructions, not a real app error.) Timeline was static/unchanging whenever idle between actions.

## Demo 2 — sig-demo (http://localhost:4200/s/sig-demo)

10. **PASS** — Dependency graph renders `a`, `b` → `sum = a + b` → `doubled = sum × 2` → `effect (side effect)`, each computed/effect node showing a live recompute counter (`×1` initially, `ran 1×` for the effect).
11. **PASS** — Picked chip "1", clicked «Обновить A и B» (which set a: 1→4, b: 2→6 in one synchronous handler): `sum`'s recompute counter went from `×1` to `×2` — exactly +1 (glitch-free, not +2 despite two `set()` calls). `doubled` and `effect` also each moved by exactly +1. The verdict card marked chip "1" with a green outline ring as the correct/actual answer, and text confirmed "Правильный ответ: 1".
12. **PASS** — Verified step-badge colors via computed styles (`getComputedStyle`), not just visual impression (amber and green look similar in compressed screenshots): `action` → `background: rgb(79,70,229)` (solid indigo) with white text; `set` → `background: rgba(79,70,229,0.1)` indigo-tint with indigo text; `recompute` → `background: rgba(4,120,87,0.1)` green-tint with green text; `effect` → `background: rgb(255,251,235)` (amber/cream) with `rgb(138,90,19)` brown-amber text. All 4 categories are visually and programmatically distinct — not all grey.
13. **PASS** — "Снимок графа на текущем шаге записи" (snapshot panel) shows live entries for `a`, `b`, `sum`, `doubled`, `effect`. Stepping the replay onto the `SET a = 4` step highlighted the `a` entry with a visible border ring; stepping onto `SET b = 6` moved the highlight border to the `b` entry — confirmed via full-page screenshots at steps 2/7 and 3/7.
14. **PASS** — Clicked «Reset»: the verdict block, snapshot panel, and stepper controls were all removed and replaced by the placeholder prompt ("Нажми «Обновить A и B» — появится запись..."); all 4 prediction chips returned to enabled/unpressed. `browser_console_messages` (since last navigation) returned 0 errors.

## Conclusion

- **life-demo: 8/9 PASS.** Only failure is check 3 — the "consecutive check-hooks collapsed with ×N badge" behavior described in the spec was not observed anywhere in a 50-step recorded timeline spanning Mount + 3× Increment + Unmount; every hook firing (including 3 back-to-back CD passes after each Increment) is rendered as an individual row.
- **sig-demo: 5/5 PASS.** Graph, glitch-free recompute counting, colored stepper badges, snapshot-panel highlighting, and Reset all work as specified; 0 console errors.
