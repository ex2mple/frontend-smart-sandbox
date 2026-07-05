// src/app/sandboxes/shared/learning/run-recorder.ts
import { computed, signal } from '@angular/core';

/**
 * Один шаг реального прогона демки. Демка запускает НАСТОЯЩИЙ код и
 * записывает, что произошло; ничего не подделывается.
 */
export interface ReplayStep<S = unknown> {
  /** 0-based, выдаётся рекордером. */
  readonly index: number;
  /** Ключ бейджа, задаётся демкой: 'sync' | 'microtask' | 'check' | 'found' | … */
  readonly kind: string;
  /** Короткая человеческая строка, например «sync 1». */
  readonly label: string;
  /** Необязательная однострочная аннотация «почему». */
  readonly detail?: string;
  /**
   * Снимок состояния демки ПОСЛЕ шага (например, содержимое очереди).
   * Должен быть иммутабельным снапшотом — рекордер его не клонирует.
   */
  readonly state?: S;
}

/**
 * Записывает реальный прогон как список шагов для последующего реплея.
 *
 * record() может вызываться из async-колбэков (безопасно), но также и
 * синхронно ПРЯМО ВО ВРЕМЯ change detection. Приложение zoneless: запись в
 * signal в такой момент пометила бы владельца грязным и запланировала новый
 * CD-проход — риск бесконечного цикла. Поэтому шаги копятся в обычном
 * массиве и сбрасываются в signal один раз, в микротаске после окончания
 * прохода (тот же паттерн, что у шины таймлайна lifecycle-шаблона).
 */
export class RunRecorder<S = unknown> {
  private readonly _steps = signal<ReplayStep<S>[]>([]);
  private _buffer: ReplayStep<S>[] = [];
  private _flushScheduled = false;
  private _nextIndex = 0;

  /** Записанные шаги; обновляется пачкой один раз на микротаск. */
  readonly steps = this._steps.asReadonly();

  readonly isEmpty = computed(() => this._steps().length === 0);

  /** Добавляет шаг, присваивая ему следующий индекс. */
  record(step: Omit<ReplayStep<S>, 'index'>): void {
    this._buffer.push({ ...step, index: this._nextIndex++ });
    if (this._flushScheduled) return;
    this._flushScheduled = true;
    queueMicrotask(() => {
      this._flushScheduled = false;
      this.flush();
    });
  }

  /** Сбрасывает шаги, буфер и нумерацию. */
  clear(): void {
    this._buffer = [];
    this._nextIndex = 0;
    this._steps.set([]);
  }

  private flush(): void {
    const batch = this._buffer;
    this._buffer = [];
    if (batch.length === 0) return;
    this._steps.update((list) => [...list, ...batch]);
  }
}
