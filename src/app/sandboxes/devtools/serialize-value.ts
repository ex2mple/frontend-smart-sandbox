// src/app/sandboxes/devtools/serialize-value.ts
import { LogValue } from './log-entry';

export interface SerializeOpts {
  maxDepth?: number;
  maxKeys?: number;
  maxItems?: number;
}

const DEFAULTS: Required<SerializeOpts> = { maxDepth: 4, maxKeys: 100, maxItems: 100 };

/** Snapshot any value into a LogValue tree. Never throws. */
export function serializeValue(value: unknown, opts: SerializeOpts = {}): LogValue {
  return walk(value, 0, new WeakSet<object>(), { ...DEFAULTS, ...opts });
}

function walk(
  value: unknown,
  depth: number,
  seen: WeakSet<object>,
  o: Required<SerializeOpts>,
): LogValue {
  try {
    if (value === null) return { kind: 'primitive', display: 'null' };
    const t = typeof value;
    if (t === 'undefined') return { kind: 'primitive', display: 'undefined' };
    if (t === 'string') return { kind: 'string', display: value as string };
    if (t === 'number' || t === 'boolean') return { kind: 'primitive', display: String(value) };
    if (t === 'bigint') return { kind: 'primitive', display: `${String(value)}n` };
    if (t === 'symbol') return { kind: 'primitive', display: (value as symbol).toString() };
    if (t === 'function') {
      const fn = value as { name?: string };
      return { kind: 'function', display: `ƒ ${fn.name || '(anonymous)'}` };
    }

    const obj = value as object;
    if (seen.has(obj)) return { kind: 'special', display: '[Circular]' };
    if (value instanceof Date) return { kind: 'special', display: value.toISOString() };
    if (value instanceof Error) return { kind: 'error', display: `${value.name}: ${value.message}` };
    if (isDomNode(value)) return { kind: 'special', display: domLabel(value) };

    if (depth >= o.maxDepth) {
      return {
        kind: 'special',
        display: Array.isArray(value) ? `Array(${(value as unknown[]).length})` : '{…}',
      };
    }

    seen.add(obj);
    try {
      if (value instanceof Map) {
        const entries = [...value.entries()]
          .slice(0, o.maxKeys)
          .map(([k, v]) => ({ key: String(k), value: walk(v, depth + 1, seen, o) }));
        return { kind: 'object', display: `Map(${value.size})`, entries, truncated: value.size > o.maxKeys };
      }
      if (value instanceof Set) {
        const items = [...value.values()].slice(0, o.maxItems).map((v) => walk(v, depth + 1, seen, o));
        return { kind: 'array', display: `Set(${value.size})`, items, truncated: value.size > o.maxItems };
      }
      if (Array.isArray(value)) {
        const items = value.slice(0, o.maxItems).map((v) => walk(v, depth + 1, seen, o));
        return { kind: 'array', display: `Array(${value.length})`, items, truncated: value.length > o.maxItems };
      }
      const rec = value as Record<string, unknown>;
      const keys = Object.keys(rec);
      const entries = keys.slice(0, o.maxKeys).map((key) => ({
        key,
        value: walk(safeGet(rec, key), depth + 1, seen, o),
      }));
      const ctor = (obj as { constructor?: { name?: string } }).constructor?.name;
      const display = ctor && ctor !== 'Object' ? ctor : '{…}';
      return { kind: 'object', display, entries, truncated: keys.length > o.maxKeys };
    } finally {
      seen.delete(obj);
    }
  } catch {
    return { kind: 'special', display: safeString(value) };
  }
}

function safeGet(obj: Record<string, unknown>, key: string): unknown {
  try {
    return obj[key];
  } catch (e) {
    return `[getter threw: ${(e as Error)?.message ?? 'error'}]`;
  }
}

function safeString(v: unknown): string {
  try {
    return String(v);
  } catch {
    return '[unserializable]';
  }
}

function isDomNode(v: unknown): boolean {
  return typeof Node !== 'undefined' && v instanceof Node;
}

function domLabel(v: unknown): string {
  const el = v as { nodeName?: string };
  return `<${(el.nodeName ?? 'node').toLowerCase()}>`;
}
