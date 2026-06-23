import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  signal,
  untracked,
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

  // ── derived signals ───────────────────────────────────────────────────────
  // NOTE: console.log inside computed is for demo only — in production code
  // computed factories must be pure/side-effect-free.
  protected readonly sum = computed(() => {
    console.info('[computed] sum recalculated');
    return this.a() + this.b();
  });

  protected readonly doubled = computed(() => {
    console.info('[computed] doubled recalculated');
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
    console.log(`[effect] doubled changed → ${v}`);
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

  // ── flash state for graph boxes ───────────────────────────────────────────
  protected readonly flashA = signal(false);
  protected readonly flashB = signal(false);
  protected readonly flashSum = signal(false);
  protected readonly flashDoubled = signal(false);

  private flash(sig: ReturnType<typeof signal<boolean>>): void {
    sig.set(true);
    setTimeout(() => sig.set(false), 400);
  }

  // ── controls ──────────────────────────────────────────────────────────────
  protected incA(): void {
    this.a.update((n) => n + 1);
    this.flash(this.flashA);
  }

  protected decA(): void {
    this.a.update((n) => n - 1);
    this.flash(this.flashA);
  }

  protected incB(): void {
    this.b.update((n) => n + 1);
    this.flash(this.flashB);
  }

  protected decB(): void {
    this.b.update((n) => n - 1);
    this.flash(this.flashB);
  }

  /** Set a to its current value — Angular skips recompute when value is same. */
  protected setANoop(): void {
    this.a.set(this.a());
    console.log('[noop] a.set(a()) called — no recompute because value unchanged');
  }

  protected incX(): void {
    this.x.update((n) => n + 1);
    console.log(`[untracked demo] x changed → ${this.x()} (untrackedResult will NOT recompute)`);
  }
}
