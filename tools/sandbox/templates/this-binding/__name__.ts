import { ChangeDetectionStrategy, Component, signal } from '@angular/core';

// ─── Demo object ──────────────────────────────────────────────────────────────

interface DemoObj {
  label: string;
  method(): string;
}

function makeObj(label: string): DemoObj {
  return {
    label,
    method(): string {
      // `this` is whatever the call site provides; type it as unknown so the
      // runtime checks below are honest (TS would otherwise narrow `this` to DemoObj).
      const self: unknown = this;
      if (self === undefined) return 'undefined';
      if (self === globalThis) return 'globalThis';
      if (typeof (self as DemoObj).label === 'string') {
        return `obj{ label: "${(self as DemoObj).label}" }`;
      }
      return String(self);
    },
  };
}

// ─── Row model ────────────────────────────────────────────────────────────────

export interface Row {
  id: number;
  callSite: string;
  explanation: string;
  result: string | null;
}

// ─── Main component ───────────────────────────────────────────────────────────

@Component({
  selector: '{{selector}}',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './{{name}}.html',
  styleUrl: './{{name}}.less',
})
export class {{className}} {
  private readonly obj: DemoObj = makeObj('primary');
  private readonly other: DemoObj = makeObj('other');

  // Legend swatches — kept as data so the literal `{ }` come from interpolation,
  // not from template text (a literal `{` in a template is parsed as an ICU block).
  protected readonly sampleObj = 'obj{ label: "primary" }';
  protected readonly sampleOther = 'obj{ label: "other" }';

  protected readonly rows = signal<Row[]>([
    {
      id: 1,
      callSite: 'obj.method()',
      explanation: 'Метод вызван через точку — this === obj',
      result: null,
    },
    {
      id: 2,
      callSite: 'const f = obj.method; f()',
      explanation: 'Функция оторвана от объекта — strict mode даёт undefined',
      result: null,
    },
    {
      id: 3,
      callSite: 'f.call(other)',
      explanation: '.call() явно задаёт this === other',
      result: null,
    },
    {
      id: 4,
      callSite: 'f.apply(other)',
      explanation: '.apply() — то же что .call(), но аргументы массивом',
      result: null,
    },
    {
      id: 5,
      callSite: 'const b = f.bind(other); b()',
      explanation: '.bind() навсегда фиксирует this === other',
      result: null,
    },
    {
      id: 6,
      callSite: 'arrowFn() (лексический this)',
      explanation: 'Стрелочная функция захватывает this из области определения — здесь компонент',
      result: null,
    },
    {
      id: 7,
      callSite: '[1].forEach(f)',
      explanation: 'Callback теряет this — строгий режим даёт undefined',
      result: null,
    },
  ]);

  protected runRow(id: number): void {
    const { obj, other } = this;
    const f = obj.method; // detached — no `this` binding

    // Arrow function defined here: captures the component's `this`, not obj's
    const arrowFn = (): string => {
      const self: unknown = this;
      if (self === undefined) return 'undefined';
      if (self === globalThis) return 'globalThis';
      // `this` is the component instance (arrow captures lexical this)
      return `component ({{className}})`;
    };

    let result: string;

    switch (id) {
      case 1:
        result = obj.method();
        break;
      case 2:
        result = f();
        break;
      case 3:
        result = f.call(other);
        break;
      case 4:
        result = f.apply(other);
        break;
      case 5: {
        const b = f.bind(other);
        result = b();
        break;
      }
      case 6:
        result = arrowFn();
        break;
      case 7: {
        let captured = 'not set';
        [1].forEach(function (this: unknown) {
          if (this === undefined) captured = 'undefined';
          else if (this === globalThis) captured = 'globalThis';
          else captured = String(this);
        });
        result = captured;
        break;
      }
      default:
        result = '?';
    }

    console.log(`[this-binding] row ${id} → this =`, result);

    this.rows.update((rows) =>
      rows.map((r) => (r.id === id ? { ...r, result } : r)),
    );
  }

  protected runAll(): void {
    for (let i = 1; i <= 7; i++) {
      this.runRow(i);
    }
  }
}
