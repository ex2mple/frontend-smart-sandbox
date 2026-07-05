import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  signal,
  untracked,
  viewChild,
  type WritableSignal,
} from '@angular/core';
import {
  ExperimentCard,
  ReplayStep,
  RunRecorder,
  Stepper,
} from '../../shared/learning';

// ─── Types ────────────────────────────────────────────────────────────────────

type NodeId = 'a' | 'b' | 'sum' | 'doubled' | 'effect';
type StepKind = 'action' | 'set' | 'recompute' | 'effect' | 'info';

/**
 * Снимок графа сигналов ПОСЛЕ шага записанного эксперимента «обновить A и B».
 * Иммутабельный (Object.freeze) — рекордер его не клонирует.
 */
interface GraphSnapshot {
  readonly a: number;
  readonly b: number;
  readonly sum: number;
  readonly doubled: number;
  readonly sumRecomputes: number;
  readonly doubledRecomputes: number;
  readonly effectRuns: number;
  /** Какой узел графа «сейчас» на очереди/сработал — для подсветки в реплее. */
  readonly activeNode: NodeId | null;
}

/** Индексы вариантов карточки-предсказания (см. cardOptions). */
const CARD_ONCE = 0;
const CARD_TWICE = 1;
const CARD_ZERO = 2;
const CARD_DEPENDS = 3;

@Component({
  selector: '{{selector}}',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './{{name}}.html',
  styleUrl: './{{name}}.less',
  imports: [ExperimentCard, Stepper],
})
export class {{className}} {
  // ── base signals ──────────────────────────────────────────────────────────
  protected readonly a = signal(1);
  protected readonly b = signal(2);

  // ── flash state for graph boxes ───────────────────────────────────────────
  // Each node flashes only when its part of the reactive graph ACTUALLY ran:
  // computed nodes pulse from inside their recompute, the effect node from
  // inside the effect. A no-op write (a.set(a())) recomputes nothing → no flash.
  protected readonly flashA = signal(false);
  protected readonly flashB = signal(false);
  protected readonly flashSum = signal(false);
  protected readonly flashDoubled = signal(false);
  protected readonly flashEffect = signal(false);

  /**
   * Счётчики пересчётов узлов ДЛЯ ОТОБРАЖЕНИЯ в графе (живые, растут при любом
   * реальном пересчёте, не только внутри записанного эксперимента). Источник
   * истины — plain-поля sumRecomputes/doubledRecomputes ниже: писать сигнал
   * СИНХРОННО внутри тела computed запрещено движком (и ломает zoneless-
   * правило), поэтому внутри computed растёт обычная переменная, а сигнал для
   * UI обновляется отложенно — в том же queueMicrotask, что и flash.
   */
  protected readonly sumCount = signal(0);
  protected readonly doubledCount = signal(0);

  // The app is zoneless: never write to a signal synchronously inside a
  // computed body or during change detection. queueMicrotask defers the write
  // until after the current reactive evaluation finishes.
  private pulse(sig: WritableSignal<boolean>, countSig?: WritableSignal<number>, countValue?: number): void {
    queueMicrotask(() => {
      sig.set(true);
      if (countSig && countValue !== undefined) countSig.set(countValue);
      setTimeout(() => sig.set(false), 300);
    });
  }

  // ── recompute counters (plain — NOT signals, safe to touch inside computed) ─
  /** Настоящее число пересчётов sum; обычное поле, не сигнал. */
  private sumRecomputes = 0;
  private doubledRecomputes = 0;

  // ── derived signals ───────────────────────────────────────────────────────
  // NOTE: console.info + the deferred pulse() inside computed are for demo
  // only — in production code computed factories must be pure/side-effect-free.
  protected readonly sum = computed(() => {
    this.sumRecomputes++;
    this.pulse(this.flashSum, this.sumCount, this.sumRecomputes);
    console.info(`[computed] sum recalculated (#${this.sumRecomputes})`);
    return this.a() + this.b();
  });

