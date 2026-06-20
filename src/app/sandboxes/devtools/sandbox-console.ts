// src/app/sandboxes/devtools/sandbox-console.ts
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { LogEntry, LogLevel } from './log-entry';
import { LogStore } from './log-store';
import { LogValueTree } from './log-value-tree';

const LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error'];

@Component({
  selector: 'app-sandbox-console',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LogValueTree],
  templateUrl: './sandbox-console.html',
  styleUrl: './sandbox-console.less',
})
export class SandboxConsole {
  private readonly store = inject(LogStore);

  protected readonly levels = LEVELS;
  protected readonly open = signal(false);
  protected readonly autoscroll = signal(true);
  protected readonly query = signal('');
  protected readonly activeLevels = signal<ReadonlySet<LogLevel>>(new Set(LEVELS));
  protected readonly expanded = signal<ReadonlySet<number>>(new Set());

  protected readonly entries = this.store.entries;
  protected readonly count = computed(() => this.entries().length);

  protected readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    const active = this.activeLevels();
    return this.entries().filter((e) => {
      if (!active.has(e.level)) return false;
      if (!q) return true;
      return e.source.toLowerCase().includes(q) || e.values.some((v) => valueText(v).includes(q));
    });
  });

  protected toggleOpen(): void {
    this.open.update((v) => !v);
  }

  protected toggleLevel(level: LogLevel): void {
    this.activeLevels.update((set) => {
      const next = new Set(set);
      if (next.has(level)) next.delete(level);
      else next.add(level);
      return next;
    });
  }

  protected isLevelActive(level: LogLevel): boolean {
    return this.activeLevels().has(level);
  }

  protected toggleRow(id: number): void {
    this.expanded.update((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  protected isRowExpanded(id: number): boolean {
    return this.expanded().has(id);
  }

  protected clear(): void {
    this.store.clear();
    this.expanded.set(new Set());
  }

  protected formatTime(ms: number): string {
    const d = new Date(ms);
    const pad = (n: number, w = 2) => String(n).padStart(w, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
  }

  protected async copyAll(): Promise<void> {
    const text = this.filtered().map(toPlainText).join('\n');
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* clipboard may be unavailable; ignore */
    }
  }

  protected export(): void {
    const text = this.filtered().map(toPlainText).join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sandbox-logs.txt';
    a.click();
    URL.revokeObjectURL(url);
  }
}

function valueText(v: LogEntry['values'][number]): string {
  if (v.kind === 'array') return v.items.map(valueText).join(' ');
  if (v.kind === 'object') return v.entries.map((e) => `${e.key} ${valueText(e.value)}`).join(' ');
  return v.display.toLowerCase();
}

function toPlainText(e: LogEntry): string {
  const d = new Date(e.time).toISOString();
  const msg = e.values.map(plainValue).join(' ');
  return `[${e.level}] ${d} ${e.source} — ${msg}`;
}

function plainValue(v: LogEntry['values'][number]): string {
  if (v.kind === 'array') return `[${v.items.map(plainValue).join(', ')}]`;
  if (v.kind === 'object') return `{${v.entries.map((e) => `${e.key}: ${plainValue(e.value)}`).join(', ')}}`;
  return v.display;
}
