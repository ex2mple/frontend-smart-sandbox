import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  signal,
  untracked,
  type WritableSignal,
} from '@angular/core';

@Component({
  selector: '{{selector}}',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './{{name}}.html',
  styleUrl: './{{name}}.less',
})
export class {{className}} {
  // ── base signals ──────────────────────────────────────────────────────────
  protected readonly a = signal(1);
  protected readonly b = signal(2);

  // ── flash state for graph boxes ───────────────────────────────────────────
  // Each node flashes only when its part of the reactive graph ACTUALLY ran:
  // computed nodes pulse from inside their recompute, the effect node from
  // inside the effect. A no-op write (a.set(a())) recomputes nothing → no flash.
  protected readonly flashA = signal(false);
  protected readonly flashB = signal(false);
  protected readonly flashSum = signal(false);
  protected readonly flashDoubled = signal(false);
  protected readonly flashEffect = signal(false);

  // The app is zoneless: never write to a signal synchronously inside a
  // computed body or during change detection. queueMicrotask defers the write
  // until after the current reactive evaluation finishes.
  private pulse(sig: WritableSignal<boolean>): void {
    queueMicrotask(() => {
      sig.set(true);
      setTimeout(() => sig.set(false), 300);
    });
  }

  // ── derived signals ───────────────────────────────────────────────────────
  // NOTE: console.log + the deferred pulse() inside computed are for demo
  // only — in production code computed factories must be pure/side-effect-free.
  protected readonly sum = computed(() => {
    console.info('[computed] sum recalculated');
    this.pulse(this.flashSum);
    return this.a() + this.b();
  });

  protected readonly doubled = computed(() => {
    console.info('[computed] doubled recalculated');
    this.pulse(this.flashDoubled);
    return this.sum() * 2;
  });

  // ── effect run counter ────────────────────────────────────────────────────
  protected readonly effectRuns = signal(0);

  private readonly _trackEffect = effect(() => {
    const v = this.doubled();
    // Use untracked so reading effectRuns inside effect does NOT create a
    // dependency on effectRuns itself (avoids an infinite loop).
    untracked(() => {
      this.effectRuns.update((n) => n + 1);
    });
    // Flash the effect node exactly when the effect actually runs.
    this.pulse(this.flashEffect);
    console.log(`[effect] doubled changed → ${v}`);
  });

  // ── flash a/b when they actually change ───────────────────────────────────
  // Driven by the reactive system (not by button handlers): the effect reruns
  // only when the signal's value really changed, so a.set(a()) flashes nothing.
  private readonly _flashAOnChange = effect(() => {
    this.a();
    this.pulse(this.flashA);
  });

  private readonly _flashBOnChange = effect(() => {
    this.b();
    this.pulse(this.flashB);
  });

  // ── untracked demo ────────────────────────────────────────────────────────
  // x is only read via untracked inside untrackedResult, so changes to x
  // do NOT trigger recomputation.
  protected readonly x = signal(10);

  protected readonly untrackedResult = computed(() => {
    // Intentionally NOT tracking x — reads a() but x via untracked.
    const aVal = this.a();
    const xVal = untracked(() => this.x());
    console.info('[computed] untrackedResult recalculated (only when a changes)');
    return aVal + xVal;
  });

  // ── controls ──────────────────────────────────────────────────────────────
  protected incA(): void {
    this.a.update((n) => n + 1);
  }

  protected decA(): void {
    this.a.update((n) => n - 1);
  }

  protected incB(): void {
    this.b.update((n) => n + 1);
  }

  protected decB(): void {
    this.b.update((n) => n - 1);
  }

  /**
   * Set a to its current value — Angular skips recompute when value is same.
   * Watch the graph: NO node flashes, because nothing actually recomputed.
   */
  protected setANoop(): void {
    this.a.set(this.a());
    console.log('[noop] a.set(a()) called — no recompute because value unchanged');
  }

  protected incX(): void {
    this.x.update((n) => n + 1);
    console.log(`[untracked demo] x changed → ${this.x()} (untrackedResult will NOT recompute)`);
  }
}