  protected readonly doubled = computed(() => {
    this.doubledRecomputes++;
    this.pulse(this.flashDoubled, this.doubledCount, this.doubledRecomputes);
    console.info(`[computed] doubled recalculated (#${this.doubledRecomputes})`);
    return this.sum() * 2;
  });

  // ── effect run counter ────────────────────────────────────────────────────
  protected readonly effectRuns = signal(0);

  private readonly _trackEffect = effect(() => {
    const v = this.doubled();
    // Use untracked so reading effectRuns inside effect does NOT create a
    // dependency on effectRuns itself (avoids an infinite loop). Writing a
    // signal FROM an effect (unlike from a computed) is supported by Angular.
    untracked(() => {
      this.effectRuns.update((n) => n + 1);
    });
    // Flash the effect node exactly when the effect actually runs.
    this.pulse(this.flashEffect);
    console.log(`[effect] doubled changed → ${v}`);
  });

  // ── flash a/b when they actually change ───────────────────────────────────
  // Driven by the reactive system (not by button handlers): the effect reruns
  // only when the signal's value really changed, so a.set(a()) flashes nothing.
  private readonly _flashAOnChange = effect(() => {
    this.a();
    this.pulse(this.flashA);
  });

  private readonly _flashBOnChange = effect(() => {
    this.b();
    this.pulse(this.flashB);
  });

  // ── untracked demo ────────────────────────────────────────────────────────
  // x is only read via untracked inside untrackedResult, so changes to x
  // do NOT trigger recomputation.
  protected readonly x = signal(10);

  protected readonly untrackedResult = computed(() => {
    // Intentionally NOT tracking x — reads a() but x via untracked.
    const aVal = this.a();
    const xVal = untracked(() => this.x());
    console.info('[computed] untrackedResult recalculated (only when a changes)');
    return aVal + xVal;
  });

  // ── controls ──────────────────────────────────────────────────────────────
  protected incA(): void {
    this.a.update((n) => n + 1);
  }

  protected decA(): void {
    this.a.update((n) => n - 1);
  }

  protected incB(): void {
    this.b.update((n) => n + 1);
  }

  protected decB(): void {
    this.b.update((n) => n - 1);
  }

  /**
   * Set a to its current value — Angular skips recompute when value is same.
   * Watch the graph: NO node flashes, because nothing actually recomputed.
   */
  protected setANoop(): void {
    this.a.set(this.a());
    console.log('[noop] a.set(a()) called — no recompute because value unchanged');
  }

  protected incX(): void {
    this.x.update((n) => n + 1);
    console.log(`[untracked demo] x changed → ${this.x()} (untrackedResult will NOT recompute)`);
  }

  // ─── Glitch-free experiment: «обновить A и B» ───────────────────────────────
  //
  // Реальный клик пишет a И b в ОДНОМ синхронном обработчике. Пересчёт sum/
  // doubled ленивый (computed) — он произойдёт максимум один раз, при
  // следующем реальном чтении, а не дважды на каждый set(). Шаги записываются
  // РЕКОРДЕРОМ СНАРУЖИ реактивного контекста: сначала в самом обработчике
  // (действие + оба set), затем в queueMicrotask (форсируем чтение computed —
  // обычный вызов метода, не тело computed), затем в setTimeout (даём эффекту
  // гарантированно отработать перед тем, как прочитать его счётчик).

  /** Токен прогона: колбэки устаревшего эксперимента (после Reset/повтора) — no-op. */
  private runId = 0;
  private readonly recorder = new RunRecorder<GraphSnapshot>();

  protected readonly isRunning = signal(false);
  /**
   * Копия recorder.steps(), снятая ОДИН раз после завершения эксперимента.
   * Степпер сбрасывается при каждой смене входа [steps], поэтому кормить его
   * растущим сигналом рекордера нельзя — только готовой записью.
   */
  protected readonly replaySteps = signal<ReplayStep<GraphSnapshot>[]>([]);
  protected readonly stepPosition = signal(-1);
  protected readonly cardActualIndex = signal<number | null>(null);
  /** Снимок «до клика» — показывается при позиции −1 (степпер ещё не шагал). */
  protected readonly beforeSnapshot = signal<GraphSnapshot | null>(null);

