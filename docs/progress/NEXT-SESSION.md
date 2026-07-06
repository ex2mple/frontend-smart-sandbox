# Next-session handoff

> Read this first. It tells you **what we are doing now** and **what is left**, so you can pick up with zero archaeology. Per-task implementation logs live alongside this file under `docs/progress/`.

**Last updated:** 2026-07-06 · branch `feat/sandbox-mvp` · **repo is now public: https://github.com/ex2mple/frontend-smart-sandbox**

---

## Current goal

**The planned roadmap is COMPLETE.** Pedagogy redesign (all 3 stages), `create` cleanup-on-failure, and the GitHub showcase are done. No confirmed open tasks remain — only the optional Playwright item below.

## Where we are (known-good checkpoint)

Everything is committed and pushed; `ng build` + `test:codegen` 24/24 + `test:devtools` 13/13 + `test:shared` 25/25 green **both locally and in GitHub Actions on a fresh clone**.

- **GitHub showcase — DONE 2026-07-06.** Public repo `ex2mple/frontend-smart-sandbox` (default branch `main`, fast-forwarded to `feat/sandbox-mvp`; both branches pushed). Russian README (rewritten from CLI boilerplate) + ROADMAP.md + MIT LICENSE (© 2026 Anton Braude) + CI workflow (`.github/workflows/ci.yml`, name `CI`: node 24, npm ci → build → the 3 test suites, `permissions: contents: read`, actions v5). Commits: `155972f` (docs), `64052ab` (license/CI/gitignore), `332baad` (actions v5 bump — v4 triggers a node-20 deprecation annotation). First CI run: success, all steps green. Written by 2 agents, fact-checked by an independent reviewer (1 fix: Node version claim → "20.19+, 22.12+ или 24+"); logs: [`task-github-showcase-docs.md`](task-github-showcase-docs.md), [`task-github-showcase-ci.md`](task-github-showcase-ci.md).
  - Pre-publish secret scan of all 45 commits: clean (the only "hit" was the substring `sk-sta…` of the filename `task-stage3-change-detection` — a false positive). `.gitignore` now has `.env` / `.env.*` / `!.env.example` rules.
  - Push during `gh repo create` did NOT trigger CI and left the default branch wrong — had to `gh repo edit --default-branch main` (via API PATCH; the CLI flag silently didn't stick) and `gh workflow run CI --ref main` to get the first run. Push-triggered runs work after that.
  - `git checkout main` is blocked locally by the skip-worktree routes file — move main with `git branch -f main feat/sandbox-mvp` and push without switching.
- **`create` cleanup-on-failure — DONE 2026-07-06, commit `3b87643`.** POST /sandbox-api/create wraps mkdir→rebuildRoutes in try/catch: on any failure the partially-written `generated/<name>` folder is removed (best-effort) and the original error rethrown (outer handler still maps to 500). Permanent env-gated fault-injection hook: run the server with `SANDBOX_FAIL_CREATE=1` to test the cleanup path. Verified live both ways (injected failure → 500 + no folder; happy path → 201 → DELETE → 200). Reviewer: sound; also confirmed **fresh-clone viability** (server `mkdirSync`s `generated/`+`saved/` on startup; routes file written atomically via tmp+rename). Log: [`task-create-cleanup.md`](task-create-cleanup.md).
- **Visualizer pedagogy redesign (stages 1–3) — DONE 2026-07-05.** All 8 templates on the replay model, live-QA'd all-PASS. Details and the notable-findings list: git history of this file (`git log -p docs/progress/NEXT-SESSION.md`, state at `b1465ca`) and the QA logs `qa-templates-stage1.md`, `qa-stage3-batch*.md`. Key commits: stage 1 `5e0333b`/`9df2687`/`f76d12d`, stage 2 primitives `4e2a20e`, pilot `9de4062`, rollout `513027e`/`eedaf62`/`fdfa1f7`/`6563d93`/`dbb47ca`/`06a575a`/`5b89cb9`/`7296f91`.
- Local dev note: nothing is left running on :4200/:4300 (a stale sandbox server was killed during verification on 2026-07-06). Local demo sandboxes in `generated/` are untouched.

## What's left

1. Optional, offered but not confirmed by user: add `playwright` as a devDependency + helper script so QA agents can run parallel independent browsers (today only ONE agent may drive the shared Playwright MCP browser).
2. Showcase niceties (from ROADMAP.md, no commitment): screenshots/GIFs in README; new visualizer topics.

> Dropped 2026-07-05 per user: **Monaco editor + live preview** is out of the plans — do not re-add.

## How to work here (standing agreements)

- **Use subagents** for non-trivial dev (fan-out + delegate), then `post-agent-code-review`, then `parallel-agent-qa`. Writer agents never commit — the orchestrator commits by zone after review. QA: only ONE agent drives the shared Playwright browser.
- **Zoneless instrumentation rule**: never write signals synchronously during CD (hooks/render/computed bodies) — buffer + single `queueMicrotask` flush; educational templates must run REAL code, never fake results, and result-describing UI text must be computed from actual results.
- **Never** touch `sandbox.routes.generated.ts` (skip-worktree + guards); **never** `import.meta.glob` the sandbox dirs; generated styles consume `--sb-*` tokens.
- Codegen ICU gotcha: literal `{` in template text parses as ICU — wrap in `{{ '…{…}…' }}`.
- To regenerate demos: `curl -X POST :4300/sandbox-api/wipe` then `create` per template; a single sandbox can be removed via `DELETE /sandbox-api/:name`. Before QA: kill stale node on :4200/:4300 (`EADDRINUSE` kills `ng serve` via concurrently -k).
- The repo is PUBLIC now — anything committed is visible. Secret-guard hook active: refer to secrets by env-var NAME only; `.env*` is git-ignored.
