// src/app/sandboxes/shared/learning/stepper.ts
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { ReplayStep } from './run-recorder';

/**
 * Реплей записанного прогона: Шаг / Авто / Сначала + прогрессивно
 * раскрываемый список шагов. Родитель слушает (positionChange) и ведёт
 * собственные визуализации (очереди, дерево CD и т.п.).
 */
@Component({
  selector: 'sb-stepper',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="sbs__controls" role="group" aria-label="Управление воспроизведением шагов">
      <button
        type="button"
        class="sbs__btn"
        (click)="advance()"
        [disabled]="atEnd()"
        aria-label="Следующий шаг"
      >
        Шаг →
      </button>
      <button
        type="button"
        class="sbs__btn"
        (click)="toggleAuto()"
        [disabled]="atEnd() && !playing()"
        [attr.aria-label]="playing() ? 'Пауза' : 'Автовоспроизведение'"
        [attr.aria-pressed]="playing()"
      >
        {{ playing() ? '⏸ Пауза' : '▶ Авто' }}
      </button>
      <button
        type="button"
        class="sbs__btn"
        (click)="restart()"
        [disabled]="position() === -1"
        aria-label="Сначала"
      >
        ⟲ Сначала
      </button>
      <span class="sbs__progress" aria-live="polite">{{ position() + 1 }} / {{ steps().length }}</span>
    </div>
    @if (visibleSteps().length > 0) {
      <ol class="sbs__list" aria-label="Выполненные шаги">
        @for (step of visibleSteps(); track step.index) {
          <li
            class="sbs__item"
            [class.sbs__item--current]="step.index === position()"
            [attr.aria-current]="step.index === position() ? 'step' : null"
          >
            <span [class]="badgeClass(step.kind)">{{ step.kind }}</span>
            <span class="sbs__label">{{ step.label }}</span>
            @if (step.detail) {
              <span class="sbs__detail">{{ step.detail }}</span>
            }
          </li>
        }
      </ol>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--sb-space-2);
      font-family: var(--sb-font-sans);
    }

    .sbs__controls {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: var(--sb-space-2);
    }

    .sbs__btn {
      padding: var(--sb-space-1) var(--sb-space-2);
      border: 1px solid var(--sb-border);
      border-radius: var(--sb-radius-sm);
      background: var(--sb-surface);
      color: var(--sb-text);
      font: inherit;
      font-size: 0.8125rem;
      cursor: pointer;
    }

    .sbs__btn:hover:not(:disabled) {
      background: var(--sb-surface-2);
    }

    .sbs__btn:disabled {
      opacity: 0.5;
      cursor: default;
    }

    .sbs__btn:focus-visible {
      outline: none;
      box-shadow: var(--sb-ring);
    }

    .sbs__progress {
      font-size: 0.8125rem;
      font-variant-numeric: tabular-nums;
      color: var(--sb-text-muted);
    }

    .sbs__list {
      margin: 0;
      padding: 0;
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: var(--sb-space-1);
    }

    .sbs__item {
      display: flex;
      align-items: baseline;
      flex-wrap: wrap;
      gap: var(--sb-space-2);
      padding: var(--sb-space-1) var(--sb-space-2);
      border: 1px solid transparent;
      border-radius: var(--sb-radius-sm);
    }

    .sbs__item--current {
      border-color: var(--sb-accent);
      background: rgba(79, 70, 229, 0.06);
    }

    .sbs__label {
      color: var(--sb-text);
      font-size: 0.875rem;
    }

    .sbs__detail {
      color: var(--sb-text-muted);
      font-size: 0.8125rem;
    }

    /* Бейджи по kind. Базовый стиль = fallback для неизвестных kind. */
    .sb-step {
      flex: 0 0 auto;
      padding: 0 0.55em;
      border-radius: 999px;
      font-size: 0.6875rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.02em;
      background: var(--sb-surface-2);
      color: var(--sb-text-muted);
    }

    .sb-step--sync {
      background: rgba(79, 70, 229, 0.1);
      color: var(--sb-accent);
    }

    .sb-step--microtask {
      background: rgba(4, 120, 87, 0.1);
      color: var(--sb-success);
    }

    .sb-step--macrotask {
      /* --sb-warn слишком светлый для мелкого текста (AA), локально темнее. */
      background: var(--sb-warn-surface);
      color: #8a5a13;
    }

    .sb-step--check {
      background: var(--sb-surface-2);
      color: var(--sb-text-muted);
    }

    .sb-step--found {
      background: var(--sb-success);
      color: var(--sb-accent-contrast);
    }

    .sb-step--miss {
      background: var(--sb-danger);
      color: var(--sb-accent-contrast);
    }

    .sb-step--info {
      background: var(--sb-surface-2);
      color: var(--sb-text-muted);
    }
  `,
})
export class Stepper {
  /**
   * Записанные шаги текущего прогона (от RunRecorder).
   *
   * Подавайте ЗАВЕРШЁННЫЙ массив (скопированный после окончания прогона),
   * а не живой `recorder.steps()`: рекордер флашит пачками по ходу записи,
   * каждая новая идентичность массива сбрасывает position в -1.
   */
  readonly steps = input.required<ReplayStep[]>();
  /** Задержка автовоспроизведения, мс. */
  readonly autoDelayMs = input(800);

  /** -1 = до первого шага; N = шаги 0..N «выполнены». */
  private readonly _position = signal(-1);
  readonly position = this._position.asReadonly();

  readonly positionChange = output<number>();

  protected readonly playing = signal(false);
  protected readonly atEnd = computed(() => this._position() >= this.steps().length - 1);
  protected readonly visibleSteps = computed(() => this.steps().slice(0, this._position() + 1));

  private intervalId: ReturnType<typeof setInterval> | undefined;

  private static readonly KNOWN_KINDS = new Set([
    'sync',
    'microtask',
    'macrotask',
    'check',
    'found',
    'miss',
    'info',
  ]);

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stopAuto());
    // Новый прогон записан (сменился массив шагов) — начинаем с начала.
    // untracked: иначе чтение _position внутри setPosition сделало бы позицию
    // зависимостью эффекта, и каждый шаг откатывался бы обратно к -1.
    effect(() => {
      this.steps();
      untracked(() => {
        this.stopAuto();
        this.setPosition(-1);
      });
    });
  }

  protected advance(): void {
    const last = this.steps().length - 1;
    if (this._position() >= last) return;
    this.setPosition(this._position() + 1);
    if (this._position() >= last) this.stopAuto();
  }

  protected toggleAuto(): void {
    if (this.playing()) {
      this.stopAuto();
      return;
    }
    if (this.atEnd()) return;
    this.playing.set(true);
    this.intervalId = setInterval(() => this.advance(), this.autoDelayMs());
  }

  protected restart(): void {
    this.stopAuto();
    this.setPosition(-1);
  }

  protected badgeClass(kind: string): string {
    return Stepper.KNOWN_KINDS.has(kind) ? `sb-step sb-step--${kind}` : 'sb-step';
  }

  private setPosition(value: number): void {
    if (this._position() === value) return;
    this._position.set(value);
    this.positionChange.emit(value);
  }

  private stopAuto(): void {
    if (this.intervalId !== undefined) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    this.playing.set(false);
  }
}
