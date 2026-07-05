import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  signal,
} from '@angular/core';

// ─── Default child ────────────────────────────────────────────────────────────
//
// Инструментирование в zoneless-приложении:
// recordCheck() вызывается из шаблона, то есть ровно тогда, когда Angular
// реально выполняет шаблон компонента (dirty-check). Писать в signal прямо
// оттуда нельзя (NG0100 / новый CD-проход из CD), поэтому проверки копятся в
// обычном поле и переносятся в signal checkCount одним queueMicrotask-флашем
// после прохода. Сам флаш (и снятие вспышки) тоже перерисовывают компонент —
// эти «свои» проходы помечаются selfInflicted и не считаются, иначе счётчик
// раскручивал бы сам себя бесконечно.

@Component({
  selector: 'cd-node-default',
  changeDetection: ChangeDetectionStrategy.Default,
  template: `
    <div
      class="cd-node"
      [class.flash]="flashing()"
      [attr.aria-label]="'Default node, checked ' + checkCount() + ' times, value ' + value()"
    >{{ recordCheck() }}
      <span class="badge badge-default">Default</span>
      <div class="node-label">{{ label() }}</div>
      <div class="node-value">value: {{ value() }}</div>
      <div class="check-count">checked {{ checkCount() }} times</div>
    </div>
  `,
})
export class CdNodeDefault {
  readonly label = input<string>('');
  readonly value = input<number>(0);

  protected readonly checkCount = signal(0);
  protected readonly flashing = signal(false);

  private pendingChecks = 0;
  private flushScheduled = false;
  private selfInflicted = 0;
  private flashTimer: ReturnType<typeof setTimeout> | null = null;

  // Выполняется при каждом реальном выполнении шаблона; всегда отдаёт ''.
  protected recordCheck(): string {
    if (this.selfInflicted > 0) {
      this.selfInflicted--;
      return '';
    }
    this.pendingChecks++;
    if (!this.flushScheduled) {
      this.flushScheduled = true;
      queueMicrotask(() => {
        this.flushScheduled = false;
        this.flush();
      });
    }
    return '';
  }

  private flush(): void {
    const n = this.pendingChecks;
    this.pendingChecks = 0;
    if (n === 0) return;
    // Эти записи в signal вызовут ровно одну перерисовку этой карточки.
    this.selfInflicted++;
    this.checkCount.update((c) => c + n);
    this.flashing.set(true);
    if (this.flashTimer !== null) clearTimeout(this.flashTimer);
    this.flashTimer = setTimeout(() => {
      this.flashTimer = null;
      this.selfInflicted++;
      this.flashing.set(false);
    }, 300);
  }
}

// ─── OnPush child ─────────────────────────────────────────────────────────────
// Та же инструментальная обвязка, что и у CdNodeDefault (см. комментарий выше).

@Component({
  selector: 'cd-node-onpush',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="cd-node"
      [class.flash]="flashing()"
      [attr.aria-label]="'OnPush node, checked ' + checkCount() + ' times, value ' + value()"
    >{{ recordCheck() }}
      <span class="badge badge-onpush">OnPush</span>
      <div class="node-label">{{ label() }}</div>
      <div class="node-value">value: {{ value() }}</div>
      <div class="check-count">checked {{ checkCount() }} times</div>
    </div>
  `,
})
export class CdNodeOnPush {
  readonly label = input<string>('');
  readonly value = input<number>(0);

  protected readonly checkCount = signal(0);
  protected readonly flashing = signal(false);

  private pendingChecks = 0;
  private flushScheduled = false;
  private selfInflicted = 0;
  private flashTimer: ReturnType<typeof setTimeout> | null = null;

  protected recordCheck(): string {
    if (this.selfInflicted > 0) {
      this.selfInflicted--;
      return '';
    }
    this.pendingChecks++;
    if (!this.flushScheduled) {
      this.flushScheduled = true;
      queueMicrotask(() => {
        this.flushScheduled = false;
        this.flush();
      });
    }
    return '';
  }

  private flush(): void {
    const n = this.pendingChecks;
    this.pendingChecks = 0;
    if (n === 0) return;
    this.selfInflicted++;
    this.checkCount.update((c) => c + n);
    this.flashing.set(true);
    if (this.flashTimer !== null) clearTimeout(this.flashTimer);
    this.flashTimer = setTimeout(() => {
      this.flashTimer = null;
      this.selfInflicted++;
      this.flashing.set(false);
    }, 300);
  }
}

// ─── Main component ───────────────────────────────────────────────────────────

@Component({
  selector: '{{selector}}',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './{{name}}.html',
  styleUrl: './{{name}}.less',
  imports: [CdNodeDefault, CdNodeOnPush],
})
export class {{className}} {
  protected readonly parentCounter = signal(0);
  protected readonly sharedInput = signal(0);

  protected readonly defaultNodes = computed(() => [
    { label: 'Default — A', value: this.sharedInput() },
    { label: 'Default — B', value: this.sharedInput() },
  ]);

  protected readonly onpushNodes = computed(() => [
    { label: 'OnPush — C', value: this.sharedInput() },
    { label: 'OnPush — D', value: this.sharedInput() },
  ]);

  protected localEvent(): void {
    console.log('[CD] Local event — parentCounter updated');
    this.parentCounter.update((n) => n + 1);
  }

  protected asyncUpdate(): void {
    console.log('[CD] setTimeout scheduled — signal write in 500 ms (zoneless: сам таймер CD не запускает)');
    setTimeout(() => {
      console.log('[CD] setTimeout fired — parentCounter.update() планирует CD-проход');
      this.parentCounter.update((n) => n + 1);
    }, 500);
  }

  protected setSignalInput(): void {
    console.log('[CD] Set signal input — sharedInput updated');
    this.sharedInput.update((n) => n + 1);
  }
}
