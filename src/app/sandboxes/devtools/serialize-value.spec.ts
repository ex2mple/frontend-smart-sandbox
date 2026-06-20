// src/app/sandboxes/devtools/serialize-value.spec.ts
import { describe, it, expect } from 'vitest';
import { serializeValue } from './serialize-value';

describe('serializeValue', () => {
  it('handles primitives', () => {
    expect(serializeValue(42)).toEqual({ kind: 'primitive', display: '42' });
    expect(serializeValue(true)).toEqual({ kind: 'primitive', display: 'true' });
    expect(serializeValue(null)).toEqual({ kind: 'primitive', display: 'null' });
    expect(serializeValue(undefined)).toEqual({ kind: 'primitive', display: 'undefined' });
    expect(serializeValue(10n)).toEqual({ kind: 'primitive', display: '10n' });
  });

  it('handles strings distinctly', () => {
    expect(serializeValue('hi')).toEqual({ kind: 'string', display: 'hi' });
  });

  it('serializes a nested object', () => {
    const r = serializeValue({ a: 1, b: { c: 'x' } });
    expect(r.kind).toBe('object');
    if (r.kind !== 'object') throw new Error('not object');
    expect(r.entries[0]).toEqual({ key: 'a', value: { kind: 'primitive', display: '1' } });
    expect(r.entries[1].value.kind).toBe('object');
  });

  it('serializes arrays', () => {
    const r = serializeValue([1, 'a']);
    expect(r.kind).toBe('array');
    if (r.kind !== 'array') throw new Error('not array');
    expect(r.display).toBe('Array(2)');
    expect(r.items).toHaveLength(2);
  });

  it('detects cycles', () => {
    const o: Record<string, unknown> = { a: 1 };
    o['self'] = o;
    const r = serializeValue(o);
    if (r.kind !== 'object') throw new Error('not object');
    const self = r.entries.find((e) => e.key === 'self');
    expect(self?.value).toEqual({ kind: 'special', display: '[Circular]' });
  });

  it('respects maxDepth', () => {
    const r = serializeValue({ a: { b: { c: { d: { e: 1 } } } } }, { maxDepth: 2 });
    // a -> object, a.b -> object, a.b.c -> capped special
    if (r.kind !== 'object') throw new Error('not object');
    const a = r.entries[0].value;
    if (a.kind !== 'object') throw new Error('a not object');
    const b = a.entries[0].value;
    expect(b.kind).toBe('special');
  });

  it('handles Date, Error, Map, Set, function', () => {
    expect(serializeValue(new Date('2020-01-01T00:00:00.000Z'))).toEqual({
      kind: 'special',
      display: '2020-01-01T00:00:00.000Z',
    });
    expect(serializeValue(new Error('boom'))).toEqual({ kind: 'error', display: 'Error: boom' });
    const m = serializeValue(new Map([['k', 1]]));
    expect(m.kind).toBe('object');
    const s = serializeValue(new Set([1, 2]));
    expect(s.kind).toBe('array');
    const f = serializeValue(function foo() {});
    expect(f).toEqual({ kind: 'function', display: 'ƒ foo' });
  });

  it('never throws on a throwing getter', () => {
    const o = {
      get bad(): never {
        throw new Error('nope');
      },
    };
    expect(() => serializeValue(o)).not.toThrow();
    const r = serializeValue(o);
    if (r.kind !== 'object') throw new Error('not object');
    expect(r.entries[0].value.kind).toBe('string');
  });
});
