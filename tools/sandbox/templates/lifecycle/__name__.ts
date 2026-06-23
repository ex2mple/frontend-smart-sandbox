import {
  AfterContentChecked,
  AfterContentInit,
  AfterViewChecked,
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  DoCheck,
  Injectable,
  OnChanges,
  OnDestroy,
  OnInit,
  SimpleChanges,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';

// ─── Shared bus ───────────────────────────────────────────────────────────────

export type HookCategory = 'init-change' | 'content' | 'view' | 'destroy';

export interface LogEvent {
  seq: number;
  hook: string;
  detail: string;
  category: HookCategory;
}

@Injectable({ providedIn: 'root' })
export class LifecycleBus {
  private readonly _events = signal<LogEvent[]>([]);
  private _seq = 0;

  readonly events = this._events.asReadonly();

  add(hook: string, detail: string, category: HookCategory): void {
    const entry: LogEvent = { seq: ++this._seq, hook, detail, category };
    this._events.update((list) => [...list, entry]);
    console.log(`[lifecycle #${entry.seq}] ${hook}${detail ? ' — ' + detail : ''}`);
  }

  clear(): void {
    this._events.set([]);
    this._seq = 0;
    console.info('[lifecycle] timeline cleared');
  }
}

// ─── Category labels ──────────────────────────────────────────────────────────

const CATEGORY_LABEL: Record<HookCategory, string> = {
  'init-change': 'Init / Change',
  content: 'Content',
  view: 'View',
  destroy: 'Destroy',
};

// ─── Child component ──────────────────────────────────────────────────────────

@Component({
  selector: 'lc-child',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="lc-child" role="region" aria-label="Child component">
      <span class="lc-child-label">Child component</span>
      <span class="lc-child-value" aria-live="polite">
        inputValue = <strong>{{ inputValue() }}</strong>
      </span>
    </div>
  `,
})
export class LifecycleChild
  implements
    OnChanges,
    OnInit,
    DoCheck,
    AfterContentInit,
    AfterContentChecked,
    AfterViewInit,
    AfterViewChecked,
    OnDestroy
{
  readonly inputValue = input<number>(0);

  private readonly bus = inject(LifecycleBus);

  ngOnChanges(changes: SimpleChanges): void {
    const changed = Object.keys(changes)
      .map((k) => `${k}: ${changes[k].previousValue} → ${changes[k].currentValue}`)
      .join(', ');
    this.bus.add('ngOnChanges', changed, 'init-change');
  }

  ngOnInit(): void {
    this.bus.add('ngOnInit', '', 'init-change');
  }

  ngDoCheck(): void {
    this.bus.add('ngDoCheck', '', 'init-change');
  }

  ngAfterContentInit(): void {
    this.bus.add('ngAfterContentInit', '', 'content');
  }

  ngAfterContentChecked(): void {
    this.bus.add('ngAfterContentChecked', '', 'content');
  }

  ngAfterViewInit(): void {
    this.bus.add('ngAfterViewInit', '', 'view');
  }

  ngAfterViewChecked(): void {
    this.bus.add('ngAfterViewChecked', '', 'view');
  }

  ngOnDestroy(): void {
    this.bus.add('ngOnDestroy', '', 'destroy');
  }
}

// ─── Main component ───────────────────────────────────────────────────────────

@Component({
  selector: '{{selector}}',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './{{name}}.html',
  styleUrl: './{{name}}.less',
  imports: [LifecycleChild],
})
export class {{className}} {
  private readonly bus = inject(LifecycleBus);

  protected readonly events = this.bus.events;
  protected readonly childMounted = signal(false);
  protected readonly childInput = signal(0);

  protected readonly groupedCount = computed(() => {
    const cats: Record<HookCategory, number> = {
      'init-change': 0,
      content: 0,
      view: 0,
      destroy: 0,
    };
    for (const e of this.events()) cats[e.category]++;
    return cats;
  });

  protected readonly categoryLabel = CATEGORY_LABEL;

  protected toggleChild(): void {
    this.childMounted.update((v) => !v);
  }

  protected incrementInput(): void {
    this.childInput.update((n) => n + 1);
  }

  protected clearTimeline(): void {
    this.bus.clear();
  }

  protected trackBySeq(_: number, e: LogEvent): number {
    return e.seq;
  }
}
