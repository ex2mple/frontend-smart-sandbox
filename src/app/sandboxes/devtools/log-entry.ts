// src/app/sandboxes/devtools/log-entry.ts

/** Severity of a captured log line. */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** Where a log entry came from. */
export type LogOrigin = 'console' | 'logger' | 'error';

/** A single parsed stack frame. */
export interface StackFrame {
  fn: string;
  file: string;
  line: number;
  col: number;
  /** Original unparsed line, kept for display fallback. */
  raw: string;
}

/** A serialized snapshot of one logged value (taken at log time). */
export type LogValue =
  | { kind: 'primitive'; display: string }
  | { kind: 'string'; display: string }
  | { kind: 'function'; display: string }
  | { kind: 'error'; display: string }
  | { kind: 'special'; display: string }
  | { kind: 'array'; display: string; items: LogValue[]; truncated: boolean }
  | {
      kind: 'object';
      display: string;
      entries: Array<{ key: string; value: LogValue }>;
      truncated: boolean;
    };

/** One line in the console. */
export interface LogEntry {
  id: number;
  level: LogLevel;
  /** epoch ms */
  time: number;
  /** human source label, e.g. "Increment.increment (blank/x.ts:14)" */
  source: string;
  frames: StackFrame[];
  values: LogValue[];
  origin: LogOrigin;
}
