// src/app/sandboxes/devtools/console-capture.ts
import { LogEntry, LogLevel, LogOrigin } from './log-entry';
import { LogStore } from './log-store';
import { parseStack, pickSource } from './parse-stack';
import { serializeValue } from './serialize-value';

const SENTINEL = '__sandboxConsolePatched__';

const METHODS: Array<{ method: 'debug' | 'info' | 'log' | 'warn' | 'error'; level: LogLevel }> = [
  { method: 'debug', level: 'debug' },
  { method: 'info', level: 'info' },
  { method: 'log', level: 'info' },
  { method: 'warn', level: 'warn' },
  { method: 'error', level: 'error' },
];

/** Build a store-ready entry from raw args. Captures the current stack. */
export function buildEntry(
  level: LogLevel,
  origin: LogOrigin,
  args: unknown[],
  scope?: string,
): Omit<LogEntry, 'id'> {
  const frames = parseStack(new Error().stack);
  const source = pickSource(frames);
  return {
    level,
    origin,
    time: Date.now(),
    source: scope ? `${scope} · ${source}` : source,
    frames,
    values: args.map((a) => serializeValue(a)),
  };
}

/**
 * Patch console.* to feed the store. Dev-only, idempotent across HMR.
 * Returns an uninstall fn.
 *
 * Uncaught errors / rejections are NOT listened to here on purpose: Angular's
 * `provideBrowserGlobalErrorListeners()` already routes them to the default
 * ErrorHandler, which calls `console.error` — captured by the patch below.
 * Adding our own window listeners would double-record every error.
 */
export function installConsoleCapture(store: LogStore): () => void {
  const c = console as unknown as Record<string, unknown>;
  if (c[SENTINEL]) return () => {};

  let capturing = false;
  const originals = new Map<string, (...a: unknown[]) => void>();
  const con = console as unknown as Record<string, (...a: unknown[]) => void>;

  for (const { method, level } of METHODS) {
    const original = con[method].bind(console);
    originals.set(method, original);
    con[method] = (...args: unknown[]) => {
      if (capturing) {
        original(...args);
        return;
      }
      capturing = true;
      try {
        original(...args);
        store.add(buildEntry(level, 'console', args));
      } catch {
        /* never break console */
      } finally {
        capturing = false;
      }
    };
  }

  c[SENTINEL] = true;
  return () => {
    for (const { method } of METHODS) con[method] = originals.get(method)!;
    delete c[SENTINEL];
  };
}
