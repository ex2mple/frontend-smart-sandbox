# Task: Server recursive template copy

**Status:** DONE

## What changed

`tools/sandbox/server.mjs` only.

### Helper added

`async function copyTemplateTree(srcDir, destDir, name, vars)` inserted in the new
"Recursive template copy" section above the security helpers.  
It uses `fs.readdir(dir, { withFileTypes: true })` and recurses into subdirectories.
For each file it:
1. Replaces `__name__` in every path segment.
2. Calls `assertUnderRoot` before writing.
3. Creates intermediate directories with `fs.mkdir(..., { recursive: true })`.
4. Reads the template file, calls `renderTemplate(content, vars)`, writes the output.

### Create handler block replaced

The previous flat `fs.readdir` + `Promise.all(templateFiles.map(...))` block was
replaced with a single call:

```js
await copyTemplateTree(templateDir, generatedTarget, name, vars);
```

`vars` is still built the same way: `{ name, className, selector, title }`.

## Verification

- `node --check tools/sandbox/server.mjs` → exit 0
- Self-contained `/tmp/sb_copytest.mjs` test → PASS (all 5 assertions)
  - `my-test.ts` contains `class MyTest {}`
  - `my-test.routes.ts` content correct
  - `pages/overview/overview.ts` contains `selector: "sb-my-test-overview"`
  - `__name__.ts` correctly absent
  - `__name__.routes.ts` correctly absent
