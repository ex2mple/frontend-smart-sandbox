import { ChangeDetectionStrategy, Component, signal } from '@angular/core';

@Component({
  selector: '{{selector}}-overview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './overview.html',
  styleUrl: './overview.less',
})
export class {{className}}Overview {
  protected readonly visits = signal(0);

  protected recordVisit(): void {
    this.visits.update((n) => n + 1);
  }
}
