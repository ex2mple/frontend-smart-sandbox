import {
  ChangeDetectionStrategy,
  Component,
  Signal,
  computed,
  signal,
  viewChild,
} from '@angular/core';
import {
  ExperimentCard,
  ReplayStep,
  RunRecorder,
  Stepper,
} from '../../shared/learning';

// ─── Demo 1: makeCounter factory — independent environment records ───────────
// Каждый вызов makeCounter() создаёт СВОЮ приватную переменную `count` — это
// и есть отдельная запись окружения. `value`/`recordText` — сигнальное
// зеркало для OnPush; источник истины остаётся закрытой переменной `count`.

interface Counter {
  readonly label: string;
  readonly value: Signal<number>;
  /** Текст записи «{count: N}», построен в TS — в шаблон идёт готовой строкой. */
  readonly recordText: Signal<string>;
  inc(): void;
  dec(): void;
  get(): number;
}

function makeCounter(label: string, start = 0): Counter {
  // Эта переменная захвачена замыканиями inc/dec/get — снаружи недоступна.
  let count = start;
  const value = signal(start);
  const recordText = computed(() => `{count: ${value()}}`);

  return {
    label,
    value,
    recordText,
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

// ─── Demo 2: var vs let loop capture + setTimeout — real replay ──────────────

/** Снимок «записей окружения» ПОСЛЕ шага: какие записи существуют и какая из
 * них сейчас читается/пишется (activeId). Значения (fields) — уже готовые
 * строки вида «фигурная-скобка i: 2 фигурная-скобка», построенные в TS
 * (ICU-ловушка: фигурная скобка прямо в тексте шаблона ломает сборку —
 * интерполируем готовую строку, а не пишем скобку в разметке). */
interface RecordBox {
  readonly id: string;
  readonly title: string;
  readonly fields: string;
  readonly capturedBy: string;
}

interface EnvState {
  readonly boxes: readonly RecordBox[];
  readonly activeId: string | null;
}

const EMPTY_ENV: EnvState = { boxes: [], activeId: null };

/** Индекс варианта «другой результат» в cardOptions — на случай, если студент
 * поменяет код (границы цикла, var→let) и реальный результат перестанет
 * совпадать с готовыми вариантами. */
const CARD_OTHER_INDEX = 3;

// ─── Demo 3: Module pattern (IIFE) ────────────────────────────────────────────

interface TinyStore {
  add(item: string, price: number): void;
  total(): number;
  count(): number;
}

const cartStore: TinyStore = (() => {
  // `items` — приватная запись окружения этого IIFE; снаружи недоступна.
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
  imports: [ExperimentCard, Stepper],
})
export class {{className}} {
  // ── Demo 1: independent counters (live, no replay needed — no ordering
  // question to demonstrate, just "two calls → two separate records") ──
  readonly counters: Counter[] = [makeCounter('Alpha', 0), makeCounter('Beta', 10)];

  protected readonly demo1CodeSample = [
    'function makeCounter(label, start = 0) {',
    '  let count = start;      // приватная запись',
    '  return {',
    '    inc() { count++; },',
    '    dec() { count--; },',
    '    get() { return count; },',
    '  };',
    '}',
    'makeCounter("Alpha"); makeCounter("Beta"); // ДВЕ разные записи',
  ].join('\n');

  // ── Demo 2: var vs let + setTimeout — real run, recorded, replayed ──
  private runId = 0;
  private pendingTimeouts = 0;
  private boxes: RecordBox[] = [];
  private varOutputs: number[] = [];
  private letOutputs: number[] = [];

  private readonly recorder = new RunRecorder<EnvState>();

  protected readonly isRunning = signal(false);
  /** Копия recorder.steps(), снятая ОДИН раз после завершения прогона —
   * степпер сбрасывается на каждую смену входа [steps], растущий сигнал
   * рекордера кормить нельзя. */
  protected readonly replaySteps = signal<ReplayStep<EnvState>[]>([]);
  protected readonly stepPosition = signal(-1);
  protected readonly cardActualIndex = signal<number | null>(null);
  protected readonly varOutputsArray = signal<number[]>([]);
  protected readonly letOutputsArray = signal<number[]>([]);

  private readonly card = viewChild(ExperimentCard);

  protected readonly hasReplay = computed(() => this.replaySteps().length > 0);

  /** Снимок записей окружения для текущего шага степпера; -1 = ничего ещё нет. */
  protected readonly currentState = computed<EnvState>(() => {
    const steps = this.replaySteps();
    const pos = this.stepPosition();
    if (pos < 0 || pos >= steps.length) return EMPTY_ENV;
    return steps[pos].state ?? EMPTY_ENV;
  });

  protected readonly varOutputsText = computed(() =>
    this.varOutputsArray().length ? this.varOutputsArray().join(', ') : '—',
  );
  protected readonly letOutputsText = computed(() =>
    this.letOutputsArray().length ? this.letOutputsArray().join(', ') : '—',
  );

  protected readonly cardQuestion = 'Что выведет setTimeout-цикл с var?';
  protected readonly cardOptions = ['3, 3, 3', '0, 1, 2', 'undefined ×3', 'другой результат'];
  protected readonly cardExplanation = computed(() => {
    const arr = this.varOutputsArray();
    if (arr.length === 0) return '';
    return this.isSharedBinding(arr)
      ? `Все три таймера вывели ${arr[0]} — они замкнули ОДНУ и ту же запись var-loop, ` +
        'а к моменту вызова колбэков цикл уже давно закончился.'
      : `Таймеры вывели разные значения (${arr.join(', ')}) — переменная цикла НЕ была общей ` +
        '(например, в коде использовали let, у которого своя запись на каждую итерацию).';
  });

  protected readonly demo2CodeSample = [
    'for (var i = 0; i < 3; i++) {',
    '  fns.push(() => i);   // все три замкнут ОДНУ переменную i',
    '}',
    '// после цикла i === 3 — это увидят ВСЕ три функции',
    '',
    'for (let i = 0; i < 3; i++) {',
    '  fns.push(() => i);   // у каждой итерации — своя переменная i',
    '}',
    '',
    'setTimeout(() => fn());  // настоящий вызов, настоящей задержкой',
  ].join('\n');

  protected runScenario(): void {
    if (this.isRunning()) return;
    const id = ++this.runId;
    this.recorder.clear();
    this.replaySteps.set([]);
    this.stepPosition.set(-1);
    this.cardActualIndex.set(null);
    this.varOutputsArray.set([]);
    this.letOutputsArray.set([]);
    this.boxes = [];
    this.varOutputs = [];
    this.letOutputs = [];
    this.isRunning.set(true);
    console.log('[closures] Прогон сценария (реальный var/let цикл + реальный setTimeout)');

    const varFns = this.buildVarFunctionsRecorded();
    const letFns = this.buildLetFunctionsRecorded();
    this.pendingTimeouts = varFns.length + letFns.length;

    varFns.forEach((fn, idx) => {
      setTimeout(() => {
        if (id !== this.runId) return;
        const value = fn();
        this.varOutputs[idx] = value;
        this.record(
          'macrotask',
          `setTimeout → var-fn#${idx}()`,
          `таймер читает ОБЩУЮ запись var-loop — сейчас там i=${value}`,
          this.snapshot('var-loop'),
        );
        this.finishOneTimeout(id);
      });
    });

    letFns.forEach((fn, idx) => {
      setTimeout(() => {
        if (id !== this.runId) return;
        const value = fn();
        this.letOutputs[idx] = value;
        this.record(
          'macrotask',
          `setTimeout → let-fn#${idx}()`,
          `таймер читает СВОЮ запись iteration #${idx} — там i=${value}`,
          this.snapshot(`let-iter-${idx}`),
        );
        this.finishOneTimeout(id);
      });
    });
  }

  /** Настоящий цикл с var — та же переменная мутирует на месте: одна и та же
   * запись (var-loop) переписывается на каждой итерации, финальное значение
   * (после выхода из цикла) — то, что увидят все замкнувшие её функции. */
  private buildVarFunctionsRecorded(): Array<() => number> {
    const fns: Array<() => number> = [];
    for (var i = 0; i < 3; i++) {
      fns.push(() => i); // eslint-disable-line no-loop-func
      this.upsertBox({
        id: 'var-loop',
        title: 'запись var-loop (общая)',
        fields: `{i: ${i}}`,
        capturedBy: `${fns.length} стрелочных функций — одна и та же запись`,
      });
      this.record(
        'sync',
        `var: итерация ${i} — closure #${fns.length - 1} создан`,
        'var функционально-скопирован: все стрелочные функции получат ОДНУ и ту же запись',
        this.snapshot('var-loop'),
      );
    }
    this.upsertBox({
      id: 'var-loop',
      title: 'запись var-loop (общая)',
      fields: `{i: ${i}}`,
      capturedBy: `${fns.length} стрелочных функций — одна и та же запись`,
    });
    this.record(
      'sync',
      `var: цикл завершён — i=${i}`,
      'запись мутировала в последний раз; асинхронные колбэки увидят именно это значение',
      this.snapshot('var-loop'),
    );
    return fns;
  }

  /** Настоящий цикл с let — каждая итерация создаёт НОВУЮ запись; предыдущие
   * записи не трогаются последующими итерациями. */
  private buildLetFunctionsRecorded(): Array<() => number> {
    const fns: Array<() => number> = [];
    for (let i = 0; i < 3; i++) {
      fns.push(() => i);
      const id = `let-iter-${i}`;
      this.upsertBox({
        id,
        title: `запись iteration #${i}`,
        fields: `{i: ${i}}`,
        capturedBy: `closure #${i} (только эта функция)`,
      });
      this.record(
        'sync',
        `let: итерация ${i} — создана НОВАЯ запись {i: ${i}}`,
        'let блочно-скопирован: у этой итерации СВОЯ запись, отдельная от предыдущих',
        this.snapshot(id),
      );
    }
    return fns;
  }

  private isSharedBinding(results: number[]): boolean {
    return results.length > 0 && results.every((n) => n === results[0]);
  }

  /** Добавляет/заменяет запись целиком (новым объектом) — прежние снимки,
   * уже записанные в шаги, продолжают ссылаться на СТАРЫЙ объект записи. */
  private upsertBox(box: RecordBox): void {
    const index = this.boxes.findIndex((b) => b.id === box.id);
    this.boxes = index === -1 ? [...this.boxes, box] : this.boxes.map((b, i) => (i === index ? box : b));
  }

  private snapshot(activeId: string | null): EnvState {
    return Object.freeze({ boxes: this.boxes, activeId });
  }

  private record(kind: string, label: string, detail: string, state: EnvState): void {
    console.log('[closures]', label);
    this.recorder.record({ kind, label, detail, state });
  }

  private finishOneTimeout(id: number): void {
    this.pendingTimeouts--;
    if (this.pendingTimeouts === 0) this.completeRun(id);
  }

  /** Все таймеры отработали. Копируем шаги в replaySteps ОДИН раз — степпер
   * получает готовую запись, а не растущий сигнал рекордера. */
  private completeRun(runId: number): void {
    setTimeout(() => {
      if (runId !== this.runId) return;
      this.isRunning.set(false);
      const steps = this.recorder.steps();
      this.replaySteps.set(steps);
      const varArr = [...this.varOutputs];
      const letArr = [...this.letOutputs];
      this.varOutputsArray.set(varArr);
      this.letOutputsArray.set(letArr);
      this.cardActualIndex.set(this.resolveCardAnswer(varArr));
    });
  }

  /** Ответ карточки — из РЕАЛЬНО записанного вывода var-таймеров, никогда не хардкод. */
  private resolveCardAnswer(varArr: number[]): number {
    const text = varArr.join(', ');
    const index = this.cardOptions.findIndex((opt) => opt === text);
    return index === -1 ? CARD_OTHER_INDEX : index;
  }

  protected reset(): void {
    this.runId++; // колбэки незавершённого прогона становятся no-op
    this.recorder.clear();
    this.replaySteps.set([]);
    this.stepPosition.set(-1);
    this.isRunning.set(false);
    this.cardActualIndex.set(null);
    this.varOutputsArray.set([]);
    this.letOutputsArray.set([]);
    this.card()?.reset();
    this.boxes = [];
    this.varOutputs = [];
    this.letOutputs = [];
    this.pendingTimeouts = 0;
  }

  // ── Demo 3: Module pattern (IIFE) — live, real code, kept truthful ──
  readonly storeTotal = signal(0);
  readonly storeCount = signal(0);
  readonly newItem = signal('');
  readonly newPrice = signal(0);

  protected readonly demo3CodeSample = [
    'const cartStore = (() => {',
    '  const items = [];   // приватная запись — только у этого IIFE',
    '  return {',
    '    add(item, price) { items.push({ item, price }); },',
    '    total() { return items.reduce((s, x) => s + x.price, 0); },',
    '    count() { return items.length; },',
    '  };',
    '})();',
    '// items недоступен снаружи — cartStore.items === undefined',
  ].join('\n');

  readonly addDisabled = computed(() => this.newItem().trim() === '' || this.newPrice() <= 0);

  readonly moduleRecordFields = computed(
    () => `{items: ${this.storeCount()} шт., total: ${this.storeTotal()} ₽}`,
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

  readonly outsideAccessResult = signal<string | null>(null);

  // Реальная проверка (не утверждение): объект, который вернуло IIFE, не имеет
  // свойства `items` — массив живёт только в замыкании. Сам `cartStore` —
  // модульная переменная, из консоли браузера недоступна вовсе (будет
  // ReferenceError), поэтому эксперимент оформлен как кнопка в UI, а не
  // инструкция «открой консоль».
  tryReadItemsOutside(): void {
    const value = (cartStore as unknown as Record<string, unknown>)['items'];
    console.log('[cartStore] попытка прочитать items снаружи →', value);
    this.outsideAccessResult.set(
      value === undefined
        ? 'cartStore.items === undefined — снаружи видно только публичное API (add, total, count)'
        : `cartStore.items = ${JSON.stringify(value)} — приватность нарушена!`,
    );
  }
}
