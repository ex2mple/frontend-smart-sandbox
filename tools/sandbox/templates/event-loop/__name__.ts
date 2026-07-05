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

/** Бейдж шага: фазы event loop + служебный маркер «скрипт закончился». */
type StepKind = 'sync' | 'microtask' | 'macrotask' | 'info';

type TaskKind = 'setTimeout' | 'promise' | 'queueMicrotask' | 'sync';

interface QueuedTask {
  id: number;
  kind: TaskKind;
  label: string;
}

/**
 * Снимок трёх колонок ПОСЛЕ шага. Зеркала очередей ведутся в коде сценария
 * рядом с настоящими вызовами планирования: push при регистрации колбэка,
 * удаление — из самого колбэка, когда движок его реально запустил. Порядок
 * выполнения задаёт движок, зеркало лишь фиксирует его.
 */
interface LoopState {
  readonly stack: readonly string[];
  readonly micro: readonly string[];
  readonly macro: readonly string[];
}

const EMPTY_STATE: LoopState = { stack: [], micro: [], macro: [] };

/** Индекс варианта «другая строка (добавленная задача)» в cardOptions. */
const CARD_OTHER_INDEX = 3;

// ─── Main component ────────────────────────────────────────────────────────────

@Component({
  selector: '{{selector}}',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './{{name}}.html',
  styleUrl: './{{name}}.less',
  imports: [ExperimentCard, Stepper],
})
export class {{className}} {
  private taskIdCounter = 0;
  private pendingMacrotasks = 0;
  /** Токен прогона: колбэки устаревшего прогона (после Reset/Run) — no-op. */
  private runId = 0;

  private readonly recorder = new RunRecorder<LoopState>();
  /** Зеркала очередей движка; мутируются только кодом сценария. */
  private mirrorMicro: string[] = [];
  private mirrorMacro: string[] = [];

  protected readonly isRunning = signal(false);
  protected readonly extraTasks = signal<QueuedTask[]>([]);
  /**
   * Копия recorder.steps(), снятая ОДИН раз после завершения прогона.
   * Степпер сбрасывается при каждой смене входа [steps], поэтому кормить его
   * растущим сигналом рекордера нельзя — только готовой записью.
   */
  protected readonly replaySteps = signal<ReplayStep<LoopState>[]>([]);
  protected readonly stepPosition = signal(-1);
  protected readonly cardActualIndex = signal<number | null>(null);

  private readonly card = viewChild(ExperimentCard);

  protected readonly hasReplay = computed(() => this.replaySteps().length > 0);

  /** Снимок колонок для текущего шага степпера; -1 = состояние до запуска. */
  protected readonly currentState = computed<LoopState>(() => {
    const steps = this.replaySteps();
    const pos = this.stepPosition();
    if (pos < 0 || pos >= steps.length) return EMPTY_STATE;
    return steps[pos].state ?? EMPTY_STATE;
  });

  // ─── Prediction card content ─────────────────────────────────────────────────

  protected readonly cardQuestion = 'Какая строка вывода появится ТРЕТЬЕЙ?';
  protected readonly cardOptions = [
    'sync 2',
    'timeout A (макротаска)',
    'promise .then (микротаска)',
    'другая строка (добавленная задача)',
  ];
  protected readonly cardExplanation = computed(() =>
    this.cardActualIndex() === CARD_OTHER_INDEX
      ? 'Добавленные sync-задачи выполняются ещё в синхронном блоке — сразу после sync 2, ' +
        'до любых микротасок. Поэтому третья строка — добавленная задача.'
      : 'Синхронный код выполняется до конца (sync 1, sync 2), затем движок сливает ВСЕ ' +
        'микротаски — promise .then обгоняет любой setTimeout, даже с задержкой 0.',
  );

  protected readonly scenarioCode = [
    "console.log('sync 1');",
    '',
    'setTimeout(() => {                    // timeout A',
    "  console.log('timeout A');",
    '  Promise.resolve().then(() =>',
    "    console.log('микротаска из timeout A'));",
    '});',
    "setTimeout(() => console.log('timeout B'));",
    '',
    "Promise.resolve().then(() => console.log('promise .then'));",
    "queueMicrotask(() => console.log('queueMicrotask'));",
    '',
    "console.log('sync 2');",
    '// …добавленные задачи допишутся сюда',
  ].join('\n');

  // ─── Scenario (real code, recorded) ──────────────────────────────────────────

