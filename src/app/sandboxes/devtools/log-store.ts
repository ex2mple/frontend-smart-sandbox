// src/app/sandboxes/devtools/log-store.ts
import { Injectable, signal } from '@angular/core';
import { LogEntry } from './log-entry';

/** Max retained entries; oldest are dropped beyond this. */
const CAP = 1000;

@Injectable({ providedIn: 'root' })
export class LogStore {
  private readonly _entries = signal<readonly LogEntry[]>([]);
  readonly entries = this._entries.asReadonly();
  private nextId = 1;

  add(entry: Omit<LogEntry, 'id'>): void {
    const full: LogEntry = { ...entry, id: this.nextId++ };
    this._entries.update((list) => {
      const next = list.length >= CAP ? list.slice(list.length - CAP + 1) : list.slice();
      next.push(full);
      return next;
    });
  }

  clear(): void {
    this._entries.set([]);
  }
}
