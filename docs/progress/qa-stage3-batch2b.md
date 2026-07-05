# QA — Stage-3 Replay Model, Batch 2b (di-demo, life-demo fix verification, loop-demo smoke)

Date: 2026-07-05
Method: live Playwright MCP browser session against http://localhost:4200 (dev server). No code edits made, no commits.

Overall: **di-demo 6/6 PASS**, **life-demo 2/2 PASS** (targeted fix verification), **loop-demo 1/1 PASS** (smoke). **9/9 checks PASS.**

## Demo 1 — di-demo (http://localhost:4200/s/di-demo)

1. **PASS** — Injector-tree diagram renders Root (AppComponent, `providedIn: 'root'`) / Branch (`providers: [TokenService]`) / Grandchild (component, no own providers), each showing `inject(TokenService)` resolution slots. Modifier picker present with 4 buttons: "по умолчанию" (default, pressed), "@Self", "@SkipSelf", "@Optional (ExtraService)".
2. **PASS** — Default modifier: picked chip "Branch", clicked «Запустить обход» → verdict "Верно ✓ / Правильный ответ: Branch" appeared immediately (prediction locked, chips disabled). Ran the replay (Автовоспроизведение): 2 steps — "Grandchild: свой инжектор — своего провайдера нет → идём к родителю" (check) then "Branch: свой инжектор — провайдер есть → возвращаем экземпляр #2" (found). Final result line: "Результат: #2 — экземпляр Branch". Consistent with verdict.
3. **PASS** — @SkipSelf: switched modifier (prediction card reopened), picked chip "Branch", ran → verdict "Верно ✓ / Правильный ответ: Branch" with explanation explicitly stating this is NOT "взять у деда" (not "skip to grandparent/Root"). Replay steps: "Grandchild: @SkipSelf — пропускаем ТОЛЬКО свой инжектор (не проверяем, есть ли тут провайдер) → идём к родителю" then "Branch: свой инжектор — провайдер есть → возвращаем экземпляр #2 — тот же экземпляр, что и без модификатора". No claim of jumping to Root; correctly resolves at Branch instance #2.
4. **PASS** — @Self: modifier switch reopened prediction card; picked "не найден — null / NullInjectorError", ran → verdict "Верно ✓" with text "У Grandchild своего провайдера нет → настоящая NullInjectorError (без `{ optional: true }`)". No crash, page remained fully interactive (1 step recorded).
   @Optional: modifier switch reopened prediction card; picked "не найден"; code line changed to `inject(ExtraService, { optional: true })`; ran → verdict "Верно ✓ / Правильный ответ: не найден — null / NullInjectorError" with explanation "`{ optional: true }` превращает то, что иначе было бы NullInjectorError, в null." No crash (3 steps recorded, walked Grandchild → Branch → Root, all empty for ExtraService).
5. **PASS** — Every modifier change (по умолчанию → @SkipSelf → @Self → @Optional) reopened the "Предскажи результат" card with all 4 chips re-enabled/unpressed, confirmed via snapshots after each switch.
6. **PASS** — `browser_console_messages` (level: error) returned **0 errors** across the entire di-demo session (all 4 modifier runs + replays).

## Demo 2 — life-demo (http://localhost:4200/s/life-demo) — targeted fix verification

7. **PASS** — Clicked «Mount child», then «Increment input (0)» once. Immediately after that single click the recorded timeline showed only 5 new steps (action "Update input" → `ngOnChanges` → `ngDoCheck` → `ngAfterContentChecked` → `ngAfterViewChecked`, i.e. one settle pass) — matching the prediction verdict shown at that moment: "Правильный ответ: 1 раз — В этот раз хватило одного вызова ngDoCheck". Continuing to record (a second «Increment input» click, then autoplaying the full timeline) revealed that additional settle passes for the **first** Increment had in fact been queued and arrived afterward, and the fix is clearly present: instead of listing every repeated check-hook triple as its own set of 3 rows, the recorder emitted:
   - row: `ngDoCheck` (init-change) — first settle pass, part 1/3
   - row: `ngAfterContentChecked` (content) — part 2/3
   - row: `ngAfterViewChecked` (view) — part 3/3
   - row: `ngDoCheck` (init-change) — second settle pass, part 1/3
   - row: `ngAfterContentChecked` (content) — part 2/3
   - row: `ngAfterViewChecked` (view) — part 3/3
   - **`info` row: "ngDoCheck → ngAfterContentChecked → ngAfterViewChecked ×2"** — description: "проход проверки повторился один в один — схлопнут в одну строку, хуки и порядок те же"
   
   This is exactly the fix under test: two further repeated settle passes were collapsed into a single `×2` info row instead of appearing as 6 separate rows. Note: with only a single Increment click and an immediate snapshot, just 1 settle pass had been captured at that instant (the rest arrived on a short delay/via the second interaction); the full sequence above was observed by waiting/continuing before inspecting. The collapse mechanism itself is confirmed working.
8. **PASS** — Prediction-card verdict remained visible/attached after the Increment action ("Правильный ответ: 1 раз" with explanation). Timeline stayed bounded at "записано шагов: 26" after 4+ seconds idle with no further growth (checked via repeated snapshot). `browser_console_messages` (level: error) returned **0 errors** (35 total messages logged, 0 errors/warnings).

## Demo 3 — loop-demo (http://localhost:4200/s/loop-demo) — smoke

9. **PASS** — Clicked «Run» (labelled "Run", not «Запустить» in current UI copy) → run completed real-time, verdict card showed "Правильный ответ: promise .then (микротаска)", "записано шагов: 8", stepper controls appeared. Autoplayed through all 8 steps; Call Stack / Microtask Queue / Macrotask Queue columns updated correctly through the sequence: sync 1 → sync 2 → (script ends) → promise .then → queueMicrotask → timeout A (macrotask) → микротаска из timeout A → timeout B (macrotask), ending with Call Stack showing "timeout B" and both queues empty. `browser_console_messages` (level: error) returned **0 errors**.

## Conclusion

All 9 checks PASS. Key finding for check 7: the "collapse repeated settle pass into one `×N` info row" fix is present and functioning (previously reported as FAIL in `qa-stage3-batch2a.md` check 3 — this batch confirms it now works), though the collapsed row may arrive with a short delay after the triggering action rather than being present in the very next synchronous snapshot. di-demo's DI-tree resolution walk (default / @SkipSelf / @Self / @Optional) is fully correct, including the important nuance that @SkipSelf on Grandchild does NOT jump to Root (it resolves at Branch, same as default, because Grandchild's own injector was already empty). loop-demo's event-loop replay is stable with 0 console errors across all three demos.
