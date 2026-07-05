import {
  ChangeDetectionStrategy,
  Component,
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

// ─── Rule ladder ────────────────────────────────────────────────────────────

/**
 * Приоритет правил для `this` (сверху вниз — сильнее побеждает слабее).
 * Стрелочные функции — вне лестницы: правила к ним не применяются вовсе.
 */
type RuleKey = 'new' | 'bind' | 'call' | 'method' | 'default' | 'arrow';

interface RuleRung {
  readonly key: RuleKey;
  readonly title: string;
  readonly hint: string;
}

const LADDER_RUNGS: readonly RuleRung[] = [
  { key: 'new', title: '1. new', hint: 'Конструктор побеждает всё: this — свежий объект, что бы ни было привязано раньше.' },
  { key: 'bind', title: '2. bind', hint: '.bind(ctx) фиксирует this навсегда — следующие call/apply уже не могут его перебить.' },
  { key: 'call', title: '3. call / apply', hint: 'Явно задают this первым аргументом.' },
  { key: 'method', title: '4. Метод через точку', hint: 'this = объект слева от точки вызова.' },
  { key: 'default', title: '5. Обычный вызов', hint: 'Ничего не привязано — в strict mode this = undefined.' },
];

/**
 * Снимок ПОСЛЕ шага: какое правило сработало, какой call site его вызвал,
 * и во что реально разрешился this. Иммутабельный — Object.freeze при записи.
 */
interface LadderState {
  readonly rule: RuleKey;
  readonly callSite: string;
  readonly thisValue: string;
}

// ─── Demo targets (real objects, real function) ────────────────────────────

interface DemoObj {
  readonly label: string;
  method(): unknown;
}

function makeObj(label: string): DemoObj {
  return {
    label,
    method(): unknown {
      // Никакой типизации `this` здесь нет намеренно — реальный `this`
      // целиком определяется местом ВЫЗОВА этого метода, а не этим местом.
      return this;
    },
  };
}

function isDemoObj(value: unknown): value is DemoObj {
  return typeof value === 'object' && value !== null && 'label' in value;
}

/**
 * Обычный class-конструктор — нужен, чтобы честно прогнать правило `new`,
 * включая ловушку «new бьёт bind»: `Ctor.bind(other)` типизируется через
 * NewableFunction.bind (возвращает новый конструктор), но в рантайме `new`
 * всё равно создаёт свежий this, полностью игнорируя `other`.
 */
class Ctor {
  tag: string;
  constructor(tag: string) {
    this.tag = tag;
  }
}

/** Метка кейса-ловушки «new бьёт bind» — используется и в записи, и в карточке. */
const CARD_CASE_LABEL = "new (Ctor.bind(other))('new+bind')";

/** Индексы вариантов в cardOptions (см. ниже). */
const CARD_OTHER_INDEX = 0;
const CARD_NEW_INDEX = 1;
const CARD_UNDEF_INDEX = 2;
const CARD_GLOBAL_INDEX = 3;

// ─── Main component ─────────────────────────────────────────────────────────

@Component({
  selector: '{{selector}}',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './{{name}}.html',
  styleUrl: './{{name}}.less',
  imports: [ExperimentCard, Stepper],
})
export class {{className}} {
  /** Токен прогона: колбэки устаревшего прогона (после Reset/Run) — no-op. */
  private runId = 0;

  private readonly recorder = new RunRecorder<LadderState>();

  private readonly obj: DemoObj = makeObj('primary');
  private readonly other: DemoObj = makeObj('other');
  private readonly third: DemoObj = makeObj('third');

  protected readonly isRunning = signal(false);
  /**
   * Копия recorder.steps(), снятая ОДИН раз после завершения прогона.
   * Степпер сбрасывается при каждой смене входа [steps] — растущий сигнал
   * рекордера кормить нельзя, только готовую запись.
   */
  protected readonly replaySteps = signal<ReplayStep<LadderState>[]>([]);
  protected readonly stepPosition = signal(-1);
  protected readonly cardActualIndex = signal<number | null>(null);

  private readonly card = viewChild(ExperimentCard);

  protected readonly hasReplay = computed(() => this.replaySteps().length > 0);

  protected readonly ladderRungs = LADDER_RUNGS;

  // Легенда: литеральная `{` в тексте шаблона парсится как ICU-блок и ломает
  // сборку, поэтому строки с фигурными скобками приходят из интерполяции
  // TS-констант, а не набраны прямо в HTML.
  protected readonly sampleObj = 'obj{ label: "primary" }';
  protected readonly sampleOther = 'obj{ label: "other" }';
  protected readonly sampleNewInstance = 'новый экземпляр Ctor{ tag: "new" }';

  /** Снимок текущего шага степпера; null = состояние до запуска / вне диапазона. */
  protected readonly currentState = computed<LadderState | null>(() => {
    const steps = this.replaySteps();
    const pos = this.stepPosition();
    if (pos < 0 || pos >= steps.length) return null;
    return steps[pos].state ?? null;
  });

  // ─── Prediction card content ────────────────────────────────────────────

  protected readonly cardQuestion =
    'Функцию-конструктор Ctor привязали через .bind(other). ' +
    'Чему будет равен this, если вызвать результат бинда через new?';
  protected readonly cardOptions = [
    'other — bind это гарантирует',
    'Новый экземпляр Ctor — new игнорирует bind',
    'undefined',
    'globalThis',
  ];
  protected readonly cardExplanation =
    '`new` создаёт совершенно новый объект и делает его this — привязка `.bind()` ' +
    'при этом полностью игнорируется. Поэтому `new` стоит на вершине лестницы ' +
    'приоритета: даже уже связанная функция получает свежий this при вызове через new.';

  protected readonly scenarioCode = [
    'const f = obj.method;                            // оторвана от объекта',
    '',
    "new Ctor('new')                                   // 1. new — сильнее всего",
    "new (Ctor.bind(other))('new+bind')                // 2. new бьёт bind (ловушка!)",
    '',
    'const bound = f.bind(other);',
    'bound()                                           // 3. bind — фиксирует this навсегда',
    'bound.call(third)                                 // 4. bind бьёт call/apply (ловушка!)',
    '',
    'f.call(other)                                     // 5. call — явно задаёт this',
    'f.apply(other)                                    // 6. apply — тот же приоритет',
    '',
    'obj.method()                                      // 7. точка — this = объект слева',
    'f()                                                // 8. default — undefined (strict mode)',
    '',
    'arrowFn()                                          // 9. arrow — вне лестницы, лексический this',
  ].join('\n');

  // ─── Scenario (real code, recorded) ─────────────────────────────────────

  protected runScenario(): void {
    if (this.isRunning()) return;
    const id = ++this.runId;
    this.recorder.clear();
    this.replaySteps.set([]);
    this.stepPosition.set(-1);
    this.cardActualIndex.set(null);
    this.isRunning.set(true);
    console.log('[this-binding] Прогон лестницы правил (реальный код, реальные вызовы)');

    const { obj, other, third } = this;
    const f = obj.method; // оторвана от объекта — своего this не имеет

    // 1. new — самое сильное правило.
    const inst1 = new Ctor('new');
    this.record('new', "new Ctor('new')", '`new` создаёт свежий объект и делает его this — сильнее любого другого правила.', inst1);

    // 2. new бьёт bind — ключевая ловушка лестницы.
    const BoundCtor = Ctor.bind(other);
    const inst2 = new BoundCtor('new+bind');
    this.record('new', CARD_CASE_LABEL, 'Даже у функции, привязанной `.bind(other)`, `new` создаёт НОВЫЙ объект — bind проигрывает new.', inst2);

    // 3. bind — фиксирует this навсегда.
    const bound = f.bind(other);
    const boundResult = bound();
    this.record('bind', 'const bound = f.bind(other); bound()', '`.bind()` навсегда фиксирует this = other.', boundResult);

    // 4. bind бьёт call — вторая ловушка.
    const boundCallResult = bound.call(third);
    this.record('bind', 'bound.call(third)', 'Повторный `.call()` на уже привязанной функции не может переопределить this — bind сильнее call/apply.', boundCallResult);

    // 5. call — явное задание this.
    const callResult = f.call(other);
    this.record('call', 'f.call(other)', '`.call()` явно задаёт this первым аргументом.', callResult);

    // 6. apply — тот же приоритет, что и call.
    const applyResult = f.apply(other);
    this.record('call', 'f.apply(other)', '`.apply()` — тот же приоритет, что и call, аргументы передаются массивом.', applyResult);

    // 7. method — вызов через точку.
    const methodResult = obj.method();
    this.record('method', 'obj.method()', 'Вызов через точку — this = объект слева от точки.', methodResult);

    // 8. default — оторванная функция, strict mode.
    const defaultResult = f();
    this.record('default', 'f()', 'Не привязана и не вызвана через call/apply/new — в strict mode (ES-модуль) this = undefined.', defaultResult);

    // 9. arrow — вне лестницы: лексический this места ОПРЕДЕЛЕНИЯ.
    const arrowFn = (): unknown => this;
    const arrowResult = arrowFn();
    this.record('arrow', 'arrowFn()', 'Стрелочная функция не имеет своего this — берёт его лексически из места определения (здесь — компонент).', arrowResult);

    this.completeRun(id);
  }

  /** Записывает шаг + иммутабельный снимок правила/call site/результата. */
  private record(rule: RuleKey, callSite: string, detail: string, rawThis: unknown): void {
    const thisValue = this.describeThis(rawThis);
    console.log('[this-binding]', callSite, '→ this =', thisValue);
    this.recorder.record({
      kind: rule,
      label: callSite,
      detail,
      state: Object.freeze({ rule, callSite, thisValue }),
    });
  }

  /** Человеко-читаемое описание РЕАЛЬНО полученного this — ничего не подделывается. */
  private describeThis(value: unknown): string {
    if (value === undefined) return 'undefined';
    if (value === globalThis) return 'globalThis';
    if (value instanceof {{className}}) return 'компонент ({{className}})';
    if (value instanceof Ctor) return `новый экземпляр Ctor{ tag: "${value.tag}" }`;
    if (isDemoObj(value)) return `obj{ label: "${value.label}" }`;
    return String(value);
  }

  /**
   * Сценарий полностью синхронный, но RunRecorder буферизует запись и
   * сбрасывает её в signal через queueMicrotask (иначе синхронная запись
   * signal во время текущего CD-прохода могла бы спровоцировать лишний
   * проход). setTimeout здесь — как в event-loop-пилоте: макротаска
   * гарантированно выполняется ПОСЛЕ того как эта микротаска-флаш уже
   * состоялась, так что recorder.steps() к этому моменту точно полон.
   */
  private completeRun(runId: number): void {
    setTimeout(() => {
      if (runId !== this.runId) return;
      this.isRunning.set(false);
      const steps = this.recorder.steps();
      this.replaySteps.set(steps);
      this.cardActualIndex.set(this.resolveCardAnswer(steps));
    });
  }

  /** Ответ карточки — из РЕАЛЬНО записанного шага-ловушки, не захардкожен. */
  private resolveCardAnswer(steps: ReplayStep<LadderState>[]): number {
    const target = steps.find((step) => step.label === CARD_CASE_LABEL);
    const value = target?.state?.thisValue ?? '';
    if (value.startsWith('новый экземпляр')) return CARD_NEW_INDEX;
    if (value.startsWith('obj') && value.includes('other')) return CARD_OTHER_INDEX;
    if (value === 'undefined') return CARD_UNDEF_INDEX;
    if (value === 'globalThis') return CARD_GLOBAL_INDEX;
    return CARD_NEW_INDEX;
  }

  protected reset(): void {
    this.runId++; // колбэк незавершённого прогона становится no-op
    this.recorder.clear();
    this.replaySteps.set([]);
    this.stepPosition.set(-1);
    this.isRunning.set(false);
    this.cardActualIndex.set(null);
    this.card()?.reset();
  }
}
