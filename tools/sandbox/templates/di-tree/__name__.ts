import {
  ChangeDetectionStrategy,
  Component,
  Injectable,
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

/** Три узла дерева инжекторов, участвующие в обходе. */
type NodeId = 'grandchild' | 'branch' | 'root';

/**
 * Визуальный статус узла НА ТЕКУЩЕМ шаге обхода.
 * 'passed-empty'  — инжектор проверен, провайдера нет, поиск идёт дальше вверх.
 * 'skipped'       — инжектор НЕ проверялся вовсе (пропущен модификатором @SkipSelf/@Self).
 * 'found'         — здесь нашёлся провайдер, обход останавливается.
 * 'not-found'     — обход дошёл до конца (или @Self не проверяет родителей) и ничего не нашёл.
 */
type NodeVisual = 'idle' | 'passed-empty' | 'skipped' | 'found' | 'not-found';

/** Модификатор запроса, который выбирает пользователь для Grandchild. */
type Modifier = 'default' | 'self' | 'skipSelf' | 'optional';

/** Снимок дерева ПОСЛЕ шага обхода: статус каждого узла + текущий «активный». */
interface WalkState {
  readonly statuses: Readonly<Record<NodeId, NodeVisual>>;
  /** Узел, который разбирается именно на этом шаге (получает пульс-подсветку). */
  readonly activeNode: NodeId | null;
  /** Итоговый результат — заполняется только на последнем шаге обхода. */
  readonly resultLabel: string | null;
}

const IDLE_STATUSES: Readonly<Record<NodeId, NodeVisual>> = Object.freeze({
  grandchild: 'idle',
  branch: 'idle',
  root: 'idle',
});

const EMPTY_STATE: WalkState = Object.freeze({
  statuses: IDLE_STATUSES,
  activeNode: null,
  resultLabel: null,
});

/** Индексы вариантов карточки-предсказания (общий набор для всех модификаторов). */
const CARD_ROOT = 0;
const CARD_BRANCH = 1;
const CARD_GRANDCHILD = 2;
const CARD_NOT_FOUND = 3;

// ─── Reporting bus (НЕ часть тестируемой иерархии DI) ─────────────────────────

/** Реальные id, о которых сообщил inject(TokenService) в Grandchild. */
interface GrandchildResults {
  readonly defaultId: number;
  readonly skipSelfId: number;
  readonly selfId: number | null;
  readonly selfError: string | null;
  readonly optionalId: number | null;
}

/**
 * Служебная шина для сбора РЕАЛЬНЫХ результатов инъекции из Root/Branch/
 * Grandchild в одном месте (обычный providedIn:'root' синглтон, НЕ связан с
 * TokenService — не влияет на дерево, которое демонстрируется). Каждый узел
 * пишет в неё простым присваиванием поля в конструкторе — это НЕ запись в
 * signal, поэтому CD-безопасно даже во время построения дерева.
 */
@Injectable({ providedIn: 'root' })
export class InstanceReportBus {
  rootId: number | null = null;
  branchId: number | null = null;
  grandchild: GrandchildResults | null = null;
}

// ─── Services with unique instance counter ────────────────────────────────────

let seq = 0;

@Injectable({ providedIn: 'root' })
export class TokenService {
  readonly id = ++seq;
}

/** Ни разу не зарегистрирован ни в одном инжекторе — идеален для @Optional. */
@Injectable()
export class ExtraService {
  readonly id = ++seq;
}

// ─── Grandchild component (no own provider — inherits branch's instance) ──────

@Component({
  selector: 'di-grandchild',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="di-node di-node--grandchild"
      [class.di-node--passed]="status() === 'passed-empty'"
      [class.di-node--skipped]="status() === 'skipped'"
      [class.di-node--found]="status() === 'found'"
      [class.di-node--not-found]="status() === 'not-found'"
      [class.di-node--pulse]="pulse()"
      role="region"
      aria-label="Grandchild node"
    >
      <div class="di-node-header">
        <span class="di-badge di-badge--branch">компонент, без providers</span>
        <span class="di-node-title">Grandchild</span>
        @if (statusLabel()) {
          <span class="di-status-chip" [class]="'di-status-chip--' + status()">{{ statusLabel() }}</span>
        }
      </div>
      <dl class="di-facts">
        <div class="di-fact">
          <dt>inject(TokenService)</dt>
          <dd><span class="di-id-badge">&#35;{{ defaultResult.id }}</span></dd>
        </div>
        <div class="di-fact">
          <dt>{{ '{ skipSelf: true }' }}</dt>
          <dd><span class="di-id-badge">&#35;{{ skipSelfResult.id }}</span></dd>
        </div>
        <div class="di-fact">
          <dt>{{ '{ self: true }' }}</dt>
          <dd>
            @if (selfAttempt.error) {
              <span class="di-null-badge" aria-label="ошибка">!</span>
              <span class="di-note">NullInjectorError — своего провайдера нет</span>
            } @else {
              <span class="di-id-badge">&#35;{{ selfAttempt.id }}</span>
            }
          </dd>
        </div>
        <div class="di-fact">
          <dt>{{ 'inject(ExtraService, { optional: true })' }}</dt>
          <dd>
            @if (optionalResult !== null) {
              <span class="di-id-badge">&#35;{{ optionalResult.id }}</span>
            } @else {
              <span class="di-null-badge" aria-label="null">—</span>
            }
          </dd>
        </div>
      </dl>
    </div>
  `,
})
export class DiGrandchild {
  /** Статус узла на текущем шаге обхода — красит рамку/бейдж. */
  readonly status = input<NodeVisual>('idle');
  /** true на шаге, где именно этот узел разбирается прямо сейчас. */
  readonly pulse = input(false);
  /** Текстовая подпись статуса (не только цвет — того требует WCAG). */
  readonly statusLabel = input('');

  private readonly bus = inject(InstanceReportBus);

  // Обычный inject: своего провайдера нет → находит провайдер Branch.
  readonly defaultResult = inject(TokenService);
  // @SkipSelf: пропускает ТОЛЬКО свой (пустой) инжектор → тот же путь наверх,
  // тот же провайдер Branch. Правильно: skipSelf ≠ «пропустить предка».
  readonly skipSelfResult = inject(TokenService, { skipSelf: true });
  // @Self: проверяет ТОЛЬКО свой инжектор — родителей не смотрит вовсе.
  // Своего провайдера нет → реальная NullInjectorError, перехватываем её
  // синхронно (вызов inject() в этой же исполняемой функции — контекст
  // внедрения ещё активен), чтобы демка не упала.
  readonly selfAttempt: { id: number | null; error: string | null } = (() => {
    try {
      return { id: inject(TokenService, { self: true }).id, error: null };
    } catch (err) {
      return { id: null, error: err instanceof Error ? err.message : String(err) };
    }
  })();
  // @Optional на токене, которого нет НИГДЕ в дереве → настоящий null.
  readonly optionalResult = inject(ExtraService, { optional: true });

  constructor() {
    // Простое присваивание поля — не запись в signal, безопасно во время CD.
    this.bus.grandchild = {
      defaultId: this.defaultResult.id,
      skipSelfId: this.skipSelfResult.id,
      selfId: this.selfAttempt.id,
      selfError: this.selfAttempt.error,
      optionalId: this.optionalResult?.id ?? null,
    };
    console.info(
      `[DI Grandchild] default=#${this.defaultResult.id} skipSelf=#${this.skipSelfResult.id} ` +
        `self=${this.selfAttempt.error ? 'NullInjectorError' : '#' + this.selfAttempt.id} ` +
        `optional=${this.optionalResult === null ? 'null' : '#' + this.optionalResult.id}`,
    );
  }
}

