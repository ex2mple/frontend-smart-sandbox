import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';

@Component({
  selector: '{{selector}}-details',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './details.html',
  styleUrl: './details.less',
})
export class {{className}}Details {
  protected readonly rating = signal(3);
  protected readonly stars = computed(() =>
    Array.from({ length: 5 }, (_, i) => i < this.rating())
  );

  protected setRating(value: number): void {
    this.rating.set(value);
  }
}
