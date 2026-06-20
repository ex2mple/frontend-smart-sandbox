/**
 * Pure codegen utilities for the Frontend Smart Sandbox.
 * No fs, no http, no Angular imports — just string transforms.
 * Importable by both Node ESM and vitest.
 */

/** Regex that valid sandbox names must fully match. */
export const NAME_RE = /^[a-z][a-z0-9-]*$/;

/**
 * Returns true when `name` is a non-empty string that matches NAME_RE.
 * @param {unknown} name
 * @returns {boolean}
 */
export function isValidName(name) {
  return typeof name === 'string' && NAME_RE.test(name);
}

/**
 * Converts a kebab-case (or underscore-separated) name to PascalCase.
 * If the result starts with a digit, the prefix 'Sandbox' is prepended.
 * Examples:
 *   'my-test'  -> 'MyTest'
 *   'event-loop' -> 'EventLoop'
 *   '3d-demo' -> 'Sandbox3dDemo'
 *   'x' -> 'X'
 * @param {string} name
 * @returns {string}
 */
export function kebabToClassName(name) {
  const pascal = name
    .split(/[-_]/)
    .map((seg) => (seg.length === 0 ? '' : seg[0].toUpperCase() + seg.slice(1)))
    .join('');
  return /^\d/.test(pascal) ? `Sandbox${pascal}` : pascal;
}

/**
 * Returns the Angular selector for a sandbox component.
 * Example: 'my-test' -> 'sb-my-test'
 * @param {string} name
 * @returns {string}
 */
export function selectorFor(name) {
  return `sb-${name}`;
}

/**
 * Replaces every `{{key}}` token (where key is \w+) in `text` with
 * the corresponding value from `vars`. Only keys present in `vars` are
 * replaced; unknown keys are left as-is.
 * @param {string} text
 * @param {Record<string, unknown>} vars
 * @returns {string}
 */
export function renderTemplate(text, vars) {
  return text.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : match;
  });
}

/**
 * Generates a full Angular routes file for the given sandboxes.
 * @param {Array<{name: string, kind: 'generated'|'saved'}>} sandboxes
 * @returns {string} - valid TypeScript source ending with a trailing newline
 */
export function buildRoutesFile(sandboxes) {
  const header = `import { Routes } from '@angular/router';\n\nexport const generatedSandboxRoutes: Routes = `;

  if (sandboxes.length === 0) {
    return `${header}[];\n`;
  }

  const lines = sandboxes.map(({ name, kind }) => {
    const dir = kind === 'generated' ? 'generated' : 'saved';
    return `  { path: 's/${name}', loadChildren: () => import('./${dir}/${name}/${name}.routes').then((m) => m.routes) },`;
  });

  return `${header}[\n${lines.join('\n')}\n];\n`;
}
