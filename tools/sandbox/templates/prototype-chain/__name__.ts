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

// ─── Types ────────────────────────────────────────────────────────────────────

/** Статус уровня цепочки на текущем шаге реплея. */
type LevelStatus = 'pending' | 'miss' | 'found';

/** Один уровень для реального обхода: собственные свойства + ссылка на объект (null = конец цепочки). */
interface LevelInfo {
  readonly label: string;
  readonly ownProps: readonly string[];
  readonly ref: object | null;
}

/** Снимок одного уровня для UI (без ссылки на объект — сериализуемый и иммутабельный). */
interface LevelSnapshot {
  readonly label: string;
  readonly ownProps: readonly string[];
  readonly status: LevelStatus;
}

/** Снимок ВСЕЙ цепочки ПОСЛЕ шага: какие уровни уже проверены и с каким результатом. */
interface ChainState {
  readonly levels: readonly LevelSnapshot[];
  /** Индекс уровня, который проверялся именно на этом шаге. */
  readonly activeIndex: number;
}

// ─── Real prototype chain ──────────────────────────────────────────────────────
// Настоящие классы → настоящая цепочка прототипов. Никакой имитации: Dog.prototype
// реально указывает на Animal.prototype, а тот — на Object.prototype.

class Animal {
  constructor(readonly name: string) {}

  speak(): string {
    return `${this.name} издаёт звук`;
  }
}

class Dog extends Animal {}

const dog = new Dog('Рекс');

/** Порядок и подписи реальных уровней (без синтетического null-терминала). */
const LEVEL_LABELS = ['dog', 'Dog.prototype', 'Animal.prototype', 'Object.prototype'] as const;

/** Индекс варианта карточки «свойство нигде не найдётся». */
const CARD_NOT_FOUND_INDEX = LEVEL_LABELS.length;

// ─── Helpers (real reflection, no hardcoding) ─────────────────────────────────

function labelOf(obj: object): string {
  if (obj === dog) return LEVEL_LABELS[0];
  if (obj === Dog.prototype) return LEVEL_LABELS[1];
  if (obj === Animal.prototype) return LEVEL_LABELS[2];
  if (obj === Object.prototype) return LEVEL_LABELS[3];
  return '(unknown)';
}

/** Только «читаемые» собственные имена — без служебных `__proto__`-аксессоров и `constructor`. */
function getOwnReadable(obj: object): string[] {
  return Object.getOwnPropertyNames(obj).filter((k) => !k.startsWith('__') && k !== 'constructor');
}

/** Строит цепочку ЧЕРЕЗ Object.getPrototypeOf от dog до null — реальный обход, не хардкод. */
function buildLevels(): LevelInfo[] {
  const levels: LevelInfo[] = [];
  let cur: object | null = dog;
  while (cur !== null) {
    levels.push({ label: labelOf(cur), ownProps: getOwnReadable(cur), ref: cur });
    cur = Object.getPrototypeOf(cur) as object | null;
  }
  levels.push({ label: 'null', ownProps: [], ref: null });
  return levels;
}

