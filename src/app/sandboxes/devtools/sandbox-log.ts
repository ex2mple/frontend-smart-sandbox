// src/app/sandboxes/devtools/sandbox-log.ts
import { Injectable, inject } from '@angular/core';
import { LogLevel } from './log-entry';
import { LogStore } from './log-store';
import { buildEntry } from './console-capture';

/** A logger bound to a scope label. */
export class ScopedLog {
  constructor(
    private readonly store: LogStore,
    private readonly label: string,
  ) {}

  debug(...a: unknown[]): void {
    this.store.add(buildEntry('debug', 'logger', a, this.label));
  }
  info(...a: unknown[]): void {
    this.store.add(buildEntry('info', 'logger', a, this.label));
  }
  warn(...a: unknown[]): void {
    this.store.add(buildEntry('warn', 'logger', a, this.label));
  }
  error(...a: unknown[]): void {
    this.store.add(buildEntry('error', 'logger', a, this.label));
  }
}

/** Explicit, context-aware logger that feeds the in-app console. */
@Injectable({ providedIn: 'root' })
export class SandboxLog {
  private readonly store = inject(LogStore);

  private emit(level: LogLevel, args: unknown[]): void {
    this.store.add(buildEntry(level, 'logger', args));
  }

  debug(...a: unknown[]): void {
    this.emit('debug', a);
  }
  info(...a: unknown[]): void {
    this.emit('info', a);
  }
  warn(...a: unknown[]): void {
    this.emit('warn', a);
  }
  error(...a: unknown[]): void {
    this.emit('error', a);
  }

  /** Returns a logger whose entries are prefixed with `label`. */
  scope(label: string): ScopedLog {
    return new ScopedLog(this.store, label);
  }
}