// ─── Branch component — declares its own provider ────────────────────────────

@Component({
  selector: 'di-branch',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [TokenService],
  imports: [DiGrandchild],
  template: `
    <div
      class="di-node di-node--branch"
      [class.di-node--passed]="status() === 'passed-empty'"
      [class.di-node--skipped]="status() === 'skipped'"
      [class.di-node--found]="status() === 'found'"
      [class.di-node--not-found]="status() === 'not-found'"
      [class.di-node--pulse]="pulse()"
      role="region"
      aria-label="Branch node"
    >
      <div class="di-node-header">
        <span class="di-badge di-badge--branch">providers: [TokenService]</span>
        <span class="di-node-title">Branch</span>
        @if (statusLabel()) {
          <span class="di-status-chip" [class]="'di-status-chip--' + status()">{{ statusLabel() }}</span>
        }
      </div>
      <dl class="di-facts">
        <div class="di-fact">
          <dt>inject(TokenService)</dt>
          <dd>
            <span class="di-id-badge">&#35;{{ own.id }}</span>
            <span class="di-note">собственный провайдер — новый экземпляр</span>
          </dd>
        </div>
        <div class="di-fact">
          <dt>{{ '{ skipSelf: true }' }}</dt>
          <dd>
            <span class="di-id-badge di-id-badge--root">&#35;{{ parentInst.id }}</span>
            <span class="di-note">
              здесь @SkipSelf пропускает НЕПУСТОЙ собственный провайдер → результат
              меняется на Root (&#35;{{ parentInst.id }}). Контраст с Grandchild, где
              свой инжектор и так пуст — там skipSelf ничего не меняет.
            </span>
          </dd>
        </div>
      </dl>
      <div class="di-children">
        <di-grandchild
          [status]="grandchildStatus()"
          [pulse]="grandchildPulse()"
          [statusLabel]="grandchildStatusLabel()"
        />
      </div>
    </div>
  `,
})
export class DiBranch {
  readonly status = input<NodeVisual>('idle');
  readonly pulse = input(false);
  readonly statusLabel = input('');
  /** Прокидываются дальше вниз — Grandchild не виден из Root напрямую. */
  readonly grandchildStatus = input<NodeVisual>('idle');
  readonly grandchildPulse = input(false);
  readonly grandchildStatusLabel = input('');

