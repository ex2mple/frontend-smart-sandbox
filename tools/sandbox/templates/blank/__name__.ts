import { ChangeDetectionStrategy, Component, signal } from '@angular/core';

@Component({
  selector: '{{selector}}',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './{{name}}.html',
  styleUrl: './{{name}}.less',
})
export class {{className}} {
  protected readonly count = signal(0);

  protected increment(): void {
    this.count.update((n) => n + 1);
  }
}
