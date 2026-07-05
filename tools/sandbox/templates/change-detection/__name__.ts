import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
  viewChildren,
  viewChild,
} from '@angular/core';
import {
  ExperimentCard,
  ReplayStep,
  RunRecorder,
  Stepper,
} from '../../shared/learning';

// ─── Types ────────────────────────────────────────────────────────────────────

type NodeId = 'default-a' | 'default-b' | 'onpush-c' | 'onpush-d';
type Strategy = 'default' | 'onpush';
type NodeCheckStatus = 'checked' | 'skipped';

interface NodeMeta {
  readonly id: NodeId;
  readonly label: string;
  readonly strategy: Strategy;
}

/** Дерево демки — статично: те же 4 карточки существуют на каждом проходе. */
const NODES: readonly NodeMeta[] = [
  { id: 'default-a', label: 'Default — A', strategy: 'default' },
  { id: 'default-b', label: 'Default — B', strategy: 'default' },
  { id: 'onpush-c', label: 'OnPush — C', strategy: 'onpush' },
  { id: 'onpush-d', label: 'OnPush — D', strategy: 'onpush' },
];

interface NodeStatus {
  readonly id: NodeId;
  readonly label: string;
  readonly strategy: Strategy;
  readonly status: NodeCheckStatus;
  readonly reason: string;
}

/** Снимок ПОСЛЕ шага: какие узлы уже раскрыты (checked/skipped + почему). */
interface CdPassState {
  readonly actionLabel: string;
  readonly resolved: readonly NodeStatus[];
}

/** Индекс правильного варианта в cardOptions для сценария «клик в OnPush — D». */
const CARD_ONLY_D = 0;
const CARD_DEFAULTS_PLUS_D = 1;
const CARD_ALL_FOUR = 2;
const CARD_OTHER = 3;

// ─── Default child ────────────────────────────────────────────────────────────
//
// Инструментирование в zoneless-приложении:
// recordCheck() вызывается из шаблона, то есть ровно тогда, когда Angular
// реально выполняет шаблон компонента (dirty-check). `checked` эмитится
// СИНХРОННО прямо оттуда — это не запись в signal, а обычный вызов output(),
// поэтому безопасен прямо во время CD.
//
// Важно: карточка НЕ ведёт свой собственный счётчик/вспышку. Раньше она
// пыталась отличить «свою» перерисовку (вызванную её же queueMicrotask-флашем)
// от «настоящей» эвристикой selfInflicted — эта эвристика структурно не может
// отличить «эхо, которое вызвала я сама» от «эхо, которое вызвала бухгалтерия
// родителя» (например queueMicrotask в finalizePass()), поэтому давала
// ложные +1 после Reset и после обычных проходов. Вместо этого авторитетные
// `count`/`flashing` присылает родитель через input() — он уже держит окно
// прохода (`passOpen`) и считает проверки только внутри него, откуда и берёт
// правильное «сколько раз реально checked». Здесь это чисто презентационные
// inputs.
//
// Стили — собственные (не в общем __name__.less): дочерний компонент имеет
// свою вьюху с собственной ViewEncapsulation, стили родителя её не достигнут.