  private readonly bus = inject(InstanceReportBus);

  // Собственный провайдер: свежий экземпляр для этого узла и его потомков.
  readonly own = inject(TokenService);
  // @SkipSelf: пропускает СВОЙ (непустой!) провайдер → идёт выше и находит
  // только Root — здесь дерево провайдеров кончается сразу после Branch.
  readonly parentInst = inject(TokenService, { skipSelf: true });

  constructor() {
    this.bus.branchId = this.own.id;
    console.info(`[DI Branch] own=#${this.own.id} skipSelf=#${this.parentInst.id} (Root)`);
  }
}

// ─── Root (main) component ────────────────────────────────────────────────────

@Component({
  selector: '{{selector}}',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './{{name}}.html',
  styleUrl: './{{name}}.less',
  imports: [DiBranch, ExperimentCard, Stepper],
})
export class {{className}} {
  private readonly bus = inject(InstanceReportBus);
  /** Токен прогона: колбэки устаревшего обхода (после Reset/смены модификатора) — no-op. */
  private runId = 0;
  private readonly recorder = new RunRecorder<WalkState>();

  // Root-синглтон — providedIn: 'root'.
  readonly rootInst = inject(TokenService);

  constructor() {
    this.bus.rootId = this.rootInst.id;
    console.info(`[DI Root] TokenService root id=${this.rootInst.id} (singleton)`);
  }

  protected readonly isRunning = signal(false);
  protected readonly selectedModifier = signal<Modifier>('default');
  /** Копия recorder.steps(), снятая ОДИН раз после завершения обхода. */
  protected readonly replaySteps = signal<ReplayStep<WalkState>[]>([]);
  protected readonly stepPosition = signal(-1);
  protected readonly cardActualIndex = signal<number | null>(null);

  private readonly card = viewChild(ExperimentCard);

  protected readonly hasReplay = computed(() => this.replaySteps().length > 0);

  /** Снимок статусов дерева для текущего шага степпера; -1 = ничего не тронуто. */
  protected readonly currentState = computed<WalkState>(() => {
    const steps = this.replaySteps();
    const pos = this.stepPosition();
    if (pos < 0 || pos >= steps.length) return EMPTY_STATE;
    return steps[pos].state ?? EMPTY_STATE;
  });

  protected readonly modifierOptions: ReadonlyArray<{ value: Modifier; label: string }> = [
    { value: 'default', label: 'по умолчанию' },
    { value: 'self', label: '@Self' },
    { value: 'skipSelf', label: '@SkipSelf' },
    { value: 'optional', label: '@Optional (ExtraService)' },
  ];

  protected readonly scenarioSnippet = computed<string>(() => {
    switch (this.selectedModifier()) {
      case 'self':
        return "readonly value = inject(TokenService, { self: true });\n// у Grandchild своего провайдера нет → NullInjectorError";
      case 'skipSelf':
        return 'readonly value = inject(TokenService, { skipSelf: true });\n// пропускает только СВОЙ (пустой) инжектор Grandchild';
      case 'optional':
        return "readonly value = inject(ExtraService, { optional: true });\n// ExtraService не зарегистрирован нигде в дереве";
      default:
        return 'readonly value = inject(TokenService);\n// обычный поиск вверх по дереву инжекторов';
    }
  });

