// src/app/sandboxes/devtools/parse-stack.spec.ts
import { describe, it, expect } from 'vitest';
import { parseStack, pickSource } from './parse-stack';

describe('parseStack', () => {
  it('parses V8 frames with a function name', () => {
    const stack = [
      'Error',
      '    at Foo.bar (http://localhost:4200/src/app/x.ts:14:7)',
      '    at http://localhost:4200/src/app/y.ts:3:1',
    ].join('\n');
    const frames = parseStack(stack);
    expect(frames[0]).toMatchObject({ fn: 'Foo.bar', line: 14, col: 7 });
    expect(frames[0].file).toContain('x.ts');
    expect(frames[1]).toMatchObject({ fn: '(anonymous)', line: 3, col: 1 });
  });

  it('parses Firefox/Safari frames', () => {
    const stack = ['bar@http://localhost:4200/src/app/x.ts:14:7', '@http://localhost:4200/y.ts:1:1'].join('\n');
    const frames = parseStack(stack);
    expect(frames[0]).toMatchObject({ fn: 'bar', line: 14, col: 7 });
    expect(frames[1].fn).toBe('(anonymous)');
  });

  it('returns [] for undefined', () => {
    expect(parseStack(undefined)).toEqual([]);
  });
});

describe('pickSource', () => {
  it('skips internal frames and formats app frame', () => {
    const frames = parseStack(
      [
        'Error',
        '    at buildEntry (http://localhost:4200/src/app/sandboxes/devtools/console-capture.ts:50:5)',
        '    at zone.js (http://localhost:4200/node_modules/zone.js/x.js:1:1)',
        '    at Counter.increment (http://localhost:4200/src/app/sandboxes/generated/test/test.ts:14:7)',
      ].join('\n'),
    );
    expect(pickSource(frames)).toBe('Counter.increment (test/test.ts:14)');
  });

  it('falls back to first frame when no app frame', () => {
    expect(pickSource([])).toBe('(unknown)');
  });
});
