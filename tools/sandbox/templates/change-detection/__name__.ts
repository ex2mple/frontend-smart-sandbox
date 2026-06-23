import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  signal,
} from '@angular/core';

// ─── Default child ────────────────────────────────────────────────────────────

@Component({
  selector: 'cd-node-default',
  changeDetection: ChangeDetectionStrategy.Default,
  template: `
    <div
      class="cd-node"
      [class.flash]="flashing"
      [attr.aria-label]="'Default node, checked ' + checkCount + ' times, value ' + value()"
    >
      <span class="badge badge-default">Default</span>
      <div class="node-label">{{ label() }}</div>
      <div class="node-value">value: {{ value() }}</div>
      <div class="check-count">checked {{ renderStamp() }} times</div>
    </div>
  `,
})
export class CdNodeDefault {
  readonly label = input<string>('');
  readonly value = input<number>(0);

  checkCount = 0;
  flashing = false;

  private flashTimer: ReturnType<typeof setTimeout> | null = null;

  renderStamp(): number {
    this.checkCount++;
    // Trigger a brief flash class on each check
    if (this.flashTimer !== null) {
      clearTimeout(this.flashTimer);
    }
    this.flashing = true;
    this.flashTimer = setTimeout(() => {
      this.flashing = false;
      this.flashTimer = null;
    }, 180);
    return this.checkCount;
  }
}

// ─── OnPush child ─────────────────────────────────────────────────────────────

@Component({
  selector: 'cd-node-onpush',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="cd-node"
      [class.flash]="flashing"
      [attr.aria-label]="'OnPush node, checked ' + checkCount + ' times, value ' + value()"
    >
      <span class="badge badge-onpush">OnPush</span>
      <div class="node-label">{{ label() }}</div>
      <div class="node-value">value: {{ value() }}</div>
      <div class="check-count">checked {{ renderStamp() }} times</div>
    </div>
  `,
})
export class CdNodeOnPush {
  readonly label = input<string>('');
  readonly value = input<number>(0);

  checkCount = 0;
  flashing = false;

  private flashTimer: ReturnType<typeof setTimeout> | null = null;

  renderStamp(): number {
    this.checkCount++;
    if (this.flashTimer !== null) {
      clearTimeout(this.flashTimer);
    }
    this.flashing = true;
    this.flashTimer = setTimeout(() => {
      this.flashing = false;
      this.flashTimer = null;
    }, 180);
    return this.checkCount;
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
    console.log('[CD] setTimeout scheduled — will fire in 500 ms');
    setTimeout(() => {
      console.log('[CD] setTimeout fired — parentCounter updated');
      this.parentCounter.update((n) => n + 1);
    }, 500);
  }

  protected setSignalInput(): void {
    console.log('[CD] Set signal input — sharedInput updated');
    this.sharedInput.update((n) => n + 1);
  }
}