  protected runScenario(): void {
    if (this.isRunning()) return;
    const id = ++this.runId;
    this.recorder.clear();
    this.replaySteps.set([]);
    this.stepPosition.set(-1);
    this.cardActualIndex.set(null);
    this.mirrorMicro = [];
    this.mirrorMacro = [];
    this.pendingMacrotasks = 0;
    this.isRunning.set(true);
    console.log('[event-loop] Прогон сценария (реальный код, реальный порядок)');

    const extras = this.extraTasks();

    // ── Синхронный блок скрипта ───────────────────────────────────────────────

    this.record('sync', 'sync 1', 'синхронный код выполняется сразу — стек занят скриптом', 'скрипт');

    this.scheduleMacro(
      id,
      'timeout A',
      'стек и микротаски пусты — цикл берёт ОДНУ макротаску; внутри планируется новая микротаска',
      () => {
        // Настоящая вложенная микротаска — сердце сценария: она обгонит timeout B.
        this.scheduleMicro(
          id,
          'микротаска из timeout A',
          'микротаски сливаются ВСЕ между макротасками — она обгоняет timeout B',
          'promise',
        );
      },
    );
    this.scheduleMacro(
      id,
      'timeout B',
      'только после слива микротасок очередь макротасок отдаёт следующую задачу',
    );

    this.scheduleMicro(
      id,
      'promise .then',
      'стек опустел — движок сливает ВСЕ микротаски до первой макротаски',
      'promise',
    );
    this.scheduleMicro(
      id,
      'queueMicrotask',
      'вторая микротаска из той же очереди — порядок регистрации сохраняется',
      'queueMicrotask',
    );

    this.record('sync', 'sync 2', 'всё ещё синхронный блок: таймеры и промисы уже ждут в очередях', 'скрипт');

    // Дополнительные задачи дописываются в КОНЕЦ скрипта (после sync 2):
    // их sync-строки печатаются сразу, микротаски встают за встроенными,
    // макротаски — после timeout B.
    for (const task of extras) {
      if (task.kind === 'setTimeout') {
        this.scheduleMacro(id, task.label, 'дополнительная макротаска — в конец очереди, после timeout B');
      } else if (task.kind === 'promise') {
        this.scheduleMicro(id, task.label, 'дополнительная микротаска — сольётся вместе с остальными, до макротасок', 'promise');
      } else if (task.kind === 'queueMicrotask') {
        this.scheduleMicro(id, task.label, 'дополнительная микротаска — сольётся вместе с остальными, до макротасок', 'queueMicrotask');
      } else {
        this.record('sync', task.label, 'дополнительная синхронная строка — печатается ещё в скрипте', 'скрипт');
      }
    }

    // Реальный момент: синхронный блок закончился, стек опустел.
    this.record('info', 'скрипт закончился', 'стек пуст — цикл сливает микротаски, затем берёт макротаску', null);
  }

  /**
   * Планирует НАСТОЯЩУЮ макротаску. Зеркало: push при регистрации, удаление —
   * когда движок реально вызвал колбэк. `inside` выполняется внутри колбэка
   * (вложенное планирование) до снимка, чтобы снимок показал его последствия.
   */
  private scheduleMacro(id: number, label: string, detail: string, inside?: () => void): void {
    this.mirrorMacro.push(label);
    this.pendingMacrotasks++;
    setTimeout(() => {
      if (id !== this.runId) return;
      this.removeFromMirror(this.mirrorMacro, label);
      inside?.();
      this.record('macrotask', label, detail, label);
      this.pendingMacrotasks--;
      if (this.pendingMacrotasks === 0) this.completeRun(id);
    });
  }

  /** Планирует НАСТОЯЩУЮ микротаску через выбранный API. */
  private scheduleMicro(
    id: number,
    label: string,
    detail: string,
    via: 'promise' | 'queueMicrotask',
  ): void {
    this.mirrorMicro.push(label);
    const callback = (): void => {
      if (id !== this.runId) return;
      this.removeFromMirror(this.mirrorMicro, label);
      this.record('microtask', label, detail, label);
    };
    if (via === 'queueMicrotask') {
      queueMicrotask(callback);
    } else {
      Promise.resolve().then(callback);
    }
  }

  private removeFromMirror(mirror: string[], label: string): void {
    const index = mirror.indexOf(label);
    if (index !== -1) mirror.splice(index, 1);
  }

  /** Записывает шаг + иммутабельный снимок колонок ПОСЛЕ шага. */
  private record(kind: StepKind, label: string, detail: string, frame: string | null): void {
    if (kind !== 'info') console.log('[event-loop]', label);
    this.recorder.record({
      kind,
      label,
      detail,
      state: Object.freeze({
        stack: frame === null ? [] : [frame],
        micro: [...this.mirrorMicro],
        macro: [...this.mirrorMacro],
      }),
    });
  }

  /**
   * Последняя макротаска отработала. Отложенный setTimeout гарантирует, что
   * все хвостовые микротаски (и flush рекордера) слились; шаги копируются в
   * replaySteps ОДИН раз — степпер получает готовую запись, а не растущую.
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

  /** Ответ карточки — из РЕАЛЬНО записанных шагов (extras могут его менять). */
  private resolveCardAnswer(steps: ReplayStep<LoopState>[]): number {
    const outputs = steps.filter((step) => step.kind !== 'info');
    const third = outputs[2];
    if (!third) return CARD_OTHER_INDEX;
    const byLabel: Record<string, number> = {
      'sync 2': 0,
      'timeout A': 1,
      'promise .then': 2,
    };
    return byLabel[third.label] ?? CARD_OTHER_INDEX;
  }

  // ─── Extras builder / reset ──────────────────────────────────────────────────

  protected addTask(kind: TaskKind): void {
    const labels: Record<TaskKind, string> = {
      setTimeout: 'extra setTimeout',
      promise: 'extra promise',
      queueMicrotask: 'extra queueMicrotask',
      sync: 'extra sync',
    };
    // id в подписи — метки уникальны даже после удалений (важно для @for track).
    const id = ++this.taskIdCounter;
    this.extraTasks.update((list) => [...list, { id, kind, label: labels[kind] + ' #' + id }]);
    this.reopenPrediction();
  }

  protected removeTask(id: number): void {
    this.extraTasks.update((list) => list.filter((t) => t.id !== id));
    this.reopenPrediction();
  }

  /**
   * Изменение сценария меняет правильный ответ — открываем карточку для
   * нового предсказания, не трогая сами добавленные задачи (в отличие от reset()).
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
    this.extraTasks.set([]);
    this.isRunning.set(false);
    this.cardActualIndex.set(null);
    this.card()?.reset();
    this.pendingMacrotasks = 0;
    this.mirrorMicro = [];
    this.mirrorMacro = [];
    this.taskIdCounter = 0;
  }
}