@Component({
  selector: 'cd-node-default',
  changeDetection: ChangeDetectionStrategy.Default,
  template: `
    <div
      class="cd-node"
      [class.flash]="flashing()"
      [class.cd-node--checked]="replayStatus() === 'checked'"
      [class.cd-node--skipped]="replayStatus() === 'skipped'"
      [attr.aria-label]="'Default node, checked ' + count() + ' times, value ' + value()"
    >{{ recordCheck() }}
      <span class="badge badge-default">Default</span>
      <div class="node-label">{{ label() }}</div>
      <div class="node-value">value: {{ value() }}</div>
      <div class="node-own">свои клики: {{ ownClicks() }}</div>
      <button type="button" class="node-click-btn" (click)="handleOwnClick()">
        Клик внутри карточки
      </button>
      <div class="check-count">checked {{ count() }} times</div>
    </div>
  `,
  styles: `
    .cd-node {
      background: var(--sb-surface-2);
      border: 1px solid var(--sb-border);
      border-radius: var(--sb-radius-sm);
      padding: var(--sb-space-3);
      display: flex;
      flex-direction: column;
      gap: var(--sb-space-1);
      transition: background 0.12s, border-color 0.12s, box-shadow 0.12s;
    }
    .cd-node.flash { background: var(--sb-warn-surface); border-color: var(--sb-warn); }
    .cd-node--checked { box-shadow: 0 0 0 2px var(--sb-success); }
    .cd-node--skipped { opacity: 0.55; }
    .badge {
      display: inline-block;
      font-size: 0.7rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      padding: 2px var(--sb-space-2);
      border-radius: var(--sb-radius-sm);
      flex-shrink: 0;
      width: fit-content;
    }
    .badge-default { background: var(--sb-danger-hover); color: var(--sb-accent-contrast); }
    .node-label { font-weight: 600; font-size: 0.88rem; color: var(--sb-text); }
    .node-value, .node-own {
      font-family: var(--sb-font-mono);
      font-size: 0.8rem;
      color: var(--sb-text-muted);
    }
    .check-count {
      font-family: var(--sb-font-mono);
      font-size: 0.85rem;
      font-weight: 700;
      color: var(--sb-accent);
    }
    .node-click-btn {
      align-self: flex-start;
      padding: var(--sb-space-1) var(--sb-space-2);
      border: 1px solid var(--sb-border);
      border-radius: var(--sb-radius-sm);
      background: var(--sb-surface);
      color: var(--sb-text);
      font: inherit;
      font-size: 0.78rem;
      cursor: pointer;
    }
    .node-click-btn:hover { background: var(--sb-surface-2); }
    .node-click-btn:focus-visible { outline: none; box-shadow: var(--sb-ring); }
  `,
})
export class CdNodeDefault {
  readonly id = input.required<NodeId>();
  readonly label = input<string>('');
  readonly value = input<number>(0);
  /** null = проход ещё не проигран/не дошёл до этого шага в реплее. */
  readonly replayStatus = input<NodeCheckStatus | null>(null);
  /** Авторитетный счётчик «checked N times» — считает родитель внутри своего passOpen-окна. */
  readonly count = input<number>(0);
  /** Импульс вспышки после реального checked-прохода — включает/выключает родитель. */
  readonly flashing = input<boolean>(false);

  /** Реальная проверка шаблона — сообщаем наружу синхронно. */
  readonly checked = output<NodeId>();
  /** Пользователь кликнул кнопку ВНУТРИ карточки. */
  readonly ownClick = output<NodeId>();

  protected readonly ownClicks = signal(0);

  // Выполняется при каждом реальном выполнении шаблона; всегда отдаёт ''.
  // Никакой буферизации/эвристик тут больше нет — count()/flashing() авторитетно
  // считает родитель, этот вызов лишь сообщает ему «меня сейчас реально проверили».
  protected recordCheck(): string {
    this.checked.emit(this.id());
    return '';
  }

  /** Реальный DOM-клик — не во время CD, писать в signal здесь безопасно. */
  protected handleOwnClick(): void {
    this.ownClicks.update((n) => n + 1);
    this.ownClick.emit(this.id());
  }

  /** Родитель зовёт при Reset — сбрасывает только локальное (не переданное inputs) состояние. */
  resetOwn(): void {
    this.ownClicks.set(0);
  }
}

// ─── OnPush child ─────────────────────────────────────────────────────────────
// Та же инструментальная обвязка, что и у CdNodeDefault (см. комментарии выше).

