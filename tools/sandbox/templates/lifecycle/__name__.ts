import {
  AfterContentChecked,
  AfterContentInit,
  AfterViewChecked,
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  DoCheck,
  Injectable,
  OnChanges,
  OnDestroy,
  OnInit,
  SimpleChanges,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import {
  ExperimentCard,
  ReplayStep,
  RunRecorder,
  Stepper,
} from '../../shared/learning';

// ─── Types ────────────────────────────────────────────────────────────────────

type HookCategory = 'init-change' | 'content' | 'view' | 'destroy';

type HookName =
  | 'constructor'
  | 'ngOnChanges'
  | 'ngOnInit'
  | 'ngDoCheck'
  | 'ngAfterContentInit'
  | 'ngAfterContentChecked'
  | 'ngAfterViewInit'
  | 'ngAfterViewChecked'
  | 'ngOnDestroy';

interface RawHookEvent {
  readonly hook: HookName;
  readonly detail: string;
  readonly category: HookCategory;
  readonly instanceId: number;
}

/**
 * Снимок ПОСЛЕ шага для живой визуализации: какой хук сейчас подсвечен на
 * диаграмме порядка, у какого экземпляра ребёнка, сколько раз он повторился
 * подряд (× N-схлопывание), и в рамках какого действия пользователя.
 */
interface LifecycleState {
  readonly activeHook: HookName | null;
  readonly activeInstanceId: number | null;
  readonly activeCategory: HookCategory | null;
  readonly repeatCount: number;
  readonly actionLabel: string | null;
}

const EMPTY_STATE: LifecycleState = {
  activeHook: null,
  activeInstanceId: null,
  activeCategory: null,
  repeatCount: 1,
  actionLabel: null,
};

// Хуки, которые срабатывают на КАЖДОМ проходе change detection, а не только
// один раз за действие пользователя.
const CHECK_HOOKS = new Set<HookName>(['ngDoCheck', 'ngAfterContentChecked', 'ngAfterViewChecked']);
const MAX_SETTLE_PASSES = 2;

/** Индекс варианта «больше 3 раз» в cardOptions. */
const CARD_MORE_INDEX = 3;

const CATEGORY_LABEL: Record<HookCategory, string> = {
  'init-change': 'Init / Change',
  content: 'Content',
  view: 'View',
  destroy: 'Destroy',
};

// ─── Shared bus (real hooks, recorded, never simulated) ────────────────────────

/**
 * Собирает реальные вызовы lifecycle-хуков дочернего компонента и превращает
 * их в шаги RunRecorder, сгруппированные под маркером действия пользователя
 * (Mount / Update input / Unmount) — с× N-схлопыванием подряд идущих
 * одинаковых хуков (settle-проходы ngDoCheck/*Checked).
 *
 * add() зовётся хуками синхронно ПРЯМО ВО ВРЕМЯ change detection. Приложение
 * zoneless: пишем не в signal, а в обычный массив, и сбрасываем его в
 * recorder.record() (который сам буферизует и флашит через queueMicrotask)
 * один раз на CD-проход — тот же buffered-channel паттерн, что закрыл
 * бесконечный CD-цикл в stage-1 (304 события за один Mount).
 */
/**
 * НЕ root-синглтон: шина живёт в providers главного компонента, чтобы история
 * шагов и счётчик инстансов умирали вместе с ним при уходе с маршрута.
 */
@Injectable()
export class LifecycleBus {
  private readonly recorder = new RunRecorder<LifecycleState>();
  readonly steps = this.recorder.steps;

  private _instanceCounter = 0;
  private _buffer: RawHookEvent[] = [];
  private _flushScheduled = false;
  private _settlePasses = 0;
  private _suppressNext = false;
  private _currentActionLabel: string | null = null;
  /** Подпись последней settle-пачки: повторный идентичный проход схлопывается в одну строку ×2. */
  private _lastSettleSignature: string | null = null;
  /** Счётчик записанных шагов; используется компонентом для опроса «устаканилось ли». */
  private _recordCount = 0;

  get recordCount(): number {
    return this._recordCount;
  }

  nextInstanceId(): number {
    return ++this._instanceCounter;
  }

  /** Маркер действия юзера — записывается СРАЗУ, до того как реальные хуки начнут срабатывать. */
  recordAction(label: string, detail: string): void {
    this._currentActionLabel = label;
    this._settlePasses = 0;
    this._lastSettleSignature = null;
    this._recordCount++;
    this.recorder.record({
      kind: 'action',
      label,
      detail,
      state: Object.freeze({
        activeHook: null,
        activeInstanceId: null,
        activeCategory: null,
        repeatCount: 1,
        actionLabel: label,
      }),
    });
  }

  /** Настоящий вызов хука дочернего компонента — буферизуется, не пишет в signal сразу. */
  add(hook: HookName, detail: string, category: HookCategory, instanceId: number): void {
    this._buffer.push({ hook, detail, category, instanceId });
    if (this._flushScheduled) return;
    this._flushScheduled = true;
    queueMicrotask(() => {
      this._flushScheduled = false;
      this.flushBatch();
    });
  }

  /**
   * Сбрасывает тайм-лайн. `suppressNextDestroy` — правда, если в момент
   * Reset ребёнок был смонтирован: настоящий ngOnDestroy всё равно
   * сработает (Angular реально уничтожит инстанс), но это последствие
   * самого Reset, а не шаг обучающего сценария — его нужно проглотить.
   */
  clear(suppressNextDestroy = false): void {
    this.recorder.clear();
    this._buffer = [];
    this._flushScheduled = false;
    this._settlePasses = 0;
    this._lastSettleSignature = null;
    this._suppressNext = suppressNextDestroy;
    this._currentActionLabel = null;
    console.info('[lifecycle] timeline cleared');
  }

  /**
   * Один CD-проход = одна пачка. Сначала — settle-cap (не больше
   * MAX_SETTLE_PASSES чистых пачек из одних check-хуков подряд, иначе
   * тайм-лайн рос бы бесконечно — это и был stage-1 баг). Затем —
   * ×N-схлопывание на двух уровнях: подряд идущие одинаковые
   * (hook, instanceId) события внутри пачки становятся одним шагом
   * `hook ×N`; а settle-пачка, повторяющая предыдущую один в один,
   * целиком схлопывается в одну строку `… ×2` — внутри одного прохода
   * check-хуки чередуются и на уровне соседних событий не повторяются,
   * реальное повторение живёт на уровне целых проходов.
   */
  private flushBatch(): void {
    const batch = this._buffer;
    this._buffer = [];
    if (batch.length === 0) return;

    if (this._suppressNext) {
      this._suppressNext = false;
      return;
    }

    const settleOnly = batch.every((e) => CHECK_HOOKS.has(e.hook));
    if (settleOnly) {
      if (this._settlePasses >= MAX_SETTLE_PASSES) return;
      this._settlePasses++;

      const signature = batch.map((e) => `${e.hook}#${e.instanceId}`).join(' → ');
      if (signature === this._lastSettleSignature) {
        // Повторный проход, идентичный предыдущему, — одна строка вместо N.
        const doChecks = batch.filter((e) => e.hook === 'ngDoCheck').length;
        const label = `${batch.map((e) => e.hook).join(' → ')} ×2`;
        this._recordCount++;
        this.recorder.record({
          kind: 'info',
          label,
          detail:
            'проход проверки повторился один в один — схлопнут в одну строку, хуки и порядок те же',
          state: Object.freeze({
            activeHook: 'ngDoCheck' as HookName,
            activeInstanceId: batch[0].instanceId,
            activeCategory: null,
            repeatCount: Math.max(doChecks, 1),
            actionLabel: this._currentActionLabel,
          }),
        });
        console.log(`[lifecycle] ${label}`);
        return;
      }
      this._lastSettleSignature = signature;
    } else {
      this._settlePasses = 0;
      this._lastSettleSignature = null;
    }

    let i = 0;
    while (i < batch.length) {
      let j = i + 1;
      while (
        j < batch.length &&
        batch[j].hook === batch[i].hook &&
        batch[j].instanceId === batch[i].instanceId
      ) {
        j++;
      }
      const e = batch[i];
      const count = j - i;
      const label = count > 1 ? `${e.hook} ×${count}` : e.hook;
      this._recordCount++;
      this.recorder.record({
        kind: e.category,
        label,
        detail: e.detail,
        state: Object.freeze({
          activeHook: e.hook,
          activeInstanceId: e.instanceId,
          activeCategory: e.category,
          repeatCount: count,
          actionLabel: this._currentActionLabel,
        }),
      });
      console.log(`[lifecycle] ${label}${e.detail ? ' — ' + e.detail : ''}`);
      i = j;
    }
  }
}

// ─── Child component ────────────────────────────────────────────────────────────

@Component({
  selector: 'lc-child',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="lc-child" role="region" aria-label="Child component">
      <span class="lc-child-label">Child component <span class="lc-child-instance">#{{ instanceId }}</span></span>
      <span class="lc-child-value" aria-live="polite">
        inputValue = <strong>{{ inputValue() }}</strong>
      </span>
    </div>
  `,
  // Инкапсуляция видов: стили родителя не достают до этого шаблона — свои здесь.
  styles: `
    .lc-child {
      display: flex;
      align-items: center;
      gap: var(--sb-space-4);
      width: 100%;
      padding: var(--sb-space-3) var(--sb-space-4);
      background: var(--sb-surface-2);
      border: 1px solid var(--sb-border);
      border-radius: var(--sb-radius-sm);
    }

    .lc-child-label {
      font-weight: 600;
      color: var(--sb-text);
    }

    .lc-child-instance {
      font-family: var(--sb-font-mono);
      font-weight: 500;
      color: var(--sb-text-muted);
    }

    .lc-child-value {
      font-family: var(--sb-font-mono);
      color: var(--sb-text-muted);
      font-size: 0.9rem;
    }
  `,
})
export class LifecycleChild
  implements
    OnChanges,
    OnInit,
    DoCheck,
    AfterContentInit,
    AfterContentChecked,
    AfterViewInit,
    AfterViewChecked,
    OnDestroy
{
  readonly inputValue = input<number>(0);

  private readonly bus = inject(LifecycleBus);
  /** Каждый Mount создаёт НОВЫЙ инстанс с новым id — видно, что lifecycle стартует с нуля. */
  readonly instanceId = this.bus.nextInstanceId();

  constructor() {
    // Конструктор — это обычный вызов TS, а не Angular-хук: он срабатывает
    // ДО того, как Angular выставит входные сигналы и позовёт ngOnChanges.
    this.bus.add('constructor', '', 'init-change', this.instanceId);
  }

  ngOnChanges(changes: SimpleChanges): void {
    const changed = Object.keys(changes)
      .map((k) => `${k}: ${changes[k].previousValue} → ${changes[k].currentValue}`)
      .join(', ');
    this.bus.add('ngOnChanges', changed, 'init-change', this.instanceId);
  }

  ngOnInit(): void {
    this.bus.add('ngOnInit', '', 'init-change', this.instanceId);
  }

  ngDoCheck(): void {
    this.bus.add('ngDoCheck', '', 'init-change', this.instanceId);
  }

  ngAfterContentInit(): void {
    this.bus.add('ngAfterContentInit', '', 'content', this.instanceId);
  }

  ngAfterContentChecked(): void {
    this.bus.add('ngAfterContentChecked', '', 'content', this.instanceId);
  }

  ngAfterViewInit(): void {
    this.bus.add('ngAfterViewInit', '', 'view', this.instanceId);
  }

  ngAfterViewChecked(): void {
    this.bus.add('ngAfterViewChecked', '', 'view', this.instanceId);
  }

  ngOnDestroy(): void {
    this.bus.add('ngOnDestroy', '', 'destroy', this.instanceId);
  }
}

// ─── Main component ───────────────────────────────────────────────────────────

@Component({
  selector: '{{selector}}',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './{{name}}.html',
  styleUrl: './{{name}}.less',
  imports: [LifecycleChild, ExperimentCard, Stepper],
  providers: [LifecycleBus],
})
export class {{className}} {
  private readonly bus = inject(LifecycleBus);
  /** Токен прогона: колбэки устаревшего действия (после Reset/нового действия) — no-op. */
  private runId = 0;

  protected readonly childMounted = signal(false);
  protected readonly childInput = signal(0);

  /**
   * Копия bus.steps(), снятая ОДИН раз, когда действие «устаканилось»
   * (settle-опрос ниже перестал видеть новые записи). Степпер сбрасывается
   * при каждой смене входа [steps], поэтому кормить его растущим сигналом
   * рекордера нельзя.
   */
  protected readonly replaySteps = signal<ReplayStep<LifecycleState>[]>([]);
  protected readonly stepPosition = signal(-1);
  protected readonly cardActualIndex = signal<number | null>(null);

  private readonly card = viewChild(ExperimentCard);

  protected readonly hasReplay = computed(() => this.replaySteps().length > 0);

  /** Снимок диаграммы хуков для текущего шага степпера; -1 = состояние до действий. */
  protected readonly currentState = computed<LifecycleState>(() => {
    const steps = this.replaySteps();
    const pos = this.stepPosition();
    if (pos < 0 || pos >= steps.length) return EMPTY_STATE;
    return steps[pos].state ?? EMPTY_STATE;
  });

  /** Суммы по категориям с учётом ×N-схлопывания (repeatCount), а не числа строк. */
  protected readonly categoryTotals = computed(() => {
    const totals: Record<HookCategory, number> = {
      'init-change': 0,
      content: 0,
      view: 0,
      destroy: 0,
    };
    for (const step of this.replaySteps()) {
      if (step.kind === 'action') continue;
      const category = step.state?.activeCategory;
      if (category) totals[category] += step.state?.repeatCount ?? 1;
    }
    return totals;
  });

  protected readonly categoryLabel = CATEGORY_LABEL;

  protected readonly hookOrder: ReadonlyArray<{
    readonly hook: HookName;
    readonly label: string;
    readonly category: HookCategory;
  }> = [
    { hook: 'constructor', label: 'constructor', category: 'init-change' },
    { hook: 'ngOnChanges', label: 'ngOnChanges', category: 'init-change' },
    { hook: 'ngOnInit', label: 'ngOnInit', category: 'init-change' },
    { hook: 'ngDoCheck', label: 'ngDoCheck', category: 'init-change' },
    { hook: 'ngAfterContentInit', label: 'ngAfterContentInit', category: 'content' },
    { hook: 'ngAfterContentChecked', label: 'ngAfterContentChecked', category: 'content' },
    { hook: 'ngAfterViewInit', label: 'ngAfterViewInit', category: 'view' },
    { hook: 'ngAfterViewChecked', label: 'ngAfterViewChecked', category: 'view' },
    { hook: 'ngOnDestroy', label: 'ngOnDestroy', category: 'destroy' },
  ];

  // ─── Prediction card content ─────────────────────────────────────────────────

  protected readonly cardQuestion =
    'Сколько раз подряд сработает ngDoCheck дочернего компонента при ОДНОМ клике «Increment input»?';
  protected readonly cardOptions = ['1 раз', '2 раза', '3 раза', 'больше 3 раз'];
  protected readonly cardExplanation = computed(() => {
    const idx = this.cardActualIndex();
    if (idx === null) return '';
    if (idx === 0) {
      return 'В этот раз хватило одного вызова ngDoCheck — движок сразу увидел, что дерево стабильно.';
    }
    return (
      'Первый ngDoCheck — настоящая проверка после изменения input; остальные — «settle-проходы» ' +
      `(до ${MAX_SETTLE_PASSES} шт.), которыми движок убеждается, что новых изменений больше нет. ` +
      'Именно эти повторы сворачиваются в тайм-лайне в один шаг «×N».'
    );
  });

  // ─── Actions (real component tree changes, recorded) ─────────────────────────

  protected toggleChild(): void {
    const mounting = !this.childMounted();
    this.recordAndRun(
      mounting ? 'Mount' : 'Unmount',
      mounting
        ? 'Пользователь монтирует дочерний компонент — создаётся новый экземпляр'
        : 'Пользователь размонтирует дочерний компонент',
      () => this.childMounted.set(mounting),
    );
  }

  protected incrementInput(): void {
    if (!this.childMounted()) return;
    const next = this.childInput() + 1;
    this.recordAndRun('Update input', `input меняется на ${next}`, () => this.childInput.set(next));
  }

  protected reset(): void {
    this.runId++; // инвалидирует все ожидающие settle-опросы
    const wasMounted = this.childMounted();
    this.bus.clear(wasMounted);
    this.replaySteps.set([]);
    this.stepPosition.set(-1);
    this.childMounted.set(false);
    this.childInput.set(0);
    this.cardActualIndex.set(null);
    this.card()?.reset();
  }

  /** Пишет маркер действия, выполняет РЕАЛЬНУЮ мутацию и ждёт, пока хуки устаканятся. */
  private recordAndRun(label: string, detail: string, mutate: () => void): void {
    const id = ++this.runId;
    // Новое действие закрывает прошлый вердикт — карточка снова открыта для предсказания.
    this.cardActualIndex.set(null);
    this.bus.recordAction(label, detail);
    mutate();
    this.scheduleSettleCheck(id);
  }

  /**
   * Опрос «устаканилось ли»: сравнивает bus.recordCount на двух соседних
   * тиках. Пока хуки (реальные или settle-проходы) продолжают писать новые
   * шаги — ждём ещё; как только запись остановилась — копируем bus.steps()
   * в replaySteps ОДИН раз. id защищает от устаревших колбэков после
   * Reset/нового действия (тот же паттерн, что runId в event-loop).
   */
  private scheduleSettleCheck(id: number): void {
    const before = this.bus.recordCount;
    setTimeout(() => {
      if (id !== this.runId) return;
      if (this.bus.recordCount !== before) {
        this.scheduleSettleCheck(id);
        return;
      }
      this.finalizeReplay();
    }, 40);
  }

  private finalizeReplay(): void {
    const steps = this.bus.steps();
    this.replaySteps.set(steps);
    this.cardActualIndex.set(this.resolveCardAnswer(steps));
  }

  /**
   * Ответ карточки — из РЕАЛЬНО записанных шагов, и только если ПОСЛЕДНЕЕ
   * действие — «Update input»: считает сумму repeatCount у шагов ngDoCheck
   * между его маркером и концом записи. После Mount/Unmount или до первого
   * Update input карточка не раскрывается (null) — вердикт не бывает про
   * устаревшее действие.
   */
  private resolveCardAnswer(steps: ReplayStep<LifecycleState>[]): number | null {
    let startIndex = -1;
    for (let i = steps.length - 1; i >= 0; i--) {
      if (steps[i].kind === 'action') {
        if (steps[i].label === 'Update input') startIndex = i;
        break;
      }
    }
    if (startIndex === -1) return null;

    let total = 0;
    for (let i = startIndex + 1; i < steps.length; i++) {
      const step = steps[i];
      if (step.kind === 'action') break;
      const state = step.state;
      if (state?.activeHook === 'ngDoCheck') total += state.repeatCount;
    }
    if (total <= 1) return 0;
    if (total === 2) return 1;
    if (total === 3) return 2;
    return CARD_MORE_INDEX;
  }
}
