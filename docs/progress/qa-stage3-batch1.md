# QA — Stage-3 Replay Model, Batch 1 (this-demo, proto-demo, clo-demo)

Date: 2026-07-05
Method: live Playwright MCP browser session against http://localhost:4200 (dev server). No code edits made.

Overall: **PASS** — all 3 demos, all 15 checks PASS, 0 console errors on every demo.

## Demo 1 — this-demo (http://localhost:4200/s/this-demo)

1. PASS — Page renders rule-ladder ("Лестница правил") + prediction card ("Предскажи результат") with 4 chips. Picked chip "Новый экземпляр Ctor — new игнорирует bind" before running.
2. PASS — Clicked «Запустить»: real code executed all 9 calls, "записано шагов: 9" shown, stepper (Шаг→ / ▶ Авто / ⟲ Сначала, "N / 9") appeared. Stepped 3 steps via Шаг→; at step 3/9 the ladder highlighted rule "2. bind" with text `const bound = f.bind(other); bound()` → `this = obj{ label: "other" }`, matching the executed-steps list (`new`, `new`, `bind`) — real per-step this values shown, not fabricated.
3. PASS — Verdict card showed "Верно ✓ / Правильный ответ: Новый экземпляр Ctor — new игнорирует bind" with explanation. The recorded step 2 (`new (Ctor.bind(other))('new+bind')`) actually resolved via rule "new", i.e. a fresh Ctor instance — consistent with the verdict text.
4. PASS — Reset cleared the stepper entirely (list/controls disappeared, "Нажми Запустить..." placeholder returned) and re-enabled the 4 prediction chips (no `disabled`/`pressed`).
5. PASS — Console errors since load/interactions: 0 (`browser_console_messages` since last navigation returned 0 errors).

## Demo 2 — proto-demo (http://localhost:4200/s/proto-demo)

6. PASS — Prototype-chain levels rendered: dog → Dog.prototype → Animal.prototype → Object.prototype → null, each listing own properties (dog: name; Animal.prototype: speak; Object.prototype: hasOwnProperty/isPrototypeOf/.../toLocaleString). Property picker buttons present: name / speak / toString / fly.
7. PASS — Selected `speak`, predicted "Animal.prototype", clicked «Запустить» → "записано шагов: 3", verdict "Верно ✓ / Правильный ответ: Animal.prototype" — found level = Animal.prototype, matches.
8. PASS — Clicked «+ добавить dog.speak (своё свойство)» → button label switched to «Убрать dog.speak (снять затенение)» and `dog` level's own-props list gained `speak`. Computed style check: `color: rgb(138, 90, 19)` (dark brownish) on `background-color: rgb(255, 251, 235)` (light cream) — matches required dark-text-on-cream, not white-on-orange. Re-selected prediction "dog", re-ran → "записано шагов: 1", verdict "Верно ✓ / Правильный ответ: dog" — found level now = dog (level 0), confirming shadowing works.
9. PASS — Selected `fly`, predicted "не найдётся (undefined)", ran → "записано шагов: 5" (walks all 4 levels to null), verdict "Верно ✓ / Правильный ответ: не найдётся (undefined)".
10. PASS — Console errors: 0.

## Demo 3 — clo-demo (http://localhost:4200/s/closures) — actual route http://localhost:4200/s/clo-demo

11. PASS — Counters (Demo 1 within page): clicked Increment Alpha ×2 → Alpha record `{count: 2}`; clicked Increment Beta ×1 → Beta record went from its initial `{count: 10}` to `{count: 11}` (Beta was seeded at start=10, not 0). Records are independent — Alpha's clicks never affected Beta's box and vice versa. Note: absolute numbers differ from the checklist's illustrative "Alpha=2, Beta=1" only because Beta's demo seed starts at 10, not 0; the independence property itself is verified.
12. PASS — var vs let: predicted "3, 3, 3", clicked «Запустить» → "записано шагов: 13", stepper appeared with control "var: 3, 3, 3 · let: 0, 1, 2" and verdict "Верно ✓ / Правильный ответ: 3, 3, 3". Ran to completion (13/13 via Авто): environment-record boxes showed exactly one shared `запись var-loop (общая) {i: 3}` ("захвачена: 3 стрелочных функций — одна и та же запись") plus three separate `запись iteration #0/#1/#2` boxes showing `{i: 0}`, `{i: 1}`, `{i: 2}` respectively. Step log confirms real semantics (var: итерация 0/1/2 → цикл завершён i=3; let: итерация 0/1/2 создают новые записи; then 3 var-timeouts all read the shared i=3, and 3 let-timeouts each read their own iteration value). Verdict matches real output (var prints 3,3,3; let prints 0,1,2).
13. PASS — Code snippets are real `<pre>`/`<code>` text nodes (`getComputedStyle(el).userSelect === "auto"`, textContent length 245 chars for the first `<pre>` block), not images/canvas.
14. PASS — Module/IIFE demo: filled Товар="Книга", Цена=500, clicked «Добавить в корзину» → module record updated to `{items: 1 шт., total: 500 ₽}`. Clicked «Попробовать прочитать items снаружи» → displayed a real, code-formatted result: `cartStore.items === undefined — снаружи видно только публичное API (add, total, count)` (not a static/fake claim — reflects the actual cartStore state after the add).
15. PASS — Console errors: 0.

## Console notes

Some pre-existing console errors were observed via `all: true` history (NG04002 no-route-match for `s/loop-demo`, and 404s against `localhost:4300/s/cd-demo`, `/favicon.ico`, `/`) — these predate this QA session's navigations (different port 4300, different route not covered by this batch) and are unrelated to the 3 demos tested. Per-demo checks used console messages scoped to "since last navigation," which showed 0 errors for this-demo, proto-demo, and clo-demo.

## Conclusion

this-demo: PASS (5/5 checks)
proto-demo: PASS (5/5 checks)
clo-demo: PASS (5/5 checks)

No failures found. No code changes made during this QA pass.
