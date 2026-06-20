/**
 * Frontend Smart Sandbox — companion dev server (port 4300).
 * Manages sandbox components by writing real files to disk so Angular's
 * Vite dev server can auto-reload them.
 *
 * Uses ONLY Node built-ins: node:http, node:fs/promises, node:path, node:url.
 */

import http from 'node:http';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  isValidName,
  kebabToClassName,
  selectorFor,
  renderTemplate,
  buildRoutesFile,
} from './codegen.mjs';

// ---------------------------------------------------------------------------
// Resolved paths
// ---------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const TEMPLATES_DIR = path.join(__dirname, 'templates');
const SANDBOX_DIR = path.join(REPO_ROOT, 'src', 'app', 'sandboxes');
const GENERATED_DIR = path.join(SANDBOX_DIR, 'generated');
const SAVED_DIR = path.join(SANDBOX_DIR, 'saved');
const ROUTES_FILE = path.join(SANDBOX_DIR, 'sandbox.routes.generated.ts');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Read a request body and parse it as JSON.
 * @param {http.IncomingMessage} req
 * @returns {Promise<unknown>}
 */
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new SyntaxError('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

/**
 * Send a JSON response.
 * @param {http.ServerResponse} res
 * @param {number} status
 * @param {unknown} data
 */
function json(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

/**
 * Humanize a template id into a label (e.g. 'blank' -> 'Blank').
 * @param {string} id
 * @returns {string}
 */
function humanizeLabel(id) {
  return id
    .split(/[-_]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// ---------------------------------------------------------------------------
// Scanning
// ---------------------------------------------------------------------------

/**
 * Read meta.json from a sandbox directory, or synthesize minimal meta.
 * @param {string} dir - absolute path to parent dir (GENERATED_DIR or SAVED_DIR)
 * @param {string} folderName - subdirectory name
 * @param {'generated'|'saved'} kind
 * @returns {Promise<{ name: string, title: string, template: string, kind: 'generated'|'saved', createdAt: string, routePath: string }>}
 */
async function readMeta(dir, folderName, kind) {
  const metaPath = path.join(dir, folderName, 'meta.json');
  try {
    const raw = await fs.readFile(metaPath, 'utf8');
    const meta = JSON.parse(raw);
    return {
      name: meta.name ?? folderName,
      title: meta.title ?? folderName,
      template: meta.template ?? 'unknown',
      kind: meta.kind ?? kind,
      createdAt: meta.createdAt ?? new Date(0).toISOString(),
      routePath: `/s/${meta.name ?? folderName}`,
    };
  } catch {
    // meta.json missing or unreadable — synthesize from folder name
    return {
      name: folderName,
      title: folderName,
      template: 'unknown',
      kind,
      createdAt: new Date(0).toISOString(),
      routePath: `/s/${folderName}`,
    };
  }
}

/**
 * Scan both sandbox directories and return all sandboxes.
 * @returns {Promise<Array<{ name: string, title: string, template: string, kind: 'generated'|'saved', createdAt: string, routePath: string }>>}
 */
async function scanSandboxes() {
  const results = [];

  for (const [dir, kind] of /** @type {[string, 'generated'|'saved'][]} */ ([
    [GENERATED_DIR, 'generated'],
    [SAVED_DIR, 'saved'],
  ])) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      entries = [];
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        results.push(await readMeta(dir, entry.name, kind));
      }
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Routes file rebuild
// ---------------------------------------------------------------------------

/**
 * Rescan sandboxes and atomically write the Angular routes file.
 */
async function rebuildRoutes() {
  const sandboxes = await scanSandboxes();
  const content = buildRoutesFile(sandboxes.map(({ name, kind }) => ({ name, kind })));
  const tmp = ROUTES_FILE + '.tmp';
  await fs.writeFile(tmp, content, 'utf8');
  await fs.rename(tmp, ROUTES_FILE);
}

// ---------------------------------------------------------------------------
// Template listing
// ---------------------------------------------------------------------------

/**
 * List available template ids from TEMPLATES_DIR.
 * @returns {Promise<string[]>}
 */
async function listTemplateIds() {
  let entries;
  try {
    entries = await fs.readdir(TEMPLATES_DIR, { withFileTypes: true });
  } catch {
    entries = [];
  }
  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

// ---------------------------------------------------------------------------
// Recursive template copy
// ---------------------------------------------------------------------------

/**
 * Recursively copy a template directory tree to a destination directory,
 * substituting `__name__` in path segments and rendering template variables
 * in file contents.
 *
 * @param {string} srcDir - absolute path to the template source directory
 * @param {string} destDir - absolute path to the output root (generatedTarget)
 * @param {string} name - the sandbox name (replaces `__name__` in path segments)
 * @param {{ name: string, className: string, selector: string, title: string }} vars - template variables
 */
async function copyTemplateTree(srcDir, destDir, name, vars) {
  const entries = await fs.readdir(srcDir, { withFileTypes: true });
  await Promise.all(
    entries.map(async (entry) => {
      const srcPath = path.join(srcDir, entry.name);
      const outSegment = entry.name.replace(/__name__/g, name);
      const outPath = path.join(destDir, outSegment);

      if (entry.isDirectory()) {
        // Recurse: pass the mapped subdirectory as the new destDir
        await copyTemplateTree(srcPath, outPath, name, vars);
      } else {
        // Security: output must be within the original generatedTarget (destDir's root)
        assertUnderRoot(outPath, destDir);
        await fs.mkdir(path.dirname(outPath), { recursive: true });
        const templateContent = await fs.readFile(srcPath, 'utf8');
        const rendered = renderTemplate(templateContent, vars);
        await fs.writeFile(outPath, rendered, 'utf8');
      }
    }),
  );
}

// ---------------------------------------------------------------------------
// Security: safe path resolution
// ---------------------------------------------------------------------------

/**
 * Assert that the resolved target path is inside the given root.
 * Throws a RangeError (caught as 400) if path traversal is detected.
 * @param {string} target - resolved absolute path
 * @param {string} root - resolved absolute root directory
 */
function assertUnderRoot(target, root) {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  if (!resolvedTarget.startsWith(resolvedRoot + path.sep) && resolvedTarget !== resolvedRoot) {
    throw new RangeError(`Path traversal detected: ${resolvedTarget}`);
  }
}

// ---------------------------------------------------------------------------
// Startup: ensure dirs exist and write initial routes file
// ---------------------------------------------------------------------------

// Synchronous mkdir to guarantee directories exist before listen
fsSync.mkdirSync(GENERATED_DIR, { recursive: true });
fsSync.mkdirSync(SAVED_DIR, { recursive: true });

// Synchronous initial routes file write so esbuild's first build doesn't see a missing import.
// We do a best-effort synchronous scan here (async scan + write happens after listen setup).
const _initialContent = buildRoutesFile([]);
const _tmp = ROUTES_FILE + '.tmp';
fsSync.writeFileSync(_tmp, _initialContent, 'utf8');
fsSync.renameSync(_tmp, ROUTES_FILE);

// ---------------------------------------------------------------------------
// Request router
// ---------------------------------------------------------------------------

/**
 * Main request handler.
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 */
async function handleRequest(req, res) {
  const urlObj = new URL(req.url ?? '/', `http://localhost:4300`);
  const pathname = urlObj.pathname;
  const method = req.method ?? 'GET';

  // All endpoints must be under /sandbox-api
  if (!pathname.startsWith('/sandbox-api')) {
    json(res, 404, { error: 'not found' });
    return;
  }

  try {
    // GET /sandbox-api/list
    if (method === 'GET' && pathname === '/sandbox-api/list') {
      const sandboxes = await scanSandboxes();
      json(res, 200, sandboxes);
      return;
    }

    // GET /sandbox-api/templates
    if (method === 'GET' && pathname === '/sandbox-api/templates') {
      const ids = await listTemplateIds();
      const templates = ids.map((id) => ({ id, label: humanizeLabel(id) }));
      json(res, 200, templates);
      return;
    }

    // POST /sandbox-api/create
    if (method === 'POST' && pathname === '/sandbox-api/create') {
      let body;
      try {
        body = await readBody(req);
      } catch {
        json(res, 400, { error: 'Invalid JSON body' });
        return;
      }

      const { name, title, template } = /** @type {any} */ (body);

      // Validate name
      if (!isValidName(name)) {
        json(res, 400, { error: 'Invalid name: must match /^[a-z][a-z0-9-]*$/' });
        return;
      }

      // Validate title
      if (!title || typeof title !== 'string' || title.trim() === '') {
        json(res, 400, { error: 'title is required and must be a non-empty string' });
        return;
      }

      // Validate template
      const templateIds = await listTemplateIds();
      if (!templateIds.includes(template)) {
        json(res, 400, { error: `Unknown template: ${template}` });
        return;
      }

      // Check for duplicates (security: validate before path operations)
      const generatedTarget = path.join(GENERATED_DIR, name);
      const savedTarget = path.join(SAVED_DIR, name);
      assertUnderRoot(generatedTarget, GENERATED_DIR);
      assertUnderRoot(savedTarget, SAVED_DIR);

      const [generatedExists, savedExists] = await Promise.all([
        fs.access(generatedTarget).then(() => true).catch(() => false),
        fs.access(savedTarget).then(() => true).catch(() => false),
      ]);

      if (generatedExists || savedExists) {
        json(res, 409, { error: `Sandbox '${name}' already exists` });
        return;
      }

      // Create the component directory
      await fs.mkdir(generatedTarget, { recursive: true });

      // Render and write template files (recursive — handles subdirectories)
      const templateDir = path.join(TEMPLATES_DIR, template);
      const className = kebabToClassName(name);
      const selector = selectorFor(name);
      const vars = { name, className, selector, title };

      await copyTemplateTree(templateDir, generatedTarget, name, vars);

      // Write meta.json
      const meta = {
        name,
        title,
        template,
        kind: 'generated',
        createdAt: new Date().toISOString(),
      };
      await fs.writeFile(path.join(generatedTarget, 'meta.json'), JSON.stringify(meta, null, 2) + '\n', 'utf8');

      // Rebuild routes
      await rebuildRoutes();

      json(res, 201, { name, routePath: `/s/${name}` });
      return;
    }

    // DELETE /sandbox-api/:name
    if (method === 'DELETE' && pathname.startsWith('/sandbox-api/')) {
      const segments = pathname.split('/').filter(Boolean);
      // segments: ['sandbox-api', name]
      if (segments.length === 2) {
        const name = segments[1];

        if (!isValidName(name)) {
          json(res, 400, { error: 'Invalid name' });
          return;
        }

        const generatedTarget = path.join(GENERATED_DIR, name);
        const savedTarget = path.join(SAVED_DIR, name);
        assertUnderRoot(generatedTarget, GENERATED_DIR);
        assertUnderRoot(savedTarget, SAVED_DIR);

        const [generatedExists, savedExists] = await Promise.all([
          fs.access(generatedTarget).then(() => true).catch(() => false),
          fs.access(savedTarget).then(() => true).catch(() => false),
        ]);

        if (!generatedExists && !savedExists) {
          json(res, 404, { error: `Sandbox '${name}' not found` });
          return;
        }

        const targetDir = generatedExists ? generatedTarget : savedTarget;
        await fs.rm(targetDir, { recursive: true, force: true });
        await rebuildRoutes();

        json(res, 200, { ok: true });
        return;
      }
    }

    // POST /sandbox-api/pin/:name
    if (method === 'POST' && pathname.startsWith('/sandbox-api/pin/')) {
      const segments = pathname.split('/').filter(Boolean);
      // segments: ['sandbox-api', 'pin', name]
      if (segments.length === 3 && segments[1] === 'pin') {
        const name = segments[2];

        if (!isValidName(name)) {
          json(res, 400, { error: 'Invalid name' });
          return;
        }

        const generatedTarget = path.join(GENERATED_DIR, name);
        const savedTarget = path.join(SAVED_DIR, name);
        assertUnderRoot(generatedTarget, GENERATED_DIR);
        assertUnderRoot(savedTarget, SAVED_DIR);

        const generatedExists = await fs.access(generatedTarget).then(() => true).catch(() => false);
        if (!generatedExists) {
          json(res, 404, { error: `Sandbox '${name}' not found in generated/` });
          return;
        }

        const savedExists = await fs.access(savedTarget).then(() => true).catch(() => false);
        if (savedExists) {
          json(res, 409, { error: `A saved sandbox named '${name}' already exists` });
          return;
        }

        // Move generated/<name> -> saved/<name>
        await fs.rename(generatedTarget, savedTarget);

        // Update meta.json kind to 'saved'
        const metaPath = path.join(savedTarget, 'meta.json');
        try {
          const raw = await fs.readFile(metaPath, 'utf8');
          const meta = JSON.parse(raw);
          meta.kind = 'saved';
          await fs.writeFile(metaPath, JSON.stringify(meta, null, 2) + '\n', 'utf8');
        } catch {
          // meta.json may not exist; write a minimal one
          const meta = { name, title: name, template: 'unknown', kind: 'saved', createdAt: new Date(0).toISOString() };
          await fs.writeFile(metaPath, JSON.stringify(meta, null, 2) + '\n', 'utf8');
        }

        await rebuildRoutes();
        json(res, 200, { ok: true, kind: 'saved' });
        return;
      }
    }

    // POST /sandbox-api/unpin/:name
    if (method === 'POST' && pathname.startsWith('/sandbox-api/unpin/')) {
      const segments = pathname.split('/').filter(Boolean);
      // segments: ['sandbox-api', 'unpin', name]
      if (segments.length === 3 && segments[1] === 'unpin') {
        const name = segments[2];

        if (!isValidName(name)) {
          json(res, 400, { error: 'Invalid name' });
          return;
        }

        const generatedTarget = path.join(GENERATED_DIR, name);
        const savedTarget = path.join(SAVED_DIR, name);
        assertUnderRoot(generatedTarget, GENERATED_DIR);
        assertUnderRoot(savedTarget, SAVED_DIR);

        const savedExists = await fs.access(savedTarget).then(() => true).catch(() => false);
        if (!savedExists) {
          json(res, 404, { error: `Sandbox '${name}' not found in saved/` });
          return;
        }

        const generatedExists = await fs.access(generatedTarget).then(() => true).catch(() => false);
        if (generatedExists) {
          json(res, 409, { error: `A generated sandbox named '${name}' already exists` });
          return;
        }

        // Move saved/<name> -> generated/<name>
        await fs.rename(savedTarget, generatedTarget);

        // Update meta.json kind to 'generated'
        const metaPath = path.join(generatedTarget, 'meta.json');
        try {
          const raw = await fs.readFile(metaPath, 'utf8');
          const meta = JSON.parse(raw);
          meta.kind = 'generated';
          await fs.writeFile(metaPath, JSON.stringify(meta, null, 2) + '\n', 'utf8');
        } catch {
          // meta.json may not exist; write a minimal one
          const meta = { name, title: name, template: 'unknown', kind: 'generated', createdAt: new Date(0).toISOString() };
          await fs.writeFile(metaPath, JSON.stringify(meta, null, 2) + '\n', 'utf8');
        }

        await rebuildRoutes();
        json(res, 200, { ok: true, kind: 'generated' });
        return;
      }
    }

    // POST /sandbox-api/wipe
    if (method === 'POST' && pathname === '/sandbox-api/wipe') {
      let entries;
      try {
        entries = await fs.readdir(GENERATED_DIR, { withFileTypes: true });
      } catch {
        entries = [];
      }

      await Promise.all(
        entries
          .filter((e) => e.isDirectory())
          .map((e) => {
            const target = path.join(GENERATED_DIR, e.name);
            assertUnderRoot(target, GENERATED_DIR);
            return fs.rm(target, { recursive: true, force: true });
          }),
      );

      await rebuildRoutes();
      json(res, 200, { ok: true });
      return;
    }

    // Unknown route
    json(res, 404, { error: 'not found' });
  } catch (err) {
    if (err instanceof RangeError) {
      json(res, 400, { error: err.message });
    } else {
      json(res, 500, { error: err instanceof Error ? err.message : String(err) });
    }
  }
}

// ---------------------------------------------------------------------------
// Create server and listen
// ---------------------------------------------------------------------------

const server = http.createServer((req, res) => {
  handleRequest(req, res).catch((err) => {
    // Last-resort error handler (should not reach here normally)
    try {
      json(res, 500, { error: err instanceof Error ? err.message : String(err) });
    } catch {
      res.end();
    }
  });
});

// Perform an async rescan after startup to catch any pre-existing sandboxes
// (the sync write above wrote an empty routes file as a bootstrap placeholder)
server.listen(4300, () => {
  console.log('[sandbox-server] Listening on http://localhost:4300');
  // Now do the real async scan and rewrite routes
  rebuildRoutes().catch((err) => {
    console.error('[sandbox-server] Failed to rebuild routes on startup:', err);
  });
});