  // ─── Prediction card content ─────────────────────────────────────────────────

  protected readonly cardOptions = [
    'Root',
    'Branch',
    'Grandchild (свой инжектор)',
    'не найден — null / NullInjectorError',
  ];

  protected readonly cardQuestion = computed(() => {
    switch (this.selectedModifier()) {
      case 'self':
        return 'Что вернёт inject(TokenService, { self: true }) у Grandchild?';
      case 'skipSelf':
        return 'Где @SkipSelf у Grandchild найдёт сервис?';
      case 'optional':
        return 'Что вернёт inject(ExtraService, { optional: true }) у Grandchild?';
      default:
        return 'Куда пойдёт обычный inject(TokenService) у Grandchild — своего провайдера у него нет?';
    }
  });

  protected readonly cardExplanation = computed<string>(() => {
    if (this.cardActualIndex() === null) return '';
    const branchId = this.bus.branchId ?? '?';
    switch (this.selectedModifier()) {
      case 'self':
        return '@Self смотрит ТОЛЬКО в инжектор самого узла, родителей не проверяет вовсе. ' +
          'У Grandchild своего провайдера нет → настоящая NullInjectorError (без { optional: true }).';
      case 'skipSelf':
        return `@SkipSelf пропускает ТОЛЬКО собственный инжектор Grandchild. У него и без модификатора ` +
          `провайдера нет, поэтому результат совпадает с обычным inject: поиск идёт вверх и находит ` +
          `провайдер Branch (#${branchId}). Это НЕ «пропустить ближайшего предка» — инжектор Branch ` +
          'проверяется как обычно, просто первым.';
      case 'optional':
        return 'ExtraService не зарегистрирован ни у Grandchild, ни у Branch, ни у Root — поиск доходит ' +
          'до конца дерева. { optional: true } превращает то, что иначе было бы NullInjectorError, в null.';
      default:
        return `У Grandchild своего провайдера нет — поиск идёт вверх и останавливается на первом ` +
          `найденном провайдере: Branch (#${branchId}).`;
    }
  });

  // ─── Walk (real code, recorded) ───────────────────────────────────────────────

  protected selectModifier(modifier: Modifier): void {
    if (this.selectedModifier() === modifier) return;
    this.selectedModifier.set(modifier);
    this.reopenPrediction();
  }

  protected runWalk(): void {
    if (this.isRunning()) return;
    const modifier = this.selectedModifier();
    const id = ++this.runId;
    this.recorder.clear();
    this.replaySteps.set([]);
    this.stepPosition.set(-1);
    this.cardActualIndex.set(null);
    this.isRunning.set(true);

    const hops = this.buildHops(modifier);
    for (const hop of hops) {
      console.info('[di-tree]', hop.label, '—', hop.detail);
      this.recorder.record(hop);
    }

    // Данные обхода уже реальны и синхронны — ждём только флаша рекордера
    // (он сам планирует queueMicrotask при первом record()); наш колбэк
    // встаёт в очередь микрозадач ПОСЛЕ него, поэтому steps() будет полон.
    queueMicrotask(() => {
      if (id !== this.runId) return;
      this.isRunning.set(false);
      const steps = this.recorder.steps();
      this.replaySteps.set(steps);
      this.cardActualIndex.set(this.resolveCardAnswer(steps));
    });
  }

