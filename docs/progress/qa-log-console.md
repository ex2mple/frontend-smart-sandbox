# QA: Dev Log Console
Date: 2026-06-20

## Results

| # | Check | Status | Evidence |
|---|-------|--------|----------|
| 1 | Absent on dashboard | PASS | Snapshot of / shows no `button.sbc-fab` and no `section.sbc` in the DOM |
| 2 | Sandbox renders + FAB | PASS | /s/test redirects to /s/test/overview; multipage content (Overview page, nav tabs) renders; "← Dashboard" link present; `button.sbc-fab` labeled "Console" with badge "2" present |
| 3 | Count badge while closed | PASS | After emitting 5 console calls, `.sbc-fab__count` shows "7" (2 pre-existing + 5 new = 7 ≥ 5) |
| 4 | Open dock | PASS | `section.sbc` (complementary "Sandbox log console") present after clicking FAB; level chips (debug/info/warn/error all aria-pressed=true), search input, autoscroll checkbox, Copy/Export/Clear/✕ buttons all present |
| 5 | Entries render | PASS | total=7, hasWarn=true ("qa warn msg"), hasError=true ("qa error msg") |
| 6 | Row expand/collapse | PASS | First row: aria-expanded="true" + hasDetail=true after click; aria-expanded="false" + hasDetail=false after second click |
| 7 | Object inspector | PASS | hasTree=true (app-log-value-tree present in qa obj entry), hasObjectObj=false (no "[object Object]" fallback) |
| 8 | Level filter | PASS | Clicking "error" chip: aria-pressed "true"→"false", entries 7→6; clicking again: aria-pressed "false"→"true", entries back to 7 |
| 9 | Search | PASS | Typing "qa warn" narrowed to 1 entry (< 5); clearing input restored 7 entries |
| 10 | Copy / Export don't crash | PASS | Copy clicked — dock remained intact. Export triggered download of sandbox-logs.txt — dock remained intact |
| 11 | Clear | PASS | entryCount=0, emptyMsg=true ("No logs match" shown after clearing) |
| 12 | Uncaught error EXACTLY ONCE | PASS | count=1; "qa-uncaught-once" appears exactly once in the dock |
| 13 | Native passthrough | PASS | "qa error msg" found in real browser console at ERROR level |

## Defects found
- none
