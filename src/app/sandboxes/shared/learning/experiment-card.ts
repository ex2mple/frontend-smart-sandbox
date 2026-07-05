// src/app/sandboxes/shared/learning/experiment-card.ts
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';

/**
 * Карточка-эксперимент «предскажи результат»: вопрос → чипы-варианты →
 * (родитель запускает НАСТОЯЩИЙ код и выставляет actualIndex) → вердикт.
 * Компонент глупый: сам ничего не запускает.
 */
@Component({
  selector: 'sb-experiment-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p class="sbx__question">{{ question() }}</p>
    <div class="sbx__chips" role="group" aria-label="Варианты ответа">
      @for (option of options(); track $index) {
        <button
          type="button"
          class="sbx__chip"
          [class.sbx__chip--chosen]="chosen() === $index"
          [class.sbx__chip--actual]="revealed() && actualIndex() === $index"
          [attr.aria-pressed]="chosen() === $index"
          [disabled]="revealed()"
          (click)="pick($index)"
        >
          {{ option }}
        </button>
      }
    </div>
    <div class="sbx__result" aria-live="polite">
      @if (revealed()) {
        @if (chosen() !== null) {
          <p
            class="sbx__verdict"
            [class.sbx__verdict--ok]="correct()"
            [class.sbx__verdict--fail]="!correct()"
          >
            {{ correct() ? 'Верно ✓' : 'Не угадал ✗' }}
          </p>
        }
        <p class="sbx__actual">Правильный ответ: {{ actualLabel() }}</p>
        @if (explanation()) {
          <p class="sbx__explanation">{{ explanation() }}</p>
        }
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      padding: var(--sb-space-3);
      border: 1px solid var(--sb-border);
      border-radius: var(--sb-radius);
      background: var(--sb-surface);
      font-family: var(--sb-font-sans);
    }

    .sbx__question {
      margin: 0 0 var(--sb-space-2);
      font-weight: 600;
      color: var(--sb-text);
    }

    .sbx__chips {
      display: flex;
      flex-wrap: wrap;
      gap: var(--sb-space-2);
    }

    .sbx__chip {
      padding: var(--sb-space-1) var(--sb-space-3);
      border: 1px solid var(--sb-border);
      border-radius: 999px;
      background: var(--sb-surface);
      color: var(--sb-text);
      font: inherit;
      font-size: 0.875rem;
      cursor: pointer;
    }

    .sbx__chip:hover:not(:disabled) {
      background: var(--sb-surface-2);
    }

    .sbx__chip:disabled {
      cursor: default;
    }

    .sbx__chip:focus-visible {
      outline: none;
      box-shadow: var(--sb-ring);
    }

    .sbx__chip--chosen {
      background: var(--sb-accent);
      border-color: var(--sb-accent);
      color: var(--sb-accent-contrast);
    }

    .sbx__chip--chosen:hover:not(:disabled) {
      background: var(--sb-accent-hover);
    }

    .sbx__chip--actual {
      border-color: var(--sb-success);
      box-shadow: inset 0 0 0 1px var(--sb-success);
    }

    .sbx__verdict {
      margin: var(--sb-space-3) 0 0;
      font-weight: 600;
    }

    .sbx__verdict--ok {
      color: var(--sb-success);
    }

    .sbx__verdict--fail {
      color: var(--sb-danger);
    }

    .sbx__actual {
      margin: var(--sb-space-1) 0 0;
      color: var(--sb-text);
      font-size: 0.875rem;
    }

    .sbx__explanation {
      margin: var(--sb-space-2) 0 0;
      color: var(--sb-text-muted);
      font-size: 0.875rem;
    }
  `,
})
export class ExperimentCard {
  readonly question = input.required<string>();
  /** 2–4 чипа с вариантами. */
  readonly options = input.required<string[]>();
  /** Родитель выставляет после реального запуска; null = ещё не запускали. */
  readonly actualIndex = input<number | null>(null);
  /** Пояснение «почему», показывается после раскрытия. */
  readonly explanation = input<string>('');

  readonly predicted = output<number>();

  protected readonly chosen = signal<number | null>(null);
  protected readonly revealed = computed(() => this.actualIndex() !== null);
  protected readonly correct = computed(
    () => this.chosen() !== null && this.chosen() === this.actualIndex(),
  );
  protected readonly actualLabel = computed(() => {
    const i = this.actualIndex();
    return i === null ? '' : (this.options()[i] ?? '');
  });

  protected pick(index: number): void {
    if (this.revealed()) return;
    this.chosen.set(index);
    this.predicted.emit(index);
  }

  /** Родитель зовёт при перезапуске эксперимента (сам сбросив actualIndex). */
  reset(): void {
    this.chosen.set(null);
  }
}
