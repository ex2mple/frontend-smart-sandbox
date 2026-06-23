import {
  ChangeDetectionStrategy,
  Component,
  computed,
  signal,
} from '@angular/core';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChainLevel {
  label: string;
  ownProps: string[];
  object: object | null;
}

interface LookupStep {
  label: string;
  found: boolean;
}

interface LookupResult {
  steps: LookupStep[];
  foundAt: string | null;
  value: unknown;
}

// ─── Prototype chain objects ───────────────────────────────────────────────────
// Built once at module level so we can use Object.getPrototypeOf at runtime.

const animal: Record<string, unknown> = {
  kind: 'animal',
  describe(this: Record<string, unknown>): string {
    return `I am a ${String(this['kind'])}`;
  },
};

const dog: Record<string, unknown> = Object.create(animal) as Record<string, unknown>;
dog['bark'] = function bark(): string {
  return 'Woof!';
};

const rex: Record<string, unknown> = Object.create(dog) as Record<string, unknown>;
rex['name'] = 'Rex';

// ─── Helper ───────────────────────────────────────────────────────────────────

function labelOf(obj: object | null): string {
  if (obj === null) return 'null';
  if (obj === rex) return 'rex';
  if (obj === dog) return 'dog';
  if (obj === animal) return 'animal';
  if (obj === Object.prototype) return 'Object.prototype';
  return '(unknown)';
}

function getOwnReadable(obj: object): string[] {
  return Object.getOwnPropertyNames(obj).filter(
    (k) => !k.startsWith('__') && k !== 'constructor',
  );
}

function buildChain(): ChainLevel[] {
  const levels: ChainLevel[] = [];
  let cur: object | null = rex;
  while (cur !== null) {
    levels.push({
      label: labelOf(cur),
      ownProps: getOwnReadable(cur),
      object: cur,
    });
    cur = Object.getPrototypeOf(cur) as object | null;
  }
  levels.push({ label: 'null', ownProps: [], object: null });
  return levels;
}

function walkLookup(propName: string): LookupResult {
  const steps: LookupStep[] = [];
  let cur: object | null = rex;

  while (cur !== null) {
    const lbl = labelOf(cur);
    const owns = Object.getOwnPropertyNames(cur).includes(propName);
    steps.push({ label: lbl, found: owns });
    if (owns) {
      const val = (cur as Record<string, unknown>)[propName];
      return { steps, foundAt: lbl, value: val };
    }
    cur = Object.getPrototypeOf(cur) as object | null;
  }

  // Not found anywhere
  steps.push({ label: 'null', found: false });
  return { steps, foundAt: null, value: undefined };
}

// ─── Main component ───────────────────────────────────────────────────────────

@Component({
  selector: '{{selector}}',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './{{name}}.html',
  styleUrl: './{{name}}.less',
})
export class {{className}} {
  protected readonly query = signal('name');
  protected readonly inputValue = signal('name');
  protected readonly shadowed = signal(false);

  protected readonly chain = computed<ChainLevel[]>(() => {
    // Rebuild so shadowing state is reflected
    void this.shadowed();
    return buildChain();
  });

  protected readonly result = computed<LookupResult>(() => {
    void this.shadowed();
    return walkLookup(this.query());
  });

  protected readonly suggestions = ['name', 'bark', 'describe', 'kind', 'toString', 'missingProp'];

  protected lookup(): void {
    const q = this.inputValue().trim();
    if (!q) return;
    this.query.set(q);

    const res = walkLookup(q);
    const path = res.steps.map((s) => s.label).join(' → ');
    if (res.foundAt !== null) {
      console.log(`[proto] lookup("${q}") path: ${path} — found on "${res.foundAt}"`, res.value);
    } else {
      console.log(`[proto] lookup("${q}") path: ${path} — not found (undefined)`);
    }
  }

  protected selectSuggestion(s: string): void {
    this.inputValue.set(s);
    this.query.set(s);

    const res = walkLookup(s);
    const path = res.steps.map((step) => step.label).join(' → ');
    if (res.foundAt !== null) {
      console.log(`[proto] lookup("${s}") path: ${path} — found on "${res.foundAt}"`, res.value);
    } else {
      console.log(`[proto] lookup("${s}") path: ${path} — not found (undefined)`);
    }
  }

  protected addShadow(): void {
    rex['kind'] = 'good boy';
    this.shadowed.set(true);
    this.query.set('kind');
    this.inputValue.set('kind');
    console.info('[proto] rex.kind = "good boy" — own property added, shadows animal.kind');
    console.log('[proto] lookup("kind") — now resolves on rex (own), not animal');
  }

  protected resetShadow(): void {
    delete rex['kind'];
    this.shadowed.set(false);
    this.query.set('kind');
    this.inputValue.set('kind');
    console.info('[proto] deleted rex.kind — shadow removed, kind resolves on animal again');
    console.log('[proto] lookup("kind") — resolves on animal again');
  }
}