@Component({
  selector: 'cd-node-onpush',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="cd-node"
      [class.flash]="flashing()"
      [class.cd-node--checked]="replayStatus() === 'checked'"
      [class.cd-node--skipped]="replayStatus() === 'skipped'"
      [attr.aria-label]="'OnPush node, checked ' + count() + ' times, value ' + value()"
    >{{ recordCheck() }}
      <span class="badge badge-onpush">OnPush</span>
      <div class="node-label">{{ label() }}</div>
      <div class="node-value">value: {{ value() }}</div>
      <div class="node-own">свои клики: {{ ownClicks() }}</div>
      <button type="button" class="node-click-btn" (click)="handleOwnClick()">
        Клик внутри карточки
      </button>
      <div class="check-count">checked {{ count() }} times</div>
    </div>
  `,
  styles: `
    .cd-node {
      background: var(--sb-surface-2);
      border: 1px solid var(--sb-border);
      border-radius: var(--sb-radius-sm);
      padding: var(--sb-space-3);
      display: flex;
      flex-direction: column;
      gap: var(--sb-space-1);
      transition: background 0.12s, border-color 0.12s, box-shadow 0.12s;
    }
    .cd-node.flash { background: var(--sb-warn-surface); border-color: var(--sb-warn); }
    .cd-node--checked { box-shadow: 0 0 0 2px var(--sb-success); }
    .cd-node--skipped { opacity: 0.55; }
    .badge {
      display: inline-block;
      font-size: 0.7rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      padding: 2px var(--sb-space-2);
      border-radius: var(--sb-radius-sm);
      flex-shrink: 0;
      width: fit-content;
    }
    .badge-onpush { background: var(--sb-success); color: var(--sb-accent-contrast); }
    .node-label { font-weight: 600; font-size: 0.88rem; color: var(--sb-text); }
    .node-value, .node-own {
      font-family: var(--sb-font-mono);
      font-size: 0.8rem;
      color: var(--sb-text-muted);
    }
    .check-count {
      font-family: var(--sb-font-mono);
      font-size: 0.85rem;
      font-weight: 700;
      color: var(--sb-accent);
    }
    .node-click-btn {
      align-self: flex-start;
      padding: var(--sb-space-1) var(--sb-space-2);
      border: 1px solid var(--sb-border);
      border-radius: var(--sb-radius-sm);
      background: var(--sb-surface);
      color: var(--sb-text);
      font: inherit;
      font-size: 0.78rem;
      cursor: pointer;
    }
    .node-click-btn:hover { background: var(--sb-surface-2); }
    .node-click-btn:focus-visible { outline: none; box-shadow: var(--sb-ring); }
  `,
})
export class CdNodeOnPush {
  readonly id = input.required<NodeId>();
  readonly label = input<string>('');
  readonly value = input<number>(0);
  readonly replayStatus = input<NodeCheckStatus | null>(null);
  /** Авторитетный счётчик «checked N times» — считает родитель внутри своего passOpen-окна. */
  readonly count = input<number>(0);
  /** Импульс вспышки после реального checked-прохода — включает/выключает родитель. */
  readonly flashing = input<boolean>(false);

  readonly checked = output<NodeId>();
  readonly ownClick = output<NodeId>();

  protected readonly ownClicks = signal(0);

  // Никакой буферизации/эвристик — count()/flashing() авторитетно считает родитель,
  // этот вызов лишь сообщает ему «меня сейчас реально проверили» (см. комментарий
  // над CdNodeDefault).
  protected recordCheck(): string {
    this.checked.emit(this.id());
    return '';
  }

  protected handleOwnClick(): void {
    this.ownClicks.update((n) => n + 1);
    this.ownClick.emit(this.id());
  }

  resetOwn(): void {
    this.ownClicks.set(0);
  }
}

// ─── Main component ───────────────────────────────────────────────────────────

@Component({
  selector: '{{selector}}',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './{{name}}.html',
  styleUrl: './{{name}}.less',
  imports: [CdNodeDefault, CdNodeOnPush, ExperimentCard, Stepper],
})
export class {{className}} {
  protected readonly parentCounter = signal(0);
  protected readonly sharedInput = signal(0);
  /** Обычное (НЕ signal) поле — демонстрация анти-паттерна «мутация без сигнала». */
  protected plainMutations = 0;
  protected readonly asyncPending = signal(false);

  protected readonly defaultNodes = computed(() =>
    NODES.filter((n) => n.strategy === 'default').map((n) => ({
      ...n,
      value: this.sharedInput(),
      count: this.nodeCounts().get(n.id) ?? 0,
      flashing: this.nodeFlashing().has(n.id),
    })),
  );
  protected readonly onpushNodes = computed(() =>
    NODES.filter((n) => n.strategy === 'onpush').map((n) => ({
      ...n,
      value: this.sharedInput(),
      count: this.nodeCounts().get(n.id) ?? 0,
      flashing: this.nodeFlashing().has(n.id),
    })),
  );

  // ─── Per-node "checked N times" badge + flash (authoritative, parent-owned) ──
  //
  // Раньше каждая карточка сама считала свои проверки эвристикой selfInflicted,
  // пытаясь отличить «эхо от своего же флаша» от «настоящей проверки». Эвристика
  // ломалась в двух местах: 1) resetOwn() обнулял selfInflicted ДО своих записей
  // в signal, поэтому вызванный ими же реальный проход засчитывался как новый
  // check сразу после Reset; 2) queueMicrotask родителя в finalizePass() (см.
  // ниже) пишет в signal ПОСЛЕ закрытия passOpen-окна, эта запись доходит до
  // Default-карточек (они проверяются всегда) и давала фантомный +1, которого
  // сама карточка не могла отличить от настоящего. Родитель уже надёжно считает
  // «сколько раз узел реально был checked» внутри своего passOpen-окна (см.
  // onNodeChecked/passChecked) — именно эти числа и раздаём детям через input().
  private readonly nodeCumulativeCounts = new Map<NodeId, number>();
  protected readonly nodeCounts = signal<ReadonlyMap<NodeId, number>>(new Map());
  protected readonly nodeFlashing = signal<ReadonlySet<NodeId>>(new Set());
  private readonly flashTimers = new Map<NodeId, ReturnType<typeof setTimeout>>();

  private readonly defaultNodeRefs = viewChildren(CdNodeDefault);
  private readonly onpushNodeRefs = viewChildren(CdNodeOnPush);
  private readonly card = viewChild(ExperimentCard);

  private readonly recorder = new RunRecorder<CdPassState>();
  /** Копия recorder.steps(), снятая ОДИН раз после завершения прохода. */
  protected readonly replaySteps = signal<ReplayStep<CdPassState>[]>([]);
  protected readonly stepPosition = signal(-1);
  protected readonly cardActualIndex = signal<number | null>(null);

  protected readonly hasReplay = computed(() => this.replaySteps().length > 0);

  /** Снимок текущего шага реплея; null = состояние до первого прохода. */
  protected readonly currentState = computed<CdPassState | null>(() => {
    const steps = this.replaySteps();
    const pos = this.stepPosition();
    if (pos < 0 || pos >= steps.length) return null;
    return steps[pos].state ?? null;
  });

  protected readonly currentActionLabel = computed(() => this.currentState()?.actionLabel ?? '');

  /** Статус узла НА ТЕКУЩЕМ шаге реплея (для подсветки дерева); null = ещё не раскрыт. */
  protected readonly nodeStatuses = computed<ReadonlyMap<NodeId, NodeStatus>>(() => {
    const state = this.currentState();
    const map = new Map<NodeId, NodeStatus>();
    if (state) for (const s of state.resolved) map.set(s.id, s);
    return map;
  });

  // ─── Prediction card content ─────────────────────────────────────────────────

  protected readonly cardQuestion =
    'Клик по кнопке ВНУТРИ карточки «OnPush — D» — какие компоненты будут проверены (checked) в этом CD-проходе?';
  protected readonly cardOptions = [
    'Только «OnPush — D»',
    '«Default — A», «Default — B» и «OnPush — D»',
    'Все четыре компонента',
    'Другая комбинация',
  ];
  protected readonly cardExplanation = computed(() => {
    if (this.cardActualIndex() === null) return '';
    return this.cardActualIndex() === CARD_DEFAULTS_PLUS_D
      ? 'Клик внутри «OnPush — D» помечает dirty именно её (и ветку до корня). Default-карточки ' +
        'проверяются на КАЖДОМ проходе, дошедшем до них, — dirty-маркер тут ни при чём. ' +
        '«OnPush — C» инпуты не менялись и сама она не была источником события — проверка пропущена.'
      : 'Реальная запись показывает другую комбинацию, чем ожидалось по правилам выше — ' +
        'посмотри «почему» у каждого шага в реплее ниже.';
  });

  // ─── CD pass tracking (plain state, NOT signals — safe to touch mid-CD) ──────

  private runId = 0;
  private passOpen = false;
  private passChecked = new Set<NodeId>();

  /** Реальная (не self-inflicted) проверка узла — копим, не пишем в signal. */
  protected onNodeChecked(id: NodeId): void {
    if (!this.passOpen) return;
    this.passChecked.add(id);
  }

  /** Пользователь кликнул кнопку ВНУТРИ карточки — это и есть триггер прохода. */
  protected onNodeOwnClick(id: NodeId): void {
    const node = NODES.find((n) => n.id === id);
    this.startPass(`Клик внутри карточки «${node?.label ?? id}»`, id, false);
  }

  protected triggerRootEvent(): void {
    this.startPass('Локальное событие (клик снаружи, вне карточек)', null, false);
    console.log('[CD] Local event — parentCounter updated');
    this.parentCounter.update((n) => n + 1);
  }

  protected updateSharedInput(): void {
    this.startPass('Set signal input — sharedInput изменился', null, true);
    console.log('[CD] Set signal input — sharedInput updated');
    this.sharedInput.update((n) => n + 1);
  }

  protected asyncUpdate(): void {
    if (this.asyncPending()) return;
    this.asyncPending.set(true);
    console.log('[CD] setTimeout scheduled — signal write in 500 ms (zoneless: сам таймер CD не запускает)');
    setTimeout(() => {
      this.asyncPending.set(false);
      this.startPass('setTimeout → сигнал (500 мс)', null, false);
      console.log('[CD] setTimeout fired — parentCounter.update() планирует CD-проход');
      this.parentCounter.update((n) => n + 1);
    }, 500);
  }

  /** Анти-паттерн: мутирует ОБЫЧНОЕ поле — Angular ничего не планирует. */
  protected mutatePlainField(): void {
    this.plainMutations++;
    console.log(
      '[CD] plainMutations изменено БЕЗ signal — CD не запланирован, экран не обновится сам',
    );
  }

  private startPass(actionLabel: string, originId: NodeId | null, inputChanged: boolean): void {
    this.runId++;
    const id = this.runId;
    this.passOpen = true;
    this.passChecked = new Set<NodeId>();
    // Настоящая макротаска: гарантирует, что запланированный CD-проход точно
    // улёгся, прежде чем мы закрываем окно наблюдения и читаем итог. Любые
    // «эхо»-проходы, вызванные уже НАШЕЙ собственной бухгалтерией в
    // finalizePass() (queueMicrotask ниже), приходят ПОСЛЕ этого закрытия —
    // onNodeChecked() их безопасно игнорирует по passOpen === false.
    setTimeout(() => {
      if (id !== this.runId) return; // прогон устарел (Reset/новый клик)
      this.passOpen = false;
      this.finalizePass(actionLabel, originId, inputChanged);
    }, 0);
  }

  private finalizePass(actionLabel: string, originId: NodeId | null, inputChanged: boolean): void {
    const checkedIds = this.passChecked;
    const orderedChecked = NODES.filter((n) => checkedIds.has(n.id));
    const orderedSkipped = NODES.filter((n) => !checkedIds.has(n.id));

    // Единственное место, где растёт «checked N times»: ровно те узлы, что
    // реально попали в passChecked ВНУТРИ закрытого окна этого прохода — то же
    // самое множество, что выше делится на checked/skipped для реплея. Никакой
    // отдельной эвристики в детях больше нет (см. комментарий у nodeCounts).
    // Это НЕ CD-контекст (мы внутри setTimeout(0) из startPass), запись в
    // signal здесь безопасна.
    for (const n of orderedChecked) {
      this.nodeCumulativeCounts.set(n.id, (this.nodeCumulativeCounts.get(n.id) ?? 0) + 1);
    }
    this.nodeCounts.set(new Map(this.nodeCumulativeCounts));
    this.pulseFlash(orderedChecked.map((n) => n.id));

    const resolved: NodeStatus[] = [];
    for (const n of orderedChecked) {
      const reason =
        n.strategy === 'default'
          ? `Default «${n.label}»: проверяется в каждом CD-проходе, независимо от инпутов`
          : n.id === originId
            ? `OnPush «${n.label}»: помечена dirty кликом внутри карточки`
            : inputChanged
              ? `OnPush «${n.label}»: помечена dirty сигналом — изменился её input`
              : `OnPush «${n.label}»: помечена dirty (событие внутри компонента)`;
      resolved.push({ id: n.id, label: n.label, strategy: n.strategy, status: 'checked', reason });
    }
    for (const n of orderedSkipped) {
      const reason =
        n.strategy === 'default'
          ? `Default «${n.label}»: проход не дошёл до дерева совсем — Default обычно проверяется всегда`
          : `OnPush «${n.label}»: инпуты не менялись, не помечена dirty — проверка пропущена`;
      resolved.push({ id: n.id, label: n.label, strategy: n.strategy, status: 'skipped', reason });
    }

    this.recorder.clear();
    for (let i = 0; i < resolved.length; i++) {
      const step = resolved[i];
      this.recorder.record({
        kind: step.status === 'checked' ? 'found' : 'check',
        label: `${step.label}: ${step.status}`,
        detail: step.reason,
        state: Object.freeze({ actionLabel, resolved: Object.freeze(resolved.slice(0, i + 1)) }),
      });
    }

    // recorder.record() уже поставил СВОЙ queueMicrotask-флаш в очередь (на первом
    // record() выше) — наш микротаск планируется ПОСЛЕ него и гарантированно
    // читает уже наполненный recorder.steps().
    queueMicrotask(() => {
      const steps = this.recorder.steps();
      this.replaySteps.set(steps);
      this.stepPosition.set(-1);
      if (originId === 'onpush-d') {
        this.cardActualIndex.set(this.resolveCardAnswer(new Set(orderedChecked.map((n) => n.id))));
      }
    });
  }

  /** Включает вспышку для реально checked-узлов этого прохода, гасит через 300 мс. */
  private pulseFlash(ids: readonly NodeId[]): void {
    if (ids.length === 0) return;
    const next = new Set(this.nodeFlashing());
    for (const id of ids) {
      next.add(id);
      const existingTimer = this.flashTimers.get(id);
      if (existingTimer !== undefined) clearTimeout(existingTimer);
      this.flashTimers.set(
        id,
        setTimeout(() => {
          this.flashTimers.delete(id);
          this.nodeFlashing.update((flashing) => {
            if (!flashing.has(id)) return flashing;
            const copy = new Set(flashing);
            copy.delete(id);
            return copy;
          });
        }, 300),
      );
    }
    this.nodeFlashing.set(next);
  }

  private resolveCardAnswer(checked: ReadonlySet<NodeId>): number {
    const onlyD = checked.size === 1 && checked.has('onpush-d');
    const defaultsPlusD =
      checked.size === 3 && checked.has('onpush-d') && checked.has('default-a') && checked.has('default-b');
    const allFour = checked.size === 4;
    if (onlyD) return CARD_ONLY_D;
    if (defaultsPlusD) return CARD_DEFAULTS_PLUS_D;
    if (allFour) return CARD_ALL_FOUR;
    return CARD_OTHER;
  }

  // ─── Reset ────────────────────────────────────────────────────────────────────

  protected reset(): void {
    this.runId++; // делает колбэк незавершённого startPass no-op
    this.passOpen = false;
    this.passChecked = new Set<NodeId>();
    this.recorder.clear();
    this.replaySteps.set([]);
    this.stepPosition.set(-1);
    this.cardActualIndex.set(null);
    this.card()?.reset();
    this.parentCounter.set(0);
    this.sharedInput.set(0);
    this.plainMutations = 0;
    this.asyncPending.set(false);
    for (const timer of this.flashTimers.values()) clearTimeout(timer);
    this.flashTimers.clear();
    this.nodeCumulativeCounts.clear();
    this.nodeCounts.set(new Map());
    this.nodeFlashing.set(new Set());
    for (const node of this.defaultNodeRefs()) node.resetOwn();
    for (const node of this.onpushNodeRefs()) node.resetOwn();
  }
}
