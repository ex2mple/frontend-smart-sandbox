import {
  ChangeDetectionStrategy,
  Component,
  computed,
  signal,
} from '@angular/core';

// ── Demo 1: makeCounter factory ──────────────────────────────────────────────
// The source of truth is the closed-over `count` variable inside the factory.
// We mirror it in a signal only so Angular's OnPush detector sees the update.

interface Counter {
  inc: () => void;
  dec: () => void;
  get: () => number;
  /** Angular signal mirror — updated on every mutation */
  value: ReturnType<typeof signal<number>>;
  label: string;
}

function makeCounter(label: string, start = 0): Counter {
  // This `count` variable is captured in the closure — NOT accessible from outside.
  let count = start;
  const value = signal(start);

  return {
    label,
    value,
    inc() {
      count++;
      value.set(count);
      console.log(`[${label}] inc → count =`, count);
    },
    dec() {
      count--;
      value.set(count);
      console.log(`[${label}] dec → count =`, count);
    },
    get() {
      return count;
    },
  };
}

// ── Demo 2: loop capture (var vs let) ────────────────────────────────────────

function buildVarFunctions(): Array<() => number> {
  const fns: Array<() => number> = [];
  // `var i` is function-scoped — all closures share the SAME binding.
  for (var i = 0; i < 3; i++) {
    fns.push(() => i); // eslint-disable-line no-loop-func
  }
  return fns;
}

function buildLetFunctions(): Array<() => number> {
  const fns: Array<() => number> = [];
  // `let i` is block-scoped — each iteration creates a FRESH binding.
  for (let i = 0; i < 3; i++) {
    fns.push(() => i);
  }
  return fns;
}

// ── Demo 3: Module pattern (IIFE) ────────────────────────────────────────────

interface TinyStore {
  add(item: string, price: number): void;
  total(): number;
  count(): number;
}

const cartStore: TinyStore = (() => {
  // `items` is private — no code outside the IIFE can touch it directly.
  const items: Array<{ item: string; price: number }> = [];

  return {
    add(item: string, price: number) {
      items.push({ item, price });
      console.info('[cartStore] added', item, '— total now', items.reduce((s, x) => s + x.price, 0));
    },
    total() {
      return items.reduce((sum, x) => sum + x.price, 0);
    },
    count() {
      return items.length;
    },
  };
})();

// ─────────────────────────────────────────────────────────────────────────────

@Component({
  selector: '{{selector}}',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './{{name}}.html',
  styleUrl: './{{name}}.less',
  host: { class: '{{selector}}-host' },
})
export class {{className}} {
  // ── Demo 1 ──
  readonly counters: Counter[] = [
    makeCounter('Alpha', 0),
    makeCounter('Beta', 10),
    makeCounter('Gamma', -5),
  ];

  // ── Demo 2 ──
  readonly varFns = buildVarFunctions();
  readonly letFns = buildLetFunctions();

  readonly varResults = signal<number[]>([]);
  readonly letResults = signal<number[]>([]);

  readonly varResultsText = computed(() =>
    this.varResults().length ? this.varResults().join(', ') : '—'
  );
  readonly letResultsText = computed(() =>
    this.letResults().length ? this.letResults().join(', ') : '—'
  );

  runVarCapture(): void {
    const results = this.varFns.map(fn => fn());
    this.varResults.set(results);
    console.log('[var loop] results:', results);
  }

  runLetCapture(): void {
    const results = this.letFns.map(fn => fn());
    this.letResults.set(results);
    console.log('[let loop] results:', results);
  }

  // ── Demo 3 ──
  readonly storeTotal = signal(0);
  readonly storeCount = signal(0);
  readonly newItem = signal('');
  readonly newPrice = signal(0);

  readonly addDisabled = computed(
    () => this.newItem().trim() === '' || this.newPrice() <= 0
  );

  setNewItem(value: string): void {
    this.newItem.set(value);
  }

  setNewPrice(value: string): void {
    const n = parseFloat(value);
    this.newPrice.set(isNaN(n) ? 0 : n);
  }

  addToCart(): void {
    if (this.addDisabled()) return;
    cartStore.add(this.newItem().trim(), this.newPrice());
    this.storeTotal.set(cartStore.total());
    this.storeCount.set(cartStore.count());
    this.newItem.set('');
    this.newPrice.set(0);
  }
}
