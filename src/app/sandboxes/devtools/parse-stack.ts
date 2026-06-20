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

const INTERNAL_RE = /node_modules|zone\.js|polyfills|console-capture|sandbox-log|@angular|vendor/;

/** Pick the first application frame and format it as a short source label. */
export function pickSource(frames: StackFrame[]): string {
  const app = frames.find((f) => f.file && !INTERNAL_RE.test(f.file) && !INTERNAL_RE.test(f.fn));
  const f = app ?? frames[0];
  if (!f) return '(unknown)';
  const file = shortFile(f.file);
  const fn = f.fn && f.fn !== '(anonymous)' && f.fn !== '(unknown)' ? f.fn : '';
  return fn ? `${fn} (${file}:${f.line})` : `${file}:${f.line}`;
}

function shortFile(file: string): string {
  if (!file) return '(unknown)';
  const clean = file.split('?')[0];
  return clean.split('/').slice(-2).join('/');
}
