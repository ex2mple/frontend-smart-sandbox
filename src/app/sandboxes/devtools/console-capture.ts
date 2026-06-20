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
 * Patch console.* and window error events to feed the store.
 * Dev-only, idempotent across HMR. Returns an uninstall fn.
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
      original(...args);
      if (capturing) return;
      capturing = true;
      try {
        store.add(buildEntry(level, 'console', args));
      } catch {
        /* never break console */
      } finally {
        capturing = false;
      }
    };
  }

  const onError = (event: ErrorEvent) => {
    try {
      store.add(buildEntry('error', 'error', [event.error ?? event.message]));
    } catch {
      /* ignore */
    }
  };
  const onRejection = (event: PromiseRejectionEvent) => {
    try {
      store.add(buildEntry('error', 'error', [event.reason]));
    } catch {
      /* ignore */
    }
  };
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);

  c[SENTINEL] = true;
  return () => {
    for (const { method } of METHODS) con[method] = originals.get(method)!;
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
    delete c[SENTINEL];
  };
}
