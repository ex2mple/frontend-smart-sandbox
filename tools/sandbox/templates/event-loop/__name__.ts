import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  signal,
} from '@angular/core';

// ─── Types ────────────────────────────────────────────────────────────────────

type Phase = 'sync' | 'microtask' | 'macrotask';

interface OutputLine {
  id: number;
  text: string;
  phase: Phase;
}

type TaskKind = 'setTimeout' | 'promise' | 'queueMicrotask' | 'sync';

interface QueuedTask {
  id: number;
  kind: TaskKind;
  label: string;
}

// ─── Phase badge component ─────────────────────────────────────────────────────

@Component({
  selector: 'el-phase-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      class="phase-badge"
      [class.phase-sync]="phase() === 'sync'"
      [class.phase-micro]="phase() === 'microtask'"
      [class.phase-macro]="phase() === 'macrotask'"
      [attr.aria-label]="'phase: ' + phase()"
    >
      {{ phase() }}
    </span>
  `,
})
export class ElPhaseBadge {
  readonly phase = input<Phase>('sync');
}

// ─── Main component ────────────────────────────────────────────────────────────

@Component({
  selector: '{{selector}}',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './{{name}}.html',
  styleUrl: './{{name}}.less',
  imports: [ElPhaseBadge],
})
export class {{className}} {
  private idCounter = 0;
  private taskIdCounter = 0;
  private pendingMacrotasks = 0;

  protected readonly outputLines = signal<OutputLine[]>([]);
  protected readonly isRunning = signal(false);
  protected readonly extraTasks = signal<QueuedTask[]>([]);

  protected readonly outputCount = computed(() => this.outputLines().length);
  protected readonly hasOutput = computed(() => this.outputLines().length > 0);

  private nextId(): number {
    return ++this.idCounter;
  }

  private nextTaskId(): number {
    return ++this.taskIdCounter;
  }

  private appendLine(text: string, phase: Phase): void {
    this.outputLines.update((lines) => [
      ...lines,
      { id: this.nextId(), text, phase },
    ]);
  }

  protected runScenario(): void {
    this.outputLines.set([]);
    this.isRunning.set(true);
    this.pendingMacrotasks = 0;
    console.log('[event-loop] Running scenario');

    const extras = this.extraTasks();

    // ── Synchronous block starts ──────────────────────────────────────────────

    this.appendLine('sync 1', 'sync');

    this.pendingMacrotasks++;
    setTimeout(() => {
      this.appendLine('timeout (macrotask)', 'macrotask');
      this.pendingMacrotasks--;
      if (this.pendingMacrotasks === 0) {
        this.isRunning.set(false);
      }
    });

    Promise.resolve().then(() => {
      this.appendLine('promise .then (microtask)', 'microtask');
    });

    queueMicrotask(() => {
      this.appendLine('queueMicrotask (microtask)', 'microtask');
    });

    // Enqueue extras before sync 2 runs, so their macrotasks fire after the
    // built-in timeout but their microtasks drain before it.
    for (const task of extras) {
      if (task.kind === 'setTimeout') {
        this.pendingMacrotasks++;
        setTimeout(() => {
          this.appendLine(task.label + ' (macrotask)', 'macrotask');
          this.pendingMacrotasks--;
          if (this.pendingMacrotasks === 0) {
            this.isRunning.set(false);
          }
        });
      } else if (task.kind === 'promise') {
        Promise.resolve().then(() => {
          this.appendLine(task.label + ' (microtask)', 'microtask');
        });
      } else if (task.kind === 'queueMicrotask') {
        queueMicrotask(() => {
          this.appendLine(task.label + ' (microtask)', 'microtask');
        });
      } else {
        // sync tasks appended immediately (they are synchronous by definition)
        this.appendLine(task.label + ' (sync)', 'sync');
      }
    }

    this.appendLine('sync 2', 'sync');

    // ── End of synchronous block ──────────────────────────────────────────────
  }

  protected addTask(kind: TaskKind): void {
    const labels: Record<TaskKind, string> = {
      setTimeout: 'extra setTimeout',
      promise: 'extra promise',
      queueMicrotask: 'extra queueMicrotask',
      sync: 'extra sync',
    };
    this.extraTasks.update((list) => [
      ...list,
      { id: this.nextTaskId(), kind, label: labels[kind] + ' #' + (list.length + 1) },
    ]);
  }

  protected removeTask(id: number): void {
    this.extraTasks.update((list) => list.filter((t) => t.id !== id));
  }

  protected reset(): void {
    this.outputLines.set([]);
    this.extraTasks.set([]);
    this.isRunning.set(false);
    this.idCounter = 0;
    this.taskIdCounter = 0;
    this.pendingMacrotasks = 0;
  }
}
