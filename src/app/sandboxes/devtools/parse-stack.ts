// src/app/sandboxes/devtools/parse-stack.ts
import { StackFrame } from './log-entry';

/** Parse a V8 or SpiderMonkey/JSC stack string into frames. Tolerant of unknown lines. */
export function parseStack(stack: string | undefined): StackFrame[] {
  if (!stack) return [];
  const frames: StackFrame[] = [];
  for (const rawLine of stack.split('\n')) {
    const line = rawLine.trim();
    if (!line || line === 'Error' || line.startsWith('Error:')) continue;
    const frame = parseV8(line) ?? parseSpider(line);
    if (frame) frames.push(frame);
    else if (line.startsWith('at '))
      frames.push({ fn: '(unknown)', file: '', line: 0, col: 0, raw: line });
  }
  return frames;
}

function parseV8(line: string): StackFrame | null {
  if (!line.startsWith('at ')) return null;
  const body = line.slice(3).trim();
  const m = body.match(/^(.*?)\s+\((.*):(\d+):(\d+)\)$/);
  if (m) return { fn: m[1], file: m[2], line: +m[3], col: +m[4], raw: line };
  const m2 = body.match(/^(.*):(\d+):(\d+)$/);
  if (m2) return { fn: '(anonymous)', file: m2[1], line: +m2[2], col: +m2[3], raw: line };
  return null;
}

function parseSpider(line: string): StackFrame | null {
  const m = line.match(/^(.*?)@(.*):(\d+):(\d+)$/);
  if (m) return { fn: m[1] || '(anonymous)', file: m[2], line: +m[3], col: +m[4], raw: line };
  return null;
}

// Matched against frame FILE paths only — never against function names, which
// can legitimately contain these substrings (e.g. a user's `getVendorData`).
// /main.js covers the Angular/Vite entry bundle where console-capture lives after bundling.
const INTERNAL_RE = /node_modules|zone\.js|polyfills|console-capture|sandbox-log|@angular|vendor|\/main\.js/;

// Matched against frame FUNCTION names — catches internal helpers even when they
// share a bundled file path with user code.
const INTERNAL_FN_RE = /^buildEntry$|^installConsoleCapture$/;

/** Pick the first application frame and format it as a short source label. */
export function pickSource(frames: StackFrame[]): string {
  const app = frames.find((f) => f.file && !INTERNAL_RE.test(f.file) && !INTERNAL_FN_RE.test(f.fn));
  const f = app ?? frames[0];
  if (!f) return '(unknown)';
  const file = shortFile(f.file);
  const fn =
    f.fn && f.fn !== '(anonymous)' && f.fn !== '(unknown)'
      ? f.fn.replace(/^_+/, '') // strip esbuild-added leading underscores (_ClassName → ClassName)
      : '';
  return fn ? `${fn} (${file}:${f.line})` : `${file}:${f.line}`;
}

function shortFile(file: string): string {
  if (!file) return '(unknown)';
  const clean = file.split('?')[0];
  return clean.split('/').slice(-2).join('/');
}