  private readonly card = viewChild(ExperimentCard);

  protected readonly hasReplay = computed(() => this.replaySteps().length > 0);

  /** Снимок графа для текущего шага степпера; -1 = состояние до клика. */
  protected readonly currentState = computed<GraphSnapshot | null>(() => {
    const steps = this.replaySteps();
    const pos = this.stepPosition();
    if (pos < 0 || pos >= steps.length) return this.beforeSnapshot();
    return steps[pos].state ?? this.beforeSnapshot();
  });

  // ─── Prediction card content ─────────────────────────────────────────────────

  protected readonly cardQuestion = 'Кнопка «обновить A и B»: сколько раз пересчитается sum?';
  protected readonly cardOptions = ['1', '2', '0', 'зависит'];
  protected readonly cardExplanation = computed(() => {
    switch (this.cardActualIndex()) {
      case CARD_ZERO:
        return 'Новые значения совпали со старыми — Angular пропускает запись, пересчёта не было вовсе.';
      case CARD_TWICE:
        return 'Необычный результат: обычно оба set() в одном синхронном обработчике сливаются в ОДИН пересчёт, а не в два.';
      default:
        return 'sum — ленивый computed: он не пересчитывается на каждый set(), а только при следующем реальном чтении. ' +
          'Оба сигнала записаны в одном синхронном блоке, поэтому к моменту чтения оба изменения уже учтены — пересчёт один (glitch-free).';
    }
  });

  /** Настоящий клик: пишет a и b, затем ЗАПИСЫВАЕТ реально произошедшую последовательность пересчёта. */
  protected updateBoth(): void {
    if (this.isRunning()) return;
    const id = ++this.runId;
    this.recorder.clear();
    this.replaySteps.set([]);
    this.stepPosition.set(-1);
    this.cardActualIndex.set(null);
    this.card()?.reset();
    this.isRunning.set(true);

    const prevA = this.a();
    const prevB = this.b();
    const nextA = prevA + 3;
    const nextB = prevB + 4;
    // Сначала форсируем чтение sum/doubled, ПОТОМ снимаем счётчики: если граф
    // остался «грязным» с прошлого клика, этот пересчёт не попадёт в дельту прогона.
    const sumValueBefore = this.sum();
    const doubledValueBefore = this.doubled();
    const sumBefore = this.sumRecomputes;
    const doubledBefore = this.doubledRecomputes;
    const effectBefore = this.effectRuns();

    const before: GraphSnapshot = Object.freeze({
      a: prevA,
      b: prevB,
      sum: sumValueBefore,
      doubled: doubledValueBefore,
      sumRecomputes: sumBefore,
      doubledRecomputes: doubledBefore,
      effectRuns: effectBefore,
      activeNode: null,
    });
    this.beforeSnapshot.set(before);

    this.recordStep(
      id,
      'action',
      'клик «обновить A и B»',
      `a: ${prevA}→${nextA}, b: ${prevB}→${nextB} — оба set() в одном синхронном обработчике`,
      before,
    );

    this.a.set(nextA);
    this.recordStep(
      id,
      'set',
      `a = ${nextA}`,
      'sum и doubled ЕЩЁ не пересчитаны — computed ленивый, ждёт следующего реального чтения',
      Object.freeze({ ...before, a: nextA, activeNode: 'a' as const }),
    );

    this.b.set(nextB);
    this.recordStep(
      id,
      'set',
      `b = ${nextB}`,
      'оба сигнала уже записаны — граф всё ещё не пересчитан',
      Object.freeze({ ...before, a: nextA, b: nextB, activeNode: 'b' as const }),
    );

    // Читаем computed СНАРУЖИ реактивного контекста — обычный метод, не тело
    // computed/effect, поэтому запись шага рекордером здесь безопасна.
    queueMicrotask(() => {
      if (id !== this.runId) return;
      const sumValue = this.sum(); // форсирует пересчёт, если ещё «грязный»
      const sumAfter = this.sumRecomputes;
      this.recordStep(
        id,
        'recompute',
        `sum пересчитан (${sumBefore}→${sumAfter})`,
        'первое чтение sum() после ОБОИХ set() — оба изменения слились в один пересчёт',
        Object.freeze({ ...before, a: nextA, b: nextB, sum: sumValue, sumRecomputes: sumAfter, activeNode: 'sum' as const }),
      );

      const doubledValue = this.doubled();
      const doubledAfter = this.doubledRecomputes;
      this.recordStep(
        id,
        'recompute',
        `doubled пересчитан (${doubledBefore}→${doubledAfter})`,
        'doubled зависит только от sum — тоже ровно один пересчёт',
        Object.freeze({
          ...before,
          a: nextA,
          b: nextB,
          sum: sumValue,
          doubled: doubledValue,
          sumRecomputes: sumAfter,
          doubledRecomputes: doubledAfter,
          activeNode: 'doubled' as const,
        }),
      );

      // setTimeout: гарантированно ПОСЛЕ любых микротасок, которыми Angular
      // мог отложить реальный запуск effect — читаем effectRuns уже настоящим.
      setTimeout(() => {
        if (id !== this.runId) return;
        const effectAfter = this.effectRuns();
        this.recordStep(
          id,
          'effect',
          `effect сработал (${effectBefore}→${effectAfter})`,
          'эффект тоже реагирует один раз на пачку из двух изменений',
          Object.freeze({
            ...before,
            a: nextA,
            b: nextB,
            sum: sumValue,
            doubled: doubledValue,
            sumRecomputes: sumAfter,
            doubledRecomputes: doubledAfter,
            effectRuns: effectAfter,
            activeNode: 'effect' as const,
          }),
        );

        const sumDelta = sumAfter - sumBefore;
        this.recordStep(
          id,
          'info',
          'обновление завершено',
          `Δsum=${sumDelta}, Δdoubled=${doubledAfter - doubledBefore}, Δeffect=${effectAfter - effectBefore} — ` +
            'несмотря на 2 set(), каждый узел пересчитался максимум один раз (glitch-free)',
          Object.freeze({
            ...before,
            a: nextA,
            b: nextB,
            sum: sumValue,
            doubled: doubledValue,
            sumRecomputes: sumAfter,
            doubledRecomputes: doubledAfter,
            effectRuns: effectAfter,
            activeNode: null,
          }),
        );

        this.completeRun(id, sumDelta);
      });
    });
  }