// ─── Main component ────────────────────────────────────────────────────────────

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

  private readonly recorder = new RunRecorder<ChainState>();

  protected readonly isRunning = signal(false);
  protected readonly selectedProp = signal('name');
  /**
   * Зеркалит наличие dog.speak как собственного свойства — только для UI,
   * источник правды — сам объект: dog живёт в модуле и переживает
   * перемонтирование компонента, поэтому стартовое значение читается рефлексией.
   */
  protected readonly shadowed = signal(Object.getOwnPropertyNames(dog).includes('speak'));

  /**
   * Копия recorder.steps(), снятая ОДИН раз после завершения прогона.
   * Степпер сбрасывается при каждой смене входа [steps], поэтому кормить его
   * растущим сигналом рекордера нельзя — только готовой записью.
   */
  protected readonly replaySteps = signal<ReplayStep<ChainState>[]>([]);
  protected readonly stepPosition = signal(-1);
  protected readonly cardActualIndex = signal<number | null>(null);

  private readonly card = viewChild(ExperimentCard);

  protected readonly hasReplay = computed(() => this.replaySteps().length > 0);

  protected readonly propertyOptions = ['name', 'speak', 'toString', 'fly'];

  /**
   * Реальная структура цепочки (лейблы + собственные свойства), пересчитывается
   * при переключении затенения. Видна ДО запуска — чтобы можно было рассуждать
   * о цепочке, ещё не нажав «Запустить».
   */
  protected readonly chainStructure = computed<LevelSnapshot[]>(() => {
    void this.shadowed(); // читаем как триггер: сам dog — не сигнал, шедоуинг сигнал лишь оповещает об изменении
    return buildLevels().map((level) => ({
      label: level.label,
      ownProps: level.ownProps,
      status: 'pending' as LevelStatus,
    }));
  });

  /** Уровни для отображения: снимок текущего шага реплея, иначе — статичная структура. */
  protected readonly displayLevels = computed<readonly LevelSnapshot[]>(() => {
    const steps = this.replaySteps();
    const pos = this.stepPosition();
    if (pos >= 0 && pos < steps.length) {
      return steps[pos].state?.levels ?? this.chainStructure();
    }
    return this.chainStructure();
  });

  /** Индекс уровня, подсвеченного как «проверяется сейчас» на текущем шаге; -1 = нет подсветки. */
  protected readonly activeIndex = computed<number>(() => {
    const steps = this.replaySteps();
    const pos = this.stepPosition();
    if (pos >= 0 && pos < steps.length) return steps[pos].state?.activeIndex ?? -1;
    return -1;
  });

  // ─── Prediction card content ─────────────────────────────────────────────────

  protected readonly cardQuestion = computed(
    () => `На каком уровне цепочки найдётся свойство «${this.selectedProp()}»?`,
  );
  protected readonly cardOptions = [...LEVEL_LABELS, 'не найдётся (undefined)'];
  protected readonly cardExplanation = computed(() => {
    const idx = this.cardActualIndex();
    if (idx === null) return '';
    const prop = this.selectedProp();
    if (idx === CARD_NOT_FOUND_INDEX) {
      return `«${prop}» отсутствует на всех уровнях — Object.getOwnPropertyNames не находит его нигде в цепочке, обращение вернёт undefined.`;
    }
    return (
      `«${prop}» — собственное свойство уровня ${this.cardOptions[idx]} ` +
      '(Object.getOwnPropertyNames это подтверждает), поиск останавливается здесь и выше не поднимается.'
    );
  });

  protected readonly scenarioCode = [
    'class Animal {',
    '  constructor(name) { this.name = name; }',
    '  speak() { return `${this.name} издаёт звук`; }',
    '}',
    '',
    'class Dog extends Animal {}',
    '',
    "const dog = new Dog('Рекс');",
    '',
    '// реальный обход при обращении к dog[prop]:',
    'let obj = dog;',
    'while (obj !== null) {',
    '  if (Object.getOwnPropertyNames(obj).includes(prop)) return obj[prop];',
    '  obj = Object.getPrototypeOf(obj);',
    '}',
    'return undefined; // свойство нигде не найдено',
  ].join('\n');

  // ─── Scenario (real code, recorded) ──────────────────────────────────────────

  protected runLookup(): void {
    if (this.isRunning()) return;
    const id = ++this.runId;
    this.recorder.clear();
    this.replaySteps.set([]);
    this.stepPosition.set(-1);
    this.cardActualIndex.set(null);
    this.isRunning.set(true);

    const prop = this.selectedProp();
    const levels = buildLevels();
    console.log(`[prototype-chain] поиск «${prop}» — реальный обход через Object.getPrototypeOf`);

    let snapshot: LevelSnapshot[] = levels.map((level) => ({
      label: level.label,
      ownProps: level.ownProps,
      status: 'pending' as LevelStatus,
    }));

    let foundLabel: string | null = null;

    for (let i = 0; i < levels.length; i++) {
      const level = levels[i];

      if (level.ref === null) {
        snapshot = snapshot.map((s, j) => (j === i ? { ...s, status: 'miss' as LevelStatus } : s));
        this.record(
          id,
          'miss',
          'null',
          `цепочка дошла до null — «${prop}» нигде не найдено, обращение вернёт undefined`,
          snapshot,
          i,
        );
        break;
      }

      // Настоящая проверка «есть ли СОБСТВЕННОЕ свойство здесь?» — не имитация.
      const hasOwn = Object.getOwnPropertyNames(level.ref).includes(prop);

      if (hasOwn) {
        snapshot = snapshot.map((s, j) => (j === i ? { ...s, status: 'found' as LevelStatus } : s));
        foundLabel = level.label;
        this.record(
          id,
          'found',
          level.label,
          `«${prop}» входит в Object.getOwnPropertyNames(${level.label}) — поиск остановлен здесь`,
          snapshot,
          i,
        );
        break;
      }

      snapshot = snapshot.map((s, j) => (j === i ? { ...s, status: 'miss' as LevelStatus } : s));
      this.record(
        id,
        'check',
        level.label,
        `«${prop}» отсутствует среди getOwnPropertyNames(${level.label}) — поднимаемся по [[Prototype]]`,
        snapshot,
        i,
      );
    }

    console.log(
      `[prototype-chain] поиск «${prop}» завершён —`,
      foundLabel !== null ? `найдено на ${foundLabel}` : 'не найдено (undefined)',
    );

    this.completeRun(id);
  }

  /** Записывает шаг + иммутабельный снимок цепочки ПОСЛЕ шага. */
  private record(
    runId: number,
    kind: 'check' | 'found' | 'miss',
    label: string,
    detail: string,
    levels: LevelSnapshot[],
    activeIndex: number,
  ): void {
    if (runId !== this.runId) return;
    this.recorder.record({
      kind,
      label,
      detail,
      state: Object.freeze({
        levels: Object.freeze(levels.map((l) => Object.freeze({ ...l }))),
        activeIndex,
      }),
    });
  }

  /**
   * Обход синхронный, но рекордер флашит запись в очередной микротаске.
   * Отложенный setTimeout гарантирует, что флаш уже произошёл; шаги копируются
   * в replaySteps ОДИН раз — степпер получает готовую запись, а не растущую.
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

  /** Ответ карточки — из РЕАЛЬНО записанного шага 'found' (или «не найдётся», если такого шага нет). */
  private resolveCardAnswer(steps: ReplayStep<ChainState>[]): number {
    const foundStep = steps.find((s) => s.kind === 'found');
    if (!foundStep) return CARD_NOT_FOUND_INDEX;
    const idx = LEVEL_LABELS.findIndex((label) => label === foundStep.label);
    return idx === -1 ? CARD_NOT_FOUND_INDEX : idx;
  }

  // ─── Controls ─────────────────────────────────────────────────────────────────

  protected selectProperty(prop: string): void {
    if (this.isRunning()) return;
    this.selectedProp.set(prop);
    this.reopenPrediction();
  }

  /** Добавляет/убирает НАСТОЯЩЕЕ собственное свойство dog.speak — реальное затенение, не имитация. */
  protected toggleShadow(): void {
    if (this.isRunning()) return;
    const target = dog as unknown as Record<string, unknown>;
    if (this.shadowed()) {
      delete target['speak'];
      this.shadowed.set(false);
      console.info(
        '[prototype-chain] удалено собственное dog.speak — затенение снято, speak снова резолвится на Animal.prototype',
      );
    } else {
      target['speak'] = function shadowSpeak(this: Record<string, unknown>): string {
        return `${String(this['name'])} гавкает (переопределено на экземпляре)`;
      };
      this.shadowed.set(true);
      console.info(
        '[prototype-chain] dog.speak — добавлено собственное свойство экземпляра, затеняет Animal.prototype.speak',
      );
    }
    this.reopenPrediction();
  }

  /**
   * Изменение сценария (свойство или шедоуинг) меняет правильный ответ — открываем
   * карточку для нового предсказания; сама запись предыдущего прогона не трогается.
   */
  private reopenPrediction(): void {
    this.cardActualIndex.set(null);
    this.card()?.reset();
  }

  protected reset(): void {
    this.runId++; // колбэки незавершённого прогона становятся no-op
    this.recorder.clear();
    this.replaySteps.set([]);
    this.stepPosition.set(-1);
    this.isRunning.set(false);
    this.cardActualIndex.set(null);
    this.card()?.reset();
    if (this.shadowed()) {
      delete (dog as unknown as Record<string, unknown>)['speak'];
      this.shadowed.set(false);
    }
    this.selectedProp.set('name');
  }
}
