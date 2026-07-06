# Task: Cleanup-on-failure for POST /sandbox-api/create

**Status:** DONE

## What changed

`tools/sandbox/server.mjs` only, inside the `POST /sandbox-api/create` handler.

### Try/catch around mkdir → rebuildRoutes

The block from `fs.mkdir(generatedTarget, { recursive: true })` through
`await rebuildRoutes()` is now wrapped in a `try { ... } catch (err) { ... }`.

On error, the catch:
1. Best-effort removes the partially-written folder:
   `await fs.rm(generatedTarget, { recursive: true, force: true })`.
2. If the `rm` itself throws, logs it with `console.error` and continues
   (never masks the original failure).
3. Rethrows the original `err` so the existing outer handler (line ~533,
   unchanged) still returns its 500 response and logging.

No `rebuildRoutes()` call was added to the cleanup path — routes are only
rebuilt as the last step of a successful create, so a failed create never
made it into the routes file in the first place.

### Fault-injection hook

Added after `copyTemplateTree(...)` and before the `meta.json` write:

```js
if (process.env.SANDBOX_FAIL_CREATE === '1') {
  throw new Error('injected create failure (SANDBOX_FAIL_CREATE)');
}
```

Inert unless the env var is set to `'1'`; kept permanently to allow
re-verifying the cleanup path later without editing source.

## Verification

### 1. Codegen tests

```
npm run test:codegen
```

Result: `Tests  24 passed (24)` — unchanged from baseline.

### 2. Live check — fault-injected create (failure path)

Checked for a stale server first:

```
lsof -nP -iTCP:4300 -sTCP:LISTEN
```
→ found a stale `node` process (PID 74476) already listening on 4300; killed it
(`kill 74476`), confirmed port free.

Started server with fault injection enabled, then created a sandbox:

```
SANDBOX_FAIL_CREATE=1 node tools/sandbox/server.mjs &
curl -s -i -X POST localhost:4300/sandbox-api/create -H 'content-type: application/json' \
  -d '{"name":"cleanup-check-tmp","title":"Cleanup Check","template":"blank"}'
```

Result:
```
HTTP/1.1 500 Internal Server Error
{"error":"injected create failure (SANDBOX_FAIL_CREATE)"}
```

Then:
```
ls src/app/sandboxes/generated/ | grep cleanup-check-tmp
```
→ no output (folder absent), confirming cleanup ran.

### 3. Live check — happy path (unbroken)

Killed the fault-injection server, restarted without the env var:

```
node tools/sandbox/server.mjs &
curl -s -i -X POST localhost:4300/sandbox-api/create -H 'content-type: application/json' \
  -d '{"name":"cleanup-check-tmp","title":"Cleanup Check","template":"blank"}'
```

Result:
```
HTTP/1.1 201 Created
{"name":"cleanup-check-tmp","routePath":"/s/cleanup-check-tmp"}
```

`ls src/app/sandboxes/generated/ | grep cleanup-check-tmp` → `cleanup-check-tmp` present.

```
curl -s -i -X DELETE localhost:4300/sandbox-api/cleanup-check-tmp
```
Result: `HTTP/1.1 200 OK`, `{"ok":true}`.

`ls src/app/sandboxes/generated/ | grep cleanup-check-tmp` → no output (folder gone).

### 4. Teardown

Killed the server process started for this verification; confirmed with
`lsof -nP -iTCP:4300 -sTCP:LISTEN` → no output (port free, nothing left running).

No existing demo sandboxes were touched and `/sandbox-api/wipe` was never called.

## Surprises

- A stale sandbox server from a previous session was already occupying port
  4300 before this task started; it was killed per project convention before
  running the verification steps.