  /** Записывает шаг + иммутабельный снимок графа ПОСЛЕ шага. */
  private recordStep(id: number, kind: StepKind, label: string, detail: string, state: GraphSnapshot): void {
    if (id !== this.runId) return;
    this.recorder.record({ kind, label, detail, state });
  }

  /**
   * Последний шаг записан. RunRecorder буферизует запись и флашит в signal
   * через queueMicrotask — дожидаемся ещё один тик, чтобы гарантированно
   * забрать ПОСЛЕДНИЙ шаг, прежде чем копировать steps() в replaySteps ОДИН
   * раз (степпер получает готовую запись, а не растущую).
   */
  private completeRun(runId: number, sumDelta: number): void {
    queueMicrotask(() => {
      if (runId !== this.runId) return;
      this.isRunning.set(false);
      const steps = this.recorder.steps();
      this.replaySteps.set(steps);
      this.cardActualIndex.set(this.resolveCardAnswer(sumDelta));
    });
  }

  /** Ответ карточки — из РЕАЛЬНО посчитанной разницы счётчика sum, не захардкожен. */
  private resolveCardAnswer(sumDelta: number): number {
    if (sumDelta === 1) return CARD_ONCE;
    if (sumDelta === 2) return CARD_TWICE;
    if (sumDelta === 0) return CARD_ZERO;
    return CARD_DEPENDS;
  }

  protected resetExperiment(): void {
    this.runId++; // колбэки незавершённого эксперимента становятся no-op
    this.recorder.clear();
    this.replaySteps.set([]);
    this.stepPosition.set(-1);
    this.cardActualIndex.set(null);
    this.beforeSnapshot.set(null);
    this.isRunning.set(false);
    this.card()?.reset();
  }
}