  /**
   * Строит список шагов обхода из РЕАЛЬНО зафиксированных id (this.bus).
   * Топология статична (мы её написали), но какой узел «найден» и какой id
   * показан — берётся из настоящих значений inject(), а не хардкодится.
   */
  private buildHops(modifier: Modifier): Array<Omit<ReplayStep<WalkState>, 'index'>> {
    const g = this.bus.grandchild;
    const branchId = this.bus.branchId;
    if (!g || branchId === null) return [];

    const withStatuses = (over: Partial<Record<NodeId, NodeVisual>>): Record<NodeId, NodeVisual> => ({
      grandchild: 'idle',
      branch: 'idle',
      root: 'idle',
      ...over,
    });

    if (modifier === 'default' || modifier === 'skipSelf') {
      const skipping = modifier === 'skipSelf';
      const grandchildVisual: NodeVisual = skipping ? 'skipped' : 'passed-empty';
      const resultId = skipping ? g.skipSelfId : g.defaultId;
      return [
        {
          kind: 'check',
          label: skipping ? 'Grandchild: @SkipSelf' : 'Grandchild: свой инжектор',
          detail: skipping
            ? 'пропускаем ТОЛЬКО свой инжектор (не проверяем, есть ли тут провайдер) → идём к родителю'
            : 'своего провайдера нет → идём к родителю',
          state: Object.freeze({
            statuses: Object.freeze(withStatuses({ grandchild: grandchildVisual })),
            activeNode: 'grandchild',
            resultLabel: null,
          }),
        },
        {
          kind: 'found',
          label: 'Branch: свой инжектор',
          detail: `провайдер есть → возвращаем экземпляр #${resultId}` +
            (skipping ? ' — тот же экземпляр, что и без модификатора' : ''),
          state: Object.freeze({
            statuses: Object.freeze(withStatuses({ grandchild: grandchildVisual, branch: 'found' })),
            activeNode: 'branch',
            resultLabel: `#${resultId} — экземпляр Branch`,
          }),
        },
      ];
    }

    if (modifier === 'self') {
      return [
        {
          kind: 'miss',
          label: 'Grandchild: @Self',
          detail: `проверяем ТОЛЬКО свой инжектор (родителей не смотрим вовсе) → провайдера нет → ` +
            `${g.selfError ?? 'NullInjectorError'}`,
          state: Object.freeze({
            statuses: Object.freeze(withStatuses({ grandchild: 'not-found' })),
            activeNode: 'grandchild',
            resultLabel: 'ошибка NullInjectorError',
          }),
        },
      ];
    }

    // optional (ExtraService) — реально не зарегистрирован нигде в дереве.
    return [
      {
        kind: 'check',
        label: 'Grandchild: свой инжектор',
        detail: 'ExtraService не зарегистрирован → идём к родителю',
        state: Object.freeze({
          statuses: Object.freeze(withStatuses({ grandchild: 'passed-empty' })),
          activeNode: 'grandchild',
          resultLabel: null,
        }),
      },
      {
        kind: 'check',
        label: 'Branch: свой инжектор',
        detail: 'ExtraService не зарегистрирован → идём выше',
        state: Object.freeze({
          statuses: Object.freeze(withStatuses({ grandchild: 'passed-empty', branch: 'passed-empty' })),
          activeNode: 'branch',
          resultLabel: null,
        }),
      },
      {
        kind: 'miss',
        label: 'Root: конец дерева инжекторов',
        detail: 'нигде не зарегистрирован → @Optional вернёт null (без { optional: true } была бы NullInjectorError)',
        state: Object.freeze({
          statuses: Object.freeze(
            withStatuses({ grandchild: 'passed-empty', branch: 'passed-empty', root: 'not-found' }),
          ),
          activeNode: 'root',
          resultLabel: 'null',
        }),
      },
    ];
  }

  /** Ответ карточки — из РЕАЛЬНО записанного последнего шага обхода. */
  private resolveCardAnswer(steps: ReplayStep<WalkState>[]): number {
    const last = steps[steps.length - 1]?.state;
    if (!last) return CARD_NOT_FOUND;
    if (last.statuses.branch === 'found') return CARD_BRANCH;
    if (last.statuses.root === 'found') return CARD_ROOT;
    if (last.statuses.grandchild === 'found') return CARD_GRANDCHILD;
    return CARD_NOT_FOUND;
  }

  /** Текстовая подпись статуса — цвет не единственный носитель смысла (WCAG). */
  protected statusLabel(status: NodeVisual): string {
    switch (status) {
      case 'passed-empty':
        return 'пропущен (пусто)';
      case 'skipped':
        return 'пропущен (@SkipSelf)';
      case 'found':
        return 'найден';
      case 'not-found':
        return 'не найден';
      default:
        return '';
    }
  }

  private reopenPrediction(): void {
    this.runId++; // колбэк незавершённого обхода становится no-op
    this.recorder.clear();
    this.replaySteps.set([]);
    this.stepPosition.set(-1);
    this.cardActualIndex.set(null);
    this.isRunning.set(false);
    this.card()?.reset();
  }

  protected reset(): void {
    this.selectedModifier.set('default');
    this.reopenPrediction();
  }
}
